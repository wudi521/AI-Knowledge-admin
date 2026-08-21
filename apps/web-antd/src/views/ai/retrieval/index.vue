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

defineOptions({ name: 'AiRetrieval' });

const route = useRoute();

/** 检索输入 */
const query = ref('');
const kbIds = ref<number[]>([]); // 选中的知识库(空 = 全部可见)
const loading = ref(false);

/** 证据评估(单接口: 内部含检索+判定+生成, 双回答者收敛后答案与检索诊断均由评估响应透传) */
const evidenceResult = ref<AiEvidenceApi.EvaluateResp | null>(null);
const expandedEvidence = ref<Set<number>>(new Set()); // 展开的证据 chunkId

/** 被冲突引用的证据索引集合(用于红色边框高亮) */
const conflictIndexes = computed(() => {
  const set = new Set<number>();
  for (const conflict of evidenceResult.value?.conflicts || []) {
    set.add(conflict.evidenceIndexA);
    set.add(conflict.evidenceIndexB);
  }
  return set;
});

/** 展开/收起证据内容 */
function toggleEvidence(chunkId: number) {
  const next = new Set(expandedEvidence.value);
  if (next.has(chunkId)) {
    next.delete(chunkId);
  } else {
    next.add(chunkId);
  }
  expandedEvidence.value = next;
}

/** 知识库选项(全部可见知识库) */
const kbOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  // 预选知识库(从知识库列表「检索测试」按钮进入)
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

/** 意图 -> Tag */
const INTENT_TAG: Record<string, { color: string; text: string }> = {
  WARRANTY: { color: 'blue', text: '保修' },
  REFUND: { color: 'volcano', text: '退款' },
  LOGISTICS: { color: 'cyan', text: '物流' },
  REPAIR: { color: 'orange', text: '维修' },
  PRICE: { color: 'gold', text: '价格' },
  OTHER: { color: 'default', text: '其他' },
};

/** 当前意图(评估响应透传的语义分析意图: 知识库意图名 / 固定枚举 / OUT_OF_SCOPE) */
const intent = computed(() => {
  const matchedIntent = evidenceResult.value?.analysis?.intent;
  if (!matchedIntent) {
    return null;
  }
  if (matchedIntent === 'OUT_OF_SCOPE') {
    return { color: 'error', text: '超出知识库范围' };
  }
  return INTENT_TAG[matchedIntent] || { color: 'default', text: matchedIntent };
});

/** 通道徽标颜色 */
const CHANNEL_COLOR: Record<string, string> = {
  bm25: 'blue',
  vector: 'green',
  fused: 'purple',
};

/** 证据评估(单接口: 内部含检索召回+判定+生成; 双回答者收敛后检索诊断由评估响应透传) */
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
/** HTML 转义(先转义再高亮, 防 XSS) */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 分数保留 2 位 */
function formatScore(score?: number): string {
  return score == null ? '-' : score.toFixed(2);
}

