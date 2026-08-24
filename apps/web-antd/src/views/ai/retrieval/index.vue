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

import { evaluateEvidence } from '#/api/ai/evidence';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';
import QueryExecutionInspector from '../components/QueryExecutionInspector.vue';

defineOptions({ name: 'AiRetrieval' });

const route = useRoute();

const query = ref('');
const kbIds = ref<number[]>([]);
const loading = ref(false);

/** 单轮知识搜索，与聊天共用服务端 Query Planner / Evidence 执行内核。 */
const evidenceResult = ref<AiEvidenceApi.EvaluateResp | null>(null);
const expandedEvidence = ref<Set<number>>(new Set());

const conflictIndexes = computed(() => {
  const set = new Set<number>();
  for (const conflict of evidenceResult.value?.conflicts || []) {
    set.add(conflict.evidenceIndexA);
    set.add(conflict.evidenceIndexB);
  }
  return set;
});

function toggleEvidence(chunkId: number) {
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

async function handleSearch() {
  const keyword = query.value.trim();
  if (!keyword) {
    message.warning('请输入检索内容');
    return;
  }
  loading.value = true;
  evidenceResult.value = null;
  expandedEvidence.value = new Set();
  const params = {
    query: keyword,
    kbIds: kbIds.value.length > 0 ? kbIds.value : undefined,
  };
  try {
    evidenceResult.value = await evaluateEvidence({ ...params, topK: 8 });
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

function formatScore(score?: number): string {
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
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query"
          class="w-96"
          placeholder="输入检索内容，如：包含“磁涌”的专利，把申请号和公布号列出来"
          allow-clear
          @press-enter="handleSearch"
        />
        <Select
          v-model:value="kbIds"
          class="w-64"
          mode="multiple"
          :options="kbOptions"
          placeholder="全部可见知识库"
          allow-clear
        />
        <Button type="primary" :loading="loading" @click="handleSearch">
          检索评估
        </Button>
        <span v-if="loading" class="text-xs text-muted-foreground">
          正在执行统一查询计划…
        </span>
      </div>

      <!-- Query Planner / 总览 -->
      <div
        v-if="evidenceResult"
        class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">执行总览</span>
          <span class="ml-2 text-sm text-muted-foreground">主路由:</span>
          <Tag color="blue">{{ evidenceResult.route || 'UNKNOWN' }}</Tag>
          <span class="text-sm text-muted-foreground">执行模式:</span>
          <Tag color="purple">{{ evidenceResult.executionMode || 'DEFAULT_RAG' }}</Tag>
          <span class="text-sm text-muted-foreground">意图:</span>
          <Tag v-if="intent" :color="intent.color">{{ intent.text }}</Tag>
          <Tag v-else color="default">未识别</Tag>
          <span class="ml-auto text-xs text-muted-foreground">
            总耗时 {{ evidenceResult.elapsedMs ?? '-' }} ms
          </span>
        </div>

        <div class="rounded-md border border-border bg-background/70 p-3 text-sm leading-6">
          <div><b>用户问题：</b>{{ evidenceResult.query }}</div>
          <div v-if="evidenceResult.answer"><b>最终回答：</b>{{ evidenceResult.answer }}</div>
          <div v-else-if="evidenceResult.refusalReason">
            <b>最终结果：</b>{{ evidenceResult.refusalReason }}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span v-if="evidenceResult.channels">
            BM25 {{ evidenceResult.channels.bm25 ?? 0 }} /
            向量 {{ evidenceResult.channels.vector ?? 0 }} /
            融合 {{ evidenceResult.channels.fused ?? 0 }}
          </span>
          <Tag v-if="evidenceResult.reasonCode" color="warning">
            {{ evidenceResult.reasonCode }}
          </Tag>
          <span v-if="evidenceResult.analysis?.entities?.length">
            实体：{{ evidenceResult.analysis.entities.join('、') }}
          </span>
        </div>
      </div>

      <!-- 第一版 Query Execution Inspector：逐节点看输入/输出 -->
      <Card v-if="evidenceResult" size="small" class="border-border">
        <template #title>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-semibold">查询执行回放</div>
              <div class="mt-1 text-xs font-normal text-muted-foreground">
                展开每个节点查看：本阶段收到什么、实际得到什么、为什么跳过/失败。
                不展示隐藏思维链、系统 Prompt 或 embedding 浮点值。
              </div>
            </div>
            <span v-if="evidenceResult.traceId" class="font-mono text-xs text-muted-foreground">
              {{ evidenceResult.traceId }}
            </span>
          </div>
        </template>
        <QueryExecutionInspector :stages="evidenceResult.stages" />
      </Card>

      <Card
        v-if="evidenceResult && evidenceResult.answerable === false && (evidenceResult.refusalReason || '').includes('产品')"
        size="small"
        class="border-red-500/50 bg-red-50/60 dark:bg-red-950/20"
      >
        <div class="mb-1 flex items-center gap-2">
          <span class="text-sm font-bold">无法回答</span>
          <Tag color="error">产品/品牌不匹配</Tag>
        </div>
        <div class="leading-6 text-card-foreground">
          {{ evidenceResult.refusalReason }}
        </div>
      </Card>

      <Card v-if="evidenceResult" size="small" class="border-border">
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold">结果与证据</span>
            <span
              v-if="evidenceResult.elapsedMs != null"
              class="ml-auto text-xs text-muted-foreground"
            >
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
              <Tag v-if="evidenceResult.consultable" color="processing">
                可转人工咨询
              </Tag>
            </div>
            <div
              v-if="evidenceResult.confidence != null"
              class="flex items-center gap-2"
            >
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
            v-if="evidenceResult.conflicts.length > 0"
            type="error"
            show-icon
            :message="`检测到 ${evidenceResult.conflicts.length} 处证据冲突`"
          >
            <template #description>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(conflict, index) in evidenceResult.conflicts"
                  :key="index"
                  class="text-sm"
                >
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
              <Tag
                :color="claim.verdict === 'SUPPORTED' ? 'success' : 'error'"
                class="shrink-0"
              >
                {{ claim.verdict === 'SUPPORTED' ? '✓ 支持' : '✗ 不支持' }}
              </Tag>
              <span class="flex-1 break-all text-sm leading-6 text-card-foreground">
                {{ claim.text }}
              </span>
              <span
                class="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-xs text-blue-600 dark:text-blue-400"
              >
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
              <Tag color="blue">统一查询链</Tag>
            </div>
            <div
              class="whitespace-pre-wrap break-all text-sm leading-6 text-card-foreground"
              v-html="renderAnswer(evidenceResult.answer)"
            ></div>
          </div>

          <template v-if="evidenceResult.evidence.length > 0">
            <div class="text-sm font-medium">
              证据列表 ({{ evidenceResult.evidence.length }})
            </div>
            <Card
              v-for="(item, index) in evidenceResult.evidence"
              :key="item.chunkId"
              size="small"
              :class="conflictIndexes.has(index) ? 'border-red-500/60' : 'border-border'"
            >
              <template #title>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-sm">#{{ item.chunkId }}</span>
                  <span class="font-medium">{{ item.documentName || '-' }}</span>
                  <Tag v-if="item.versionNo" color="default">{{ item.versionNo }}</Tag>
                  <span class="ml-auto text-sm text-muted-foreground">
                    得分 {{ formatScore(item.score) }}
                  </span>
                </div>
              </template>
              <div class="flex flex-col gap-2">
                <div
                  class="whitespace-pre-wrap break-all text-sm leading-6"
                  :class="expandedEvidence.has(item.chunkId) ? '' : 'line-clamp-3'"
                >
                  {{ item.content }}
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>证据索引 #{{ index }}</span>
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
          <div v-else class="py-6 text-center text-muted-foreground">
            未检索到相关证据
          </div>
        </div>
      </Card>
    </div>
  </Page>
</template>
