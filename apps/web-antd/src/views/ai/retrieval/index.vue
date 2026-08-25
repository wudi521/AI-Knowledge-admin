<script lang="ts" setup>
import type { AiEvidenceApi } from '#/api/ai/evidence';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Progress,
  Select,
  Tag,
} from 'ant-design-vue';

import {
  evaluateEvidence,
  evaluateEvidenceAgentV1,
  evaluateEvidenceV3,
  getAgentTrace,
} from '#/api/ai/evidence';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';
import QueryExecutionInspector from '../components/QueryExecutionInspector.vue';

defineOptions({ name: 'AiRetrieval' });

const route = useRoute();

const query = ref('');
const kbIds = ref<number[]>([]);
const loading = ref(false);
const replayLoading = ref(false);
const evaluateMode = ref<AiEvidenceApi.EvaluateMode>('AGENT_V1');

const evidenceResult = ref<AiEvidenceApi.EvaluateResp | null>(null);
const replayStages = ref<AiEvidenceApi.StageTiming[]>([]);
const expandedEvidence = ref<Set<number>>(new Set());

const modeOptions = [
  { label: '强制 Agent V1.1（本轮重点）', value: 'AGENT_V1' },
  { label: '默认服务端路由', value: 'DEFAULT' },
  { label: '强制 V3（对照基线）', value: 'V3' },
];

const quickCases = [
  {
    label: 'A 精确字段',
    query: '申请号 202311832214.0 的公布号是什么？',
  },
  {
    label: 'B 名称相近',
    query: '现在专利库里面有名称相近的专利吗？',
  },
  {
    label: 'C 专利总数',
    query: '现在专利库里面一共有多少个专利？',
  },
  {
    label: 'D 不存在申请号',
    query: '申请号 999999999999.9 的公布号是什么？',
  },
];

const conflictIndexes = computed(() => {
  const set = new Set<number>();
  for (const conflict of evidenceResult.value?.conflicts || []) {
    set.add(conflict.evidenceIndexA);
    set.add(conflict.evidenceIndexB);
  }
  return set;
});

const responseStageCount = computed(
  () => evidenceResult.value?.stages?.length || 0,
);
const replayConsistent = computed(() => {
  if (!replayStages.value.length || !evidenceResult.value?.stages?.length) return null;
  const response = evidenceResult.value.stages.map((item) => item.stage).join('|');
  const persisted = replayStages.value.map((item) => item.stage).join('|');
  return response === persisted;
});

function evidenceKey(item: AiEvidenceApi.EvidenceItem, index: number) {
  return item.evidenceId ?? item.chunkId ?? item.documentId ?? `e-${index}`;
}

function toggleEvidence(chunkId?: null | number) {
  if (chunkId == null) return;
  const next = new Set(expandedEvidence.value);
  if (next.has(chunkId)) next.delete(chunkId);
  else next.add(chunkId);
  expandedEvidence.value = next;
}

const kbOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  const initialKbId = Number(route.query.kbId);
  try {
    const data = await getKnowledgeBasePage({ pageNo: 1, pageSize: 100 });
    kbOptions.value = (data.list || []).map((item) => ({
      label: item.name,
      value: item.id as number,
    }));
    if (
      initialKbId &&
      kbOptions.value.some((option) => option.value === initialKbId)
    ) {
      kbIds.value = [initialKbId];
    }
  } catch {
    message.error('知识库列表加载失败');
  }
});

const INTENT_TAG: Record<string, { color: string; text: string }> = {
  WARRANTY: { color: 'blue', text: '保修' },
  REFUND: { color: 'volcano', text: '退款' },
  LOGISTICS: { color: 'cyan', text: '物流' },
  REPAIR: { color: 'orange', text: '维修' },
  PRICE: { color: 'gold', text: '价格' },
  OTHER: { color: 'default', text: '其他' },
};

const intent = computed(() => {
  const matchedIntent =
    evidenceResult.value?.intent || evidenceResult.value?.analysis?.intent;
  if (!matchedIntent) return null;
  if (matchedIntent === 'OUT_OF_SCOPE') {
    return { color: 'error', text: '超出知识库范围' };
  }
  return INTENT_TAG[matchedIntent] || { color: 'default', text: matchedIntent };
});

const CHANNEL_COLOR: Record<string, string> = {
  bm25: 'blue',
  vector: 'green',
  fused: 'purple',
  exact_text: 'cyan',
};

function applyQuickCase(value: string) {
  query.value = value;
}

async function loadReplayTrace(showError = true) {
  const traceId = evidenceResult.value?.traceId;
  if (!traceId) return;
  replayLoading.value = true;
  try {
    replayStages.value = await getAgentTrace(traceId);
  } catch {
    replayStages.value = [];
    if (showError) message.error('持久化 Trace 回放失败，请确认已执行 V1.1 migration');
  } finally {
    replayLoading.value = false;
  }
}

