<script lang="ts" setup>
import type { AiEvidenceApi } from '#/api/ai/evidence';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { PanelRight } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  message,
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
const traceDrawerOpen = ref(false);
const evaluateMode = ref<AiEvidenceApi.EvaluateMode>('AGENT_V1');

const evidenceResult = ref<AiEvidenceApi.EvaluateResp | null>(null);
const replayStages = ref<AiEvidenceApi.StageTiming[]>([]);
const expandedEvidence = ref<Set<string>>(new Set());

const modeOptions = [
  {
    label: '强制 Agent V1.1 · 本轮重点',
    value: 'AGENT_V1',
  },
  {
    label: '默认服务端路由',
    value: 'DEFAULT',
  },
  {
    label: '强制 V3 · 对照基线',
    value: 'V3',
  },
];

const quickCases = [
  {
    code: 'A',
    label: '精确字段',
    query: '申请号 202311832214.0 的公布号是什么？',
  },
  {
    code: 'B',
    label: '名称相近',
    query: '现在专利库里面有名称相近的专利吗？',
  },
  {
    code: 'C',
    label: '专利总数',
    query: '现在专利库里面一共有多少个专利？',
  },
  {
    code: 'D',
    label: '不存在申请号',
    query: '申请号 999999999999.9 的公布号是什么？',
  },
];

const kbOptions = ref<{ label: string; value: number }[]>([]);

const conflictIndexes = computed(() => {
  const indexes = new Set<number>();
  for (const conflict of evidenceResult.value?.conflicts || []) {
    indexes.add(conflict.evidenceIndexA);
    indexes.add(conflict.evidenceIndexB);
  }
  return indexes;
});

const responseStageCount = computed(
  () => evidenceResult.value?.stages?.length || 0,
);

const replayConsistent = computed(() => {
  const responseStages = evidenceResult.value?.stages || [];
  if (!responseStages.length || !replayStages.value.length) return null;

  const response = responseStages
    .map((item) => `${item.seq ?? ''}:${item.stage ?? ''}:${item.status ?? ''}`)
    .join('|');
  const persisted = replayStages.value
    .map((item) => `${item.seq ?? ''}:${item.stage ?? ''}:${item.status ?? ''}`)
    .join('|');
  return response === persisted;
});

const selectedModeLabel = computed(
  () =>
    modeOptions.find((item) => item.value === evaluateMode.value)?.label ||
    evaluateMode.value,
);

const modeColor = computed(() => {
  if (evaluateMode.value === 'AGENT_V1') return 'purple';
  if (evaluateMode.value === 'V3') return 'orange';
  return 'blue';
});

const statusTone = computed(() => {
  if (!evidenceResult.value) return 'default';
  if (evidenceResult.value.answerable) return 'success';
  if (evidenceResult.value.clarifyQuestion) return 'warning';
  return 'error';
});

const responseJson = computed(() =>
  evidenceResult.value ? JSON.stringify(evidenceResult.value, null, 2) : '',
);

const replayJson = computed(() => JSON.stringify(replayStages.value, null, 2));

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

function applyQuickCase(value: string) {
  query.value = value;
}

function evidenceKey(item: AiEvidenceApi.EvidenceItem, index: number) {
  return String(
    item.evidenceId ?? item.chunkId ?? item.documentId ?? `evidence-${index}`,
  );
}