/** AI 总结渲染: 先转义, 再把 [C1][C2] 引用编号美化(防 XSS) */
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
      <!-- 检索栏 -->
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query"
          class="w-96"
          placeholder="输入检索内容, 如: 保修期多久"
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
        <Button
          type="primary"
          :loading="loading"
          @click="handleSearch"
        >
          检索评估
        </Button>
        <span
          v-if="loading"
          class="text-xs text-muted-foreground"
        >
          评估中…含检索+判定+多轮 AI 验证, 约需 10~60 秒
        </span>
      </div>

      <!-- 检索诊断区(意图/实体/改写/子问题/通道统计; 评估响应透传) -->
      <div
        v-if="evidenceResult?.analysis || evidenceResult?.channels"
        class="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">意图:</span>
          <Tag v-if="intent" :color="intent.color">
            {{ intent.text }}
          </Tag>
          <Tag v-if="!intent" color="default">未识别</Tag>
          <span
            v-if="evidenceResult?.channels"
            class="ml-auto text-xs text-muted-foreground"
          >
            通道统计: BM25 召回 {{ evidenceResult.channels.bm25 ?? 0 }} /
            向量召回 {{ evidenceResult.channels.vector ?? 0 }} /
            融合 {{ evidenceResult.channels.fused ?? 0 }}
          </span>
        </div>
        <div v-if="evidenceResult?.analysis?.entities?.length" class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">实体:</span>
          <Tag v-for="entity in evidenceResult.analysis.entities" :key="entity">
            {{ entity }}
          </Tag>
        </div>
        <div v-if="evidenceResult?.analysis?.rewrites?.length" class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">改写变体:</span>
          <Tag v-for="rewrite in evidenceResult.analysis.rewrites" :key="rewrite" color="processing">
            {{ rewrite }}
          </Tag>
        </div>
        <div
          v-if="evidenceResult?.analysis?.subQuestions?.length"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-sm text-muted-foreground">子问题:</span>
          <Tag v-for="question in evidenceResult.analysis.subQuestions" :key="question" color="cyan">
            {{ question }}
          </Tag>
        </div>
        <div
          v-if="evidenceResult?.analysis && !evidenceResult.analysis.success"
          class="text-xs text-muted-foreground"
        >
          语义分析未成功, 已直接走关键词检索
        </div>
      </div>

      <!-- 产品不匹配拒绝作答(结构化门禁, 评估响应透传) -->
      <Card
        v-if="evidenceResult && evidenceResult.answerable === false && (evidenceResult.refusalReason || '').includes('产品')"
        size="small"
        class="mb-4 border-red-500/50 bg-red-50/60 dark:bg-red-950/20"
      >
        <div class="mb-1 flex items-center gap-2">
          <span class="text-sm font-bold">无法回答</span>
          <Tag color="error">产品/品牌不匹配</Tag>
        </div>
        <div class="leading-6 text-card-foreground">{{ evidenceResult.refusalReason }}</div>
      </Card>

      <!-- 证据评估判定面板(单列) -->
      <Card
        v-if="evidenceResult"
        size="small"
        class="border-border"
      >
        <template #title>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold">证据评估</span>
            <span
              v-if="evidenceResult.traceId"
              class="font-mono text-xs text-muted-foreground"
            >
              {{ evidenceResult.traceId }}
            </span>
            <span
              v-if="evidenceResult.elapsedMs != null"
              class="ml-auto text-xs text-muted-foreground"
            >
              耗时 {{ evidenceResult.elapsedMs }} ms
            </span>
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            答案统一由证据管线生成(检索召回 + 充分性判定 + Claim 逐句验证), 与对话工作台同链路
          </div>
          <div
            v-if="evidenceResult.query"
            class="mt-1 truncate text-xs text-muted-foreground"
          >
            评估查询: {{ evidenceResult.query }}
          </div>
        </template>

        <div class="flex flex-col gap-3">
          <!-- a. 充分性判定 -->
          <div
            class="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">充分性判定</span>
              <Tag v-if="evidenceResult.answerable" color="success">
                可作答
              </Tag>
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
                :percent="Math.min(
                  100,
                  Math.max(0, Math.round(evidenceResult.confidence * 100)),
                )"
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

          <!-- b. 冲突区 -->
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
                  证据 #{{ conflict.evidenceIndexA }} ↔
                  #{{ conflict.evidenceIndexB }}: {{ conflict.reason }}
                </div>
              </div>
            </template>
          </Alert>

          <!-- c. Claim 逐句 -->
          <template v-if="evidenceResult.claims && evidenceResult.claims.length > 0">
            <Alert
              v-if="evidenceResult.claimFail"
              type="error"
              show-icon
              message="回答未能通过证据验证, 已禁止输出"
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
              <span
                class="flex-1 break-all text-sm leading-6 text-card-foreground"
              >
                {{ claim.text }}
              </span>
              <span
                class="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-xs text-blue-600 dark:text-blue-400"
              >
                → 证据[#{{ claim.evidenceIndex }}]
              </span>
            </div>
          </template>

          <!-- d. 回答 -->
          <div
            v-if="evidenceResult.answer"
            class="rounded-lg border border-blue-500/40 bg-blue-50/50 p-3 dark:bg-blue-950/20"
          >
            <div class="mb-1 flex items-center gap-2">
              <span class="text-sm font-bold">回答</span>
              <Tag color="blue">基于证据生成</Tag>
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              class="whitespace-pre-wrap break-all text-sm leading-6 text-card-foreground"
              v-html="renderAnswer(evidenceResult.answer)"
            ></div>
            <div class="mt-1 text-xs text-muted-foreground">
              引用编号 [C1][C2]… 对应下方证据列表顺序
            </div>
          </div>

          <!-- e. 证据列表 -->
          <template v-if="evidenceResult.evidence.length > 0">
            <div class="text-sm font-medium">
              证据列表 ({{ evidenceResult.evidence.length }})
            </div>
            <Card
              v-for="(item, index) in evidenceResult.evidence"
              :key="item.chunkId"
              size="small"
              :class="
                conflictIndexes.has(index)
                  ? 'border-red-500/60'
                  : 'border-border'
              "
            >
              <template #title>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-sm">#{{ item.chunkId }}</span>
                  <span class="font-medium">{{ item.documentName || '-' }}</span>
                  <Tag v-if="item.versionNo" color="default">
                    {{ item.versionNo }}
                  </Tag>
                  <span class="ml-auto text-sm text-muted-foreground">
                    得分 {{ formatScore(item.score) }}
                  </span>
                </div>
              </template>
              <div class="flex flex-col gap-2">
                <div
                  class="whitespace-pre-wrap break-all text-sm leading-6"
                  :class="
                    expandedEvidence.has(item.chunkId) ? '' : 'line-clamp-3'
                  "
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
          <div
            v-else
            class="py-6 text-center text-muted-foreground"
          >
            未检索到相关证据
          </div>
        </div>
      </Card>
    </div>
  </Page>
</template>