async function handleSearch() {
  const keyword = query.value.trim();
  if (!keyword) {
    message.warning('请输入检索内容');
    return;
  }
  if (evaluateMode.value === 'AGENT_V1' && kbIds.value.length !== 1) {
    message.warning('强制 Agent V1.1 当前要求只选择 1 个知识库');
    return;
  }

  loading.value = true;
  evidenceResult.value = null;
  replayStages.value = [];
  expandedEvidence.value = new Set();
  const params: AiEvidenceApi.EvaluateReq = {
    query: keyword,
    kbIds: kbIds.value.length > 0 ? kbIds.value : undefined,
    topK: 8,
  };

  try {
    if (evaluateMode.value === 'AGENT_V1') {
      evidenceResult.value = await evaluateEvidenceAgentV1(params);
    } else if (evaluateMode.value === 'V3') {
      evidenceResult.value = await evaluateEvidenceV3(params);
    } else {
      evidenceResult.value = await evaluateEvidence(params);
    }
    await loadReplayTrace(false);
  } catch {
    message.error('检索/评估失败');
  } finally {
    loading.value = false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatScore(score?: null | number): string {
  return score == null ? '-' : score.toFixed(2);
}

function renderAnswer(answer?: string): string {
  const safe = escapeHtml(answer || '');
  return safe.replace(
    /\[C(\d+)\]/g,
    (_m, num: string) =>
      `<span class="mx-0.5 rounded bg-blue-500/15 px-1 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">[C${num}]</span>`,
  );
}
</script>

<template>
  <Page auto-content-height>
    <div class="flex flex-col gap-4 p-4">
      <Alert
        type="info"
        show-icon
        message="Agentic RAG V1.1 回归控制台"
        description="本轮建议固定选择一个专利知识库，先用“强制 Agent V1.1”跑 A/B/C/D 四条，再切“强制 V3”跑相同问题做对照。"
      />

      <div class="flex flex-wrap items-center gap-3">
        <Select
          v-model:value="evaluateMode"
          class="w-64"
          :options="modeOptions"
        />
        <Select
          v-model:value="kbIds"
          class="w-64"
          mode="multiple"
          :options="kbOptions"
          placeholder="选择知识库（Agent V1.1 请选择 1 个）"
          allow-clear
        />
        <Input
          v-model:value="query"
          class="min-w-80 flex-1"
          placeholder="输入测试问题"
          allow-clear
          @press-enter="handleSearch"
        />
        <Button type="primary" :loading="loading" @click="handleSearch">
          执行测试
        </Button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">首轮回归：</span>
        <Button
          v-for="item in quickCases"
          :key="item.label"
          size="small"
          @click="applyQuickCase(item.query)"
        >
          {{ item.label }}
        </Button>
        <span v-if="loading" class="ml-2 text-xs text-muted-foreground">
          正在执行 {{ evaluateMode }}…
        </span>
      </div>

      <div
        v-if="evidenceResult"
        class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">执行总览</span>
          <Tag color="geekblue">测试入口：{{ evaluateMode }}</Tag>
          <span class="text-sm text-muted-foreground">主路由:</span>
          <Tag color="blue">{{ evidenceResult.route || 'UNKNOWN' }}</Tag>
          <span class="text-sm text-muted-foreground">执行模式:</span>
          <Tag color="purple">{{ evidenceResult.executionMode || 'DEFAULT_RAG' }}</Tag>
          <span class="text-sm text-muted-foreground">意图:</span>
          <Tag v-if="intent" :color="intent.color">{{ intent.text }}</Tag>
          <Tag v-else color="default">未识别/不依赖 Intent</Tag>
          <span class="ml-auto text-xs text-muted-foreground">
            总耗时 {{ evidenceResult.elapsedMs ?? '-' }} ms
          </span>
        </div>

        <div class="rounded-md border border-border bg-background/70 p-3 text-sm leading-6">
          <div><b>用户问题：</b>{{ evidenceResult.query }}</div>
          <div><b>TraceId：</b><span class="font-mono">{{ evidenceResult.traceId }}</span></div>
          <div v-if="evidenceResult.answer"><b>最终回答：</b>{{ evidenceResult.answer }}</div>
          <div v-else-if="evidenceResult.clarifyQuestion">
            <b>需要补充：</b>{{ evidenceResult.clarifyQuestion }}
          </div>
          <div v-else-if="evidenceResult.refusalReason">
            <b>最终结果：</b>{{ evidenceResult.refusalReason }}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Tag :color="evidenceResult.answerable ? 'success' : 'error'">
            {{ evidenceResult.answerable ? 'answerable=true' : 'answerable=false' }}
          </Tag>
          <Tag v-if="evidenceResult.confidence == null" color="default">
            confidence=null（V1.1 正常）
          </Tag>
          <Tag v-if="evidenceResult.reasonCode" color="warning">
            reason={{ evidenceResult.reasonCode }}
          </Tag>
          <span v-if="evidenceResult.channels">
            BM25 {{ evidenceResult.channels.bm25 ?? 0 }} /
            向量 {{ evidenceResult.channels.vector ?? 0 }} /
            融合 {{ evidenceResult.channels.fused ?? 0 }}
          </span>
          <span v-if="evidenceResult.analysis?.entities?.length">
            实体：{{ evidenceResult.analysis.entities.join('、') }}
          </span>
        </div>

        <div
          v-if="evidenceResult.structuredResult"
          class="rounded-md border border-border bg-background/70 p-3 text-xs leading-6"
        >
          <b>结构化结果：</b>
          type={{ evidenceResult.structuredResult.queryType || '-' }}，
          scope={{ evidenceResult.structuredResult.scopeType || '-' }}，
          entityCount={{ evidenceResult.structuredResult.entityCount ?? '-' }}，
          entityIds={{ (evidenceResult.structuredResult.entityIds || []).join(', ') || '-' }}
        </div>
      </div>

      <Card v-if="evidenceResult" size="small" class="border-border">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-semibold">本次响应 Trace</div>
              <div class="mt-1 text-xs font-normal text-muted-foreground">
                这是接口当次返回的 stages，用来检查 Planner → Capability → Guard → Answer/Stop。
              </div>
            </div>
            <Tag color="blue">{{ responseStageCount }} steps</Tag>
          </div>
        </template>
        <QueryExecutionInspector :stages="evidenceResult.stages" />
      </Card>

      <Card v-if="evidenceResult?.traceId" size="small" class="border-border">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-semibold">数据库持久化 Trace 回放</div>
              <div class="mt-1 text-xs font-normal text-muted-foreground">
                从 ai_query_trace_stage 按 traceId 重新读取；用于验证刷新后仍能复盘。
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Tag
                v-if="replayConsistent !== null"
                :color="replayConsistent ? 'success' : 'error'"
              >
                {{ replayConsistent ? '与响应 stages 一致' : '与响应 stages 不一致' }}
              </Tag>
              <Button size="small" :loading="replayLoading" @click="loadReplayTrace(true)">
                重新读取回放
              </Button>
            </div>
          </div>
        </template>
        <QueryExecutionInspector v-if="replayStages.length" :stages="replayStages" />
        <div v-else class="py-4 text-center text-sm text-muted-foreground">
          暂未读取到持久化 stages。若 Agent 已成功执行，请确认迁移 SQL 已执行。
        </div>
      </Card>

      <Card v-if="evidenceResult" size="small" class="border-border">
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold">结果与证据</span>
            <span v-if="evidenceResult.elapsedMs != null" class="ml-auto text-xs text-muted-foreground">
              耗时 {{ evidenceResult.elapsedMs }} ms
            </span>
          </div>
        </template>

        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">充分性判定</span>
              <Tag v-if="evidenceResult.answerable" color="success">可作答</Tag>
              <Tag v-else color="error">拒绝作答</Tag>
              <Tag v-if="evidenceResult.consultable" color="processing">可转人工咨询</Tag>
            </div>
            <div v-if="evidenceResult.confidence != null" class="flex items-center gap-2">
              <span class="shrink-0 text-xs text-muted-foreground">
                置信度 {{ Math.round(evidenceResult.confidence * 100) }}%
              </span>
              <Progress
                class="flex-1"
                :percent="Math.min(100, Math.max(0, Math.round(evidenceResult.confidence * 100)))"
                size="small"
                :status="evidenceResult.answerable ? 'normal' : 'exception'"
              />
            </div>
            <div
              v-if="!evidenceResult.answerable && evidenceResult.refusalReason"
              class="text-sm leading-6 text-card-foreground"
            >
              {{ evidenceResult.refusalReason }}
            </div>
          </div>

          <Alert
            v-if="(evidenceResult.conflicts || []).length > 0"
            type="error"
            show-icon
            :message="`检测到 ${evidenceResult.conflicts.length} 处证据冲突`"
          >
            <template #description>
              <div class="flex flex-col gap-1">
                <div v-for="(conflict, index) in evidenceResult.conflicts" :key="index" class="text-sm">
                  证据 #{{ conflict.evidenceIndexA }} ↔ #{{ conflict.evidenceIndexB }}:
                  {{ conflict.reason }}
                </div>
              </div>
            </template>
          </Alert>

          <template v-if="evidenceResult.claims && evidenceResult.claims.length > 0">
            <Alert
              v-if="evidenceResult.claimFail"
              type="error"
              show-icon
              message="回答未能通过证据验证，已禁止输出"
            />
            <div class="text-sm font-medium">Claim 逐句验证</div>
            <div
              v-for="(claim, index) in evidenceResult.claims"
              :key="index"
              class="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <Tag :color="claim.verdict === 'SUPPORTED' ? 'success' : 'error'" class="shrink-0">
                {{ claim.verdict === 'SUPPORTED' ? '✓ 支持' : '✗ 不支持' }}
              </Tag>
              <span class="flex-1 break-all text-sm leading-6 text-card-foreground">{{ claim.text }}</span>
              <span class="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-xs text-blue-600 dark:text-blue-400">
                → 证据[#{{ claim.evidenceIndex }}]
              </span>
            </div>
          </template>

          <div
            v-if="evidenceResult.answer"
            class="rounded-lg border border-blue-500/40 bg-blue-50/50 p-3 dark:bg-blue-950/20"
          >
            <div class="mb-1 flex items-center gap-2">
              <span class="text-sm font-bold">最终回答</span>
              <Tag :color="evidenceResult.executionMode === 'AGENTIC_V1' ? 'purple' : 'blue'">
                {{ evidenceResult.executionMode || '统一查询链' }}
              </Tag>
            </div>
            <div
              class="whitespace-pre-wrap break-all text-sm leading-6 text-card-foreground"
              v-html="renderAnswer(evidenceResult.answer)"
            ></div>
          </div>

          <template v-if="(evidenceResult.evidence || []).length > 0">
            <div class="text-sm font-medium">证据列表 ({{ evidenceResult.evidence.length }})</div>
            <Card
              v-for="(item, index) in evidenceResult.evidence"
              :key="evidenceKey(item, index)"
              size="small"
              :class="conflictIndexes.has(index) ? 'border-red-500/60' : 'border-border'"
            >
              <template #title>
                <div class="flex flex-wrap items-center gap-2">
                  <Tag :color="item.evidenceType === 'STRUCTURED_RESULT' ? 'purple' : 'blue'">
                    {{ item.evidenceType || 'CHUNK' }}
                  </Tag>
                  <span v-if="item.chunkId != null" class="font-mono text-sm">#{{ item.chunkId }}</span>
                  <span class="font-medium">{{ item.documentName || (item.documentId ? `documentId=${item.documentId}` : '确定性结构化结果') }}</span>
                  <Tag v-if="item.versionNo" color="default">{{ item.versionNo }}</Tag>
                  <span class="ml-auto text-sm text-muted-foreground">得分 {{ formatScore(item.score) }}</span>
                </div>
              </template>
              <div class="flex flex-col gap-2">
                <div
                  class="whitespace-pre-wrap break-all text-sm leading-6"
                  :class="item.chunkId != null && !expandedEvidence.has(item.chunkId) ? 'line-clamp-3' : ''"
                >
                  {{ item.content }}
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>证据索引 #{{ index }}</span>
                  <span v-if="item.applicationNo">申请号 {{ item.applicationNo }}</span>
                  <span v-if="item.publicationNo">公布号 {{ item.publicationNo }}</span>
                  <span v-if="item.filters">{{ item.filters }}</span>
                  <span class="ml-auto flex items-center gap-1">
                    <Tag
                      v-for="channel in item.channels || []"
                      :key="channel"
                      :color="CHANNEL_COLOR[channel] || 'default'"
                    >
                      {{ channel }}
                    </Tag>
                  </span>
                  <Button
                    v-if="item.chunkId != null"
                    type="link"
                    size="small"
                    class="!px-1"
                    @click="toggleEvidence(item.chunkId)"
                  >
                    {{ expandedEvidence.has(item.chunkId) ? '收起' : '展开' }}
                  </Button>
                </div>
              </div>
            </Card>
          </template>
          <div v-else class="py-6 text-center text-muted-foreground">未返回证据</div>
        </div>
      </Card>

      <Card v-if="evidenceResult" size="small" class="border-border">
        <template #title>
          <div>
            <div class="font-semibold">复制给开发排查</div>
            <div class="mt-1 text-xs font-normal text-muted-foreground">
              你可以直接复制下面 JSON 发给我；不需要再去浏览器 Network 找响应。
            </div>
          </div>
        </template>
        <details open>
          <summary class="cursor-pointer text-sm font-medium">evaluate 完整响应 JSON</summary>
          <pre class="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{{ JSON.stringify(evidenceResult, null, 2) }}</pre>
        </details>
        <details class="mt-3">
          <summary class="cursor-pointer text-sm font-medium">持久化 trace JSON</summary>
          <pre class="mt-2 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{{ JSON.stringify(replayStages, null, 2) }}</pre>
        </details>
      </Card>
    </div>
  </Page>
</template>