function toggleEvidence(item: AiEvidenceApi.EvidenceItem, index: number) {
  const key = evidenceKey(item, index);
  const next = new Set(expandedEvidence.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedEvidence.value = next;
}

function isEvidenceExpanded(item: AiEvidenceApi.EvidenceItem, index: number) {
  return expandedEvidence.value.has(evidenceKey(item, index));
}

function formatScore(score?: null | number) {
  return score == null ? '-' : score.toFixed(3);
}

function evidenceTypeLabel(type?: null | string) {
  if (type === 'STRUCTURED_RESULT') return '结构化证据';
  if (type === 'CHUNK') return '文档片段';
  return type || '证据';
}

function stageColor(stage: AiEvidenceApi.StageTiming) {
  if (stage.skipped || stage.status === 'SKIPPED') return 'default';
  if (stage.status === 'FAILED' || stage.status === 'REJECTED') return 'error';
  if (stage.status === 'CLARIFY') return 'warning';
  if (stage.status === 'RUNNING') return 'processing';
  return 'success';
}

function statusLabel(status?: null | string) {
  const value = status?.toUpperCase();
  if (
    value === 'FAILED' ||
    value === 'FAILURE' ||
    value === 'ERROR' ||
    value === 'REJECTED' ||
    value === 'TIMEOUT' ||
    value === 'TIMED_OUT'
  ) {
    return '失败';
  }
  if (
    value === 'RUNNING' ||
    value === 'IN_PROGRESS' ||
    value === 'PROCESSING' ||
    value === 'STARTED' ||
    value === 'PENDING'
  ) {
    return '进行中';
  }
  return '已完成';
}

function stageLabel(stage?: null | string) {
  const value = stage?.trim().toUpperCase();
  const names: Record<string, string> = {
    // Agent Runtime 当前真实阶段。这里必须与后端 Trace stage 对齐，不能再统一显示“其他执行阶段”。
    AGENT_QUERY_PLANNING: '查询规划',
    AGENT_EXECUTION_PLAN: '生成执行计划',
    AGENT_PLAN_VALIDATION: '执行计划校验',
    AGENT_NO_PROGRESS_GUARD: '重复执行保护',
    AGENT_RUNTIME_EXECUTOR: '执行计划节点',
    AGENT_RESULT_INTEGRITY: '执行结果完整性校验',
    AGENT_PROVENANCE_INTEGRITY: '证据来源完整性校验',
    AGENT_RESULT_EVALUATION: '最终结果评估',
    AGENT_ANSWER_VALIDATION: '答案校验',
    AGENT_REFERENCE_RECORD: '引用证据记录',
    AGENT_PROVENANCE_RECORD: '证据来源记录',
    AGENT_STOP: '执行结束',
    AGENT_FALLBACK_TO_V3: '兼容流程降级',

    // 兼容历史 Agent/V3 阶段。
    QUERY_CONTEXT: '查询上下文',
    PLANNER: '任务规划',
    PLAN: '任务规划',
    PLAN_VALIDATE: '计划校验',
    PLAN_VALIDATION: '计划校验',
    CAPABILITY_DISCOVERY: '能力识别',
    CAPABILITY_PREPARE: '能力准备',
    CAPABILITY: '能力执行',
    TOOL_EXECUTION: '工具执行',
    EXECUTION: '计划执行',
    TRUSTED_SCOPE: '可信范围校验',
    GUARD: '执行保护',
    ANSWER: '最终结果评估与作答',
    EVALUATE: '最终结果评估',
    RESULT_EVALUATION: '最终结果评估',
    FINAL_EVALUATION: '最终结果评估',
    ANSWER_VALIDATION: '答案校验',
    CLAIM_VERIFY: '答案校验',
    EVIDENCE_RECORD: '证据记录',
    PROVENANCE: '证据来源记录',
    REPLAN: '重新规划',
    REPLANNING: '重新规划',
    RETRY: '重新执行',
    RETRY_PLAN: '重新规划',
    PLAN_RETRY: '重新规划',
    STOP: '执行结束',
    ANALYZE: '理解问题',
    REWRITE: '查询改写',
    SPLIT: '问题拆解',
    SCOPE_FILTER: '范围过滤',
    BM25: '关键词检索',
    VECTOR: '语义检索',
    FUSION: '结果融合',
    RERANK: '相关性重排',
    EVIDENCE: '证据记录',
    GENERATE: '答案生成',
    VERIFY: '答案校验',
  };
  // 后端未来出现新阶段时，至少直接暴露真实阶段码，禁止再退化成没有信息量的兜底文案。
  return value ? names[value] || value : '未知阶段';
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAnswer(answer?: null | string) {
  const safe = escapeHtml(answer || '');
  return safe.replace(
    /\[C(\d+)\]/g,
    (_match, num: string) =>
      `<span class="citation-chip">[C${num}]</span>`,
  );
}

async function copyText(text: string, successText: string) {
  if (!text) {
    message.warning('当前没有可复制内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    message.success(successText);
  } catch {
    message.error('复制失败，请手动选择文本复制');
  }
}

async function loadReplayTrace(showMessage = false) {
  const traceId = evidenceResult.value?.traceId;
  if (!traceId) return;

  replayLoading.value = true;
  try {
    replayStages.value = await getAgentTrace(traceId);
    if (showMessage) message.success('持久化 Trace 已刷新');
  } catch {
    replayStages.value = [];
    if (showMessage) {
      message.error('Trace 回放失败，请确认 V1.1 migration 已执行');
    }
  } finally {
    replayLoading.value = false;
  }
}

async function handleSearch() {
  const keyword = query.value.trim();
  if (!keyword) {
    message.warning('请输入测试问题');
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
    kbIds: kbIds.value.length ? kbIds.value : undefined,
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
    message.error('检索/评估失败，请查看后端日志');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Page auto-content-height>
    <div class="regression-page">
      <section class="hero-panel">
        <div>
          <div class="hero-eyebrow">AGENTIC RAG · V1.1</div>
          <h1 class="hero-title">查询回归与执行诊断</h1>
          <p class="hero-description">
            用同一组问题直接对比 Agent V1.1 与 V3。重点观察模型是否选择正确能力、是否保持原始目标、是否产生可信证据。
          </p>
        </div>
        <div class="hero-status">
          <Tag :color="modeColor">{{ selectedModeLabel }}</Tag>
          <span class="hero-status-text">当前测试入口</span>
        </div>
      </section>

      <Card class="control-card" :bordered="false">
        <div class="control-grid">
          <div class="control-field">
            <div class="field-label">执行模式</div>
            <Select
              v-model:value="evaluateMode"
              class="w-full"
              :options="modeOptions"
            />
          </div>

          <div class="control-field">
            <div class="field-label">知识库</div>
            <Select
              v-model:value="kbIds"
              class="w-full"
              mode="multiple"
              :options="kbOptions"
              placeholder="Agent V1.1 请选择 1 个知识库"
              :max-tag-count="1"
              allow-clear
            />
          </div>

          <div class="control-field control-query">
            <div class="field-label">测试问题</div>
            <Input
              v-model:value="query"
              placeholder="输入问题，或使用下方首轮回归用例"
              allow-clear
              @press-enter="handleSearch"
            />
          </div>

          <div class="control-action">
            <Button type="primary" size="large" :loading="loading" @click="handleSearch">
              执行测试
            </Button>
          </div>
        </div>

        <div class="quick-cases">
          <span class="quick-label">首轮回归</span>
          <Button
            v-for="item in quickCases"
            :key="item.code"
            size="small"
            class="quick-case"
            @click="applyQuickCase(item.query)"
          >
            <span class="quick-code">{{ item.code }}</span>
            {{ item.label }}
          </Button>
        </div>

        <Alert
          v-if="evaluateMode === 'AGENT_V1'"
          class="mt-4"
          type="info"
          show-icon
          message="Agent V1.1 当前请固定选择一个专利知识库"
          description="先跑 A/B/C/D，再切强制 V3 跑相同问题。B「名称相近」是本轮最关键的架构验证。"
        />
      </Card>

      <template v-if="evidenceResult">
        <section class="overview-grid">
          <Card class="overview-card" :bordered="false">
            <div class="metric-label">可作答</div>
            <div class="metric-value">
              <Tag :color="statusTone">
                {{ evidenceResult.answerable ? '可以作答' : '暂不能作答' }}
              </Tag>
            </div>
            <div class="metric-sub">
              {{ evidenceResult.reasonCode || '暂无原因码' }}
            </div>
          </Card>

          <Card class="overview-card" :bordered="false">
            <div class="metric-label">主路由</div>
            <div class="metric-main">{{ evidenceResult.route || '未知路由' }}</div>
            <div class="metric-sub">{{ evidenceResult.executionMode || '默认模式' }}</div>
          </Card>

          <Card class="overview-card" :bordered="false">
            <div class="metric-label">执行步骤</div>
            <div class="metric-main">{{ responseStageCount }}</div>
            <div class="metric-sub">总耗时 {{ evidenceResult.elapsedMs ?? '-' }} ms</div>
          </Card>

          <Card class="overview-card" :bordered="false">
            <div class="metric-label">Trace ID</div>
            <div class="metric-trace">{{ evidenceResult.traceId || '-' }}</div>
            <div class="metric-sub">
              {{
                replayConsistent === null
                  ? '待校验持久化回放'
                  : replayConsistent
                    ? '响应与持久化一致'
                    : '响应与持久化不一致'
              }}
            </div>
          </Card>
        </section>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="section-title-row">
              <div>
                <div class="section-title">执行结果</div>
                <div class="section-subtitle">原始问题、最终回答与核心执行状态</div>
              </div>
              <Button @click="traceDrawerOpen = true">
                <template #icon>
                  <PanelRight class="size-4" />
                </template>
                查看完整 Trace
              </Button>
            </div>
          </template>

          <div class="result-question">
            <div class="result-caption">用户原始问题</div>
            <div class="result-question-text">{{ evidenceResult.query }}</div>
          </div>

          <div v-if="evidenceResult.answer" class="answer-panel">
            <div class="result-caption">最终回答</div>
            <div
              class="answer-content"
              v-html="renderAnswer(evidenceResult.answer)"
            ></div>
          </div>

          <Alert
            v-else-if="evidenceResult.clarifyQuestion"
            type="warning"
            show-icon
            message="需要用户补充信息"
            :description="evidenceResult.clarifyQuestion"
          />

          <Alert
            v-else-if="evidenceResult.refusalReason"
            type="error"
            show-icon
            message="当前拒绝作答"
            :description="evidenceResult.refusalReason"
          />

          <div class="status-strip">
            <Tag :color="modeColor">{{ evaluateMode }}</Tag>
            <Tag color="blue">路由：{{ evidenceResult.route || '未知' }}</Tag>
            <Tag color="purple">
              执行模式：{{ evidenceResult.executionMode || '默认' }}
            </Tag>
            <Tag v-if="evidenceResult.reasonCode" color="warning">
              原因码：{{ evidenceResult.reasonCode }}
            </Tag>
            <Tag v-if="evidenceResult.confidence == null" color="default">
              置信度：暂无
            </Tag>
            <Tag v-if="evidenceResult.timedOut" color="error">执行超时</Tag>
            <Tag v-if="evidenceResult.verificationDegraded" color="warning">
              答案校验已降级
            </Tag>
          </div>

          <div
            v-if="evidenceResult.structuredResult"
            class="structured-panel"
          >
            <div class="result-caption">结构化结果</div>
            <div class="structured-grid">
              <div>
                <span>查询类型</span>
                <b>{{ evidenceResult.structuredResult.queryType || '-' }}</b>
              </div>
              <div>
                <span>执行操作</span>
                <b>{{ evidenceResult.structuredResult.operation || '-' }}</b>
              </div>
              <div>
                <span>实体数量</span>
                <b>{{ evidenceResult.structuredResult.entityCount ?? '-' }}</b>
              </div>
              <div>
                <span>字段编码</span>
                <b>{{ evidenceResult.structuredResult.fieldCode || '-' }}</b>
              </div>
            </div>
            <div
              v-if="evidenceResult.structuredResult.entityIds?.length"
              class="structured-ids"
            >
              实体 ID：{{ evidenceResult.structuredResult.entityIds.join(', ') }}
            </div>
          </div>
        </Card>

        <Card
          v-if="evidenceResult.stages?.length"
          class="result-card"
          :bordered="false"
        >
          <template #title>
            <div class="section-title-row">
              <div>
                <div class="section-title">执行链路</div>
                <div class="section-subtitle">
                  每个节点展示第几步、中文阶段、执行状态和耗时；详细过程可在完整 Trace 中查看
                </div>
              </div>
              <Tag color="blue">共 {{ responseStageCount }} 步</Tag>
            </div>
          </template>

          <div class="stage-flow">
            <button
              v-for="(stage, index) in evidenceResult.stages"
              :key="`${stage.seq ?? index}-${stage.stage ?? 'stage'}`"
              type="button"
              class="stage-node"
              :class="{
                'stage-node-error':
                  stage.status === 'FAILED' || stage.status === 'REJECTED',
                'stage-node-skipped':
                  stage.skipped || stage.status === 'SKIPPED',
              }"
              @click="traceDrawerOpen = true"
            >
              <div class="stage-node-top">
                <span class="stage-index">第 {{ stage.seq ?? index + 1 }} 步</span>
                <Tag :color="stageColor(stage)">
                  {{ statusLabel(stage.status) }}
                </Tag>
              </div>
              <div class="stage-name">{{ stageLabel(stage.stage) }}</div>
              <div class="stage-time">耗时 {{ stage.elapsedMs ?? 0 }} ms</div>
            </button>
          </div>
        </Card>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="section-title-row">
              <div>
                <div class="section-title">证据与答案校验</div>
                <div class="section-subtitle">
                  展示最终答案是否通过校验、每条结论引用了哪些证据，以及证据的来源和内容
                </div>
              </div>
              <Tag color="cyan">
                共 {{ (evidenceResult.evidence || []).length }} 条证据
              </Tag>
            </div>
          </template>

          <Alert
            v-if="(evidenceResult.conflicts || []).length"
            class="mb-4"
            type="error"
            show-icon
            :message="`检测到 ${evidenceResult.conflicts.length} 处证据冲突`"
          />

          <div
            v-if="evidenceResult.claims?.length"
            class="claims-panel"
          >
            <div class="result-caption">答案校验结果</div>
            <div
              v-for="(claim, index) in evidenceResult.claims"
              :key="`${index}-${claim.text}`"
              class="claim-row"
            >
              <Tag :color="claim.verdict === 'SUPPORTED' ? 'success' : 'error'">
                {{ claim.verdict === 'SUPPORTED' ? '证据支持' : '未通过校验' }}
              </Tag>
              <span class="claim-text">{{ claim.text }}</span>
              <span class="claim-index">引用证据 #{{ claim.evidenceIndex }}</span>
            </div>
          </div>

          <div v-if="evidenceResult.evidence?.length" class="evidence-list">
            <article
              v-for="(item, index) in evidenceResult.evidence"
              :key="evidenceKey(item, index)"
              class="evidence-item"
              :class="{ 'evidence-conflict': conflictIndexes.has(index) }"
            >
              <div class="evidence-head">
                <div class="evidence-title-wrap">
                  <Tag
                    :color="item.evidenceType === 'STRUCTURED_RESULT' ? 'geekblue' : 'cyan'"
                  >
                    {{ evidenceTypeLabel(item.evidenceType) }}
                  </Tag>
                  <div class="evidence-title">
                    {{ item.documentName || `证据 #${index}` }}
                  </div>
                </div>
                <div class="evidence-score">
                  相关度 {{ formatScore(item.score) }}
                </div>
              </div>

              <div class="evidence-meta">
                <span v-if="item.documentId">文档 ID={{ item.documentId }}</span>
                <span v-if="item.chunkId">切片 ID={{ item.chunkId }}</span>
                <span v-if="item.applicationNo">申请号 {{ item.applicationNo }}</span>
                <span v-if="item.publicationNo">公布号 {{ item.publicationNo }}</span>
                <span v-if="item.metric">指标={{ item.metric }}</span>
                <span v-if="item.aggregateValue != null">
                  聚合值={{ item.aggregateValue }}
                </span>
              </div>

              <div
                v-if="item.content"
                class="evidence-content"
                :class="{
                  'evidence-content-collapsed': !isEvidenceExpanded(item, index),
                }"
              >
                {{ item.content }}
              </div>

              <div v-if="item.filters" class="evidence-filters">
                {{ item.filters }}
              </div>

              <div class="evidence-footer">
                <div class="channel-list">
                  <Tag
                    v-for="channel in item.channels || []"
                    :key="channel"
                    color="default"
                  >
                    {{ channel }}
                  </Tag>
                </div>
                <Button
                  v-if="item.content && item.content.length > 180"
                  type="link"
                  size="small"
                  @click="toggleEvidence(item, index)"
                >
                  {{ isEvidenceExpanded(item, index) ? '收起' : '展开全文' }}
                </Button>
              </div>
            </article>
          </div>

          <div v-else class="empty-evidence">当前没有返回证据项</div>
        </Card>

        <Card class="result-card debug-card" :bordered="false">
          <template #title>
            <div class="section-title-row">
              <div>
                <div class="section-title">复制给开发排查</div>
                <div class="section-subtitle">
                  需要排查底层字段时再复制原始 JSON；日常查看请优先使用上方中文执行过程
                </div>
              </div>
              <div class="debug-actions">
                <Button size="small" @click="copyText(responseJson, '响应 JSON 已复制')">
                  复制响应 JSON
                </Button>
                <Button size="small" @click="copyText(replayJson, '回放 JSON 已复制')">
                  复制回放 JSON
                </Button>
              </div>
            </div>
          </template>

          <div class="debug-grid">
            <div>
              <div class="result-caption">响应 JSON</div>
              <pre class="debug-json">{{ responseJson }}</pre>
            </div>
            <div>
              <div class="result-caption">Trace 回放 JSON</div>
              <pre class="debug-json">{{ replayJson }}</pre>
            </div>
          </div>
        </Card>
      </template>

      <div v-else class="empty-state">
        <div class="empty-title">先执行一条测试问题</div>
        <div class="empty-description">
          运行后会显示最终答案、执行链路、证据和完整中文 Trace。
        </div>
      </div>
    </div>

    <Drawer
      v-model:open="traceDrawerOpen"
      title="完整执行 Trace"
      placement="right"
      :width="720"
    >
      <div v-if="evidenceResult" class="trace-drawer">
        <div class="trace-section">
          <div class="trace-section-head">
            <div>
              <div class="section-title">本次响应 Trace</div>
              <div class="section-subtitle">
                按执行顺序查看：第几步、中文阶段、状态、耗时、本步目标、本步结果、失败原因、重试过程，以及最终评估、答案校验和证据记录
              </div>
            </div>
            <Tag color="blue">共 {{ responseStageCount }} 步</Tag>
          </div>
          <QueryExecutionInspector
            :stages="evidenceResult.stages"
            :default-expanded="false"
          />
        </div>

        <div class="trace-section">
          <div class="trace-section-head">
            <div>
              <div class="section-title">数据库持久化 Trace</div>
              <div class="section-subtitle">
                用于核对本次响应与数据库记录是否一致，展示方式与本次响应相同
              </div>
            </div>
            <Button size="small" :loading="replayLoading" @click="loadReplayTrace(true)">
              刷新回放
            </Button>
          </div>
          <QueryExecutionInspector
            :stages="replayStages"
            :default-expanded="false"
          />
        </div>
      </div>
    </Drawer>
  </Page>
</template>

<style scoped>
.regression-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}
.hero-panel {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  border-radius: 16px;
  padding: 22px 24px;
  background:
    radial-gradient(circle at top right, rgb(99 102 241 / 18%), transparent 35%),
    linear-gradient(135deg, #111827, #1f2937);
  color: white;
}
.hero-eyebrow {
  margin-bottom: 7px;
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.hero-title {
  margin: 0;
  font-size: 26px;
  font-weight: 750;
}
.hero-description {
  max-width: 780px;
  margin: 9px 0 0;
  color: #d1d5db;
  line-height: 1.7;
}
.hero-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.hero-status-text {
  color: #9ca3af;
  font-size: 12px;
}
.control-card,
.result-card,
.overview-card {
  box-shadow: 0 1px 3px rgb(15 23 42 / 6%);
}
.control-grid {
  display: grid;
  grid-template-columns: 220px 260px minmax(280px, 1fr) auto;
  gap: 14px;
  align-items: end;
}
.control-field {
  min-width: 0;
}
.field-label {
  margin-bottom: 7px;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}
.quick-cases {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.quick-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}
.quick-code {
  margin-right: 5px;
  color: #6366f1;
  font-weight: 750;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.metric-label {
  color: #64748b;
  font-size: 12px;
}
.metric-value,
.metric-main,
.metric-trace {
  margin-top: 8px;
}
.metric-main {
  color: #111827;
  font-size: 20px;
  font-weight: 750;
}
.metric-trace {
  overflow-wrap: anywhere;
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.metric-sub {
  margin-top: 7px;
  color: #94a3b8;
  font-size: 11px;
}
.section-title-row,
.trace-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-title {
  color: #111827;
  font-size: 15px;
  font-weight: 750;
}
.section-subtitle {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 400;
}
.result-question,
.answer-panel,
.structured-panel {
  border-radius: 10px;
  padding: 14px;
  background: #f8fafc;
}
.result-question-text {
  margin-top: 7px;
  color: #111827;
  font-size: 15px;
  line-height: 1.7;
}
.answer-panel {
  margin-top: 12px;
  background: #f7fdf9;
}
.answer-content {
  margin-top: 7px;
  color: #1f2937;
  line-height: 1.85;
  white-space: pre-wrap;
}
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 13px;
}
.structured-panel {
  margin-top: 12px;
}
.structured-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 9px;
}
.structured-grid > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.structured-grid span,
.structured-ids {
  color: #64748b;
  font-size: 11px;
}
.structured-grid b {
  color: #111827;
  font-size: 13px;
}
.structured-ids {
  margin-top: 10px;
}
.stage-flow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.stage-node {
  min-width: 0;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 11px;
  background: white;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.stage-node:hover {
  border-color: #a5b4fc;
  background: #f8fafc;
}
.stage-node-error {
  border-color: #fca5a5;
}
.stage-node-skipped {
  opacity: 0.68;
}
.stage-node-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.stage-index {
  color: #94a3b8;
  font-size: 11px;
}
.stage-name {
  margin-top: 8px;
  color: #111827;
  font-size: 13px;
  font-weight: 700;
}
.stage-time {
  margin-top: 5px;
  color: #64748b;
  font-size: 11px;
}
.claims-panel {
  margin-bottom: 14px;
}
.claim-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid #f1f5f9;
  padding: 8px 0;
}
.claim-text {
  min-width: 0;
  flex: 1;
  color: #374151;
  line-height: 1.65;
}
.claim-index {
  flex: 0 0 auto;
  color: #94a3b8;
  font-size: 11px;
}
.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.evidence-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: white;
}
.evidence-conflict {
  border-color: #fca5a5;
  background: #fff7f7;
}
.evidence-head,
.evidence-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.evidence-title-wrap,
.channel-list {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}
.evidence-title {
  overflow: hidden;
  color: #111827;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.evidence-score {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 11px;
}
.evidence-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 11px;
}
.evidence-content {
  margin-top: 10px;
  color: #374151;
  line-height: 1.75;
  white-space: pre-wrap;
}
.evidence-content-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}
.evidence-filters {
  margin-top: 8px;
  border-radius: 6px;
  padding: 7px 9px;
  background: #f8fafc;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
.evidence-footer {
  margin-top: 9px;
}
.empty-evidence,
.empty-state {
  color: #94a3b8;
  text-align: center;
}
.empty-state {
  border: 1px dashed #dbe4ef;
  border-radius: 14px;
  padding: 48px 20px;
  background: #fff;
}
.empty-title {
  color: #475569;
  font-size: 16px;
  font-weight: 700;
}
.empty-description {
  margin-top: 7px;
  font-size: 12px;
}
.debug-actions {
  display: flex;
  gap: 8px;
}
.debug-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.debug-json {
  max-height: 340px;
  margin: 7px 0 0;
  overflow: auto;
  border-radius: 8px;
  padding: 10px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.trace-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.trace-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
:global(.citation-chip) {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  border-radius: 999px;
  padding: 1px 6px;
  background: #e0e7ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 700;
}
:global(html.dark) .metric-main,
:global(html.dark) .metric-trace,
:global(html.dark) .section-title,
:global(html.dark) .result-question-text,
:global(html.dark) .structured-grid b,
:global(html.dark) .stage-name,
:global(html.dark) .evidence-title {
  color: #f3f4f6;
}
:global(html.dark) .result-question,
:global(html.dark) .structured-panel,
:global(html.dark) .empty-state,
:global(html.dark) .stage-node,
:global(html.dark) .evidence-item {
  border-color: #343a46;
  background: #1f232b;
}
:global(html.dark) .answer-panel {
  background: #19271f;
}
:global(html.dark) .answer-content,
:global(html.dark) .claim-text,
:global(html.dark) .evidence-content {
  color: #d1d5db;
}
:global(html.dark) .evidence-filters {
  background: #292e38;
}

@media (max-width: 1100px) {
  .control-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .control-query {
    grid-column: 1 / -1;
  }
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .regression-page {
    padding: 12px;
  }
  .hero-panel,
  .section-title-row,
  .trace-section-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .hero-status {
    align-items: flex-start;
  }
  .control-grid,
  .overview-grid,
  .structured-grid,
  .debug-grid {
    grid-template-columns: 1fr;
  }
}
</style>
