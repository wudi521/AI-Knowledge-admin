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

function stageLabel(stage?: null | string) {
  const names: Record<string, string> = {
    PLANNER: '任务规划',
    CAPABILITY_PREPARE: '能力准备',
    CAPABILITY: '能力执行',
    TRUSTED_SCOPE: '可信范围',
    GUARD: '执行保护',
    ANSWER: '答案生成',
    STOP: '停止',
    AGENT_FALLBACK_TO_V3: '回退 V3',
    ANALYZE: '理解问题',
    REWRITE: '查询改写',
    SPLIT: '问题拆解',
    SCOPE_FILTER: '范围过滤',
    BM25: '关键词检索',
    VECTOR: '语义检索',
    FUSION: '结果融合',
    RERANK: '相关性重排',
    EVIDENCE: '证据构建',
    GENERATE: '生成回答',
    VERIFY: '答案验证',
  };
  return stage ? names[stage] || stage : '未知阶段';
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
                {{ evidenceResult.answerable ? 'YES' : 'NO' }}
              </Tag>
            </div>
            <div class="metric-sub">
              {{ evidenceResult.reasonCode || '无 reasonCode' }}
            </div>
          </Card>

          <Card class="overview-card" :bordered="false">
            <div class="metric-label">主路由</div>
            <div class="metric-main">{{ evidenceResult.route || 'UNKNOWN' }}</div>
            <div class="metric-sub">{{ evidenceResult.executionMode || 'DEFAULT' }}</div>
          </Card>

          <Card class="overview-card" :bordered="false">
            <div class="metric-label">执行步骤</div>
            <div class="metric-main">{{ responseStageCount }}</div>
            <div class="metric-sub">{{ evidenceResult.elapsedMs ?? '-' }} ms</div>
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
            <Tag color="blue">route={{ evidenceResult.route || 'UNKNOWN' }}</Tag>
            <Tag color="purple">
              mode={{ evidenceResult.executionMode || 'DEFAULT' }}
            </Tag>
            <Tag v-if="evidenceResult.reasonCode" color="warning">
              reason={{ evidenceResult.reasonCode }}
            </Tag>
            <Tag v-if="evidenceResult.confidence == null" color="default">
              confidence=null
            </Tag>
            <Tag v-if="evidenceResult.timedOut" color="error">timedOut</Tag>
            <Tag v-if="evidenceResult.verificationDegraded" color="warning">
              verificationDegraded
            </Tag>
          </div>

          <div
            v-if="evidenceResult.structuredResult"
            class="structured-panel"
          >
            <div class="result-caption">结构化结果</div>
            <div class="structured-grid">
              <div>
                <span>queryType</span>
                <b>{{ evidenceResult.structuredResult.queryType || '-' }}</b>
              </div>
              <div>
                <span>operation</span>
                <b>{{ evidenceResult.structuredResult.operation || '-' }}</b>
              </div>
              <div>
                <span>entityCount</span>
                <b>{{ evidenceResult.structuredResult.entityCount ?? '-' }}</b>
              </div>
              <div>
                <span>fieldCode</span>
                <b>{{ evidenceResult.structuredResult.fieldCode || '-' }}</b>
              </div>
            </div>
            <div
              v-if="evidenceResult.structuredResult.entityIds?.length"
              class="structured-ids"
            >
              entityIds：{{ evidenceResult.structuredResult.entityIds.join(', ') }}
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
                  点击任一步骤可以在右侧抽屉查看完整输入、输出与错误信息
                </div>
              </div>
              <Tag color="blue">{{ responseStageCount }} steps</Tag>
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
                <span class="stage-index">{{ stage.seq ?? index + 1 }}</span>
                <Tag :color="stageColor(stage)">
                  {{ stage.status || '-' }}
                </Tag>
              </div>
              <div class="stage-name">{{ stageLabel(stage.stage) }}</div>
              <div class="stage-time">{{ stage.elapsedMs ?? 0 }} ms</div>
            </button>
          </div>
        </Card>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="section-title-row">
              <div>
                <div class="section-title">证据与验证</div>
                <div class="section-subtitle">
                  结构化结果与文档片段统一展示；Claim 结果与证据索引保持对应
                </div>
              </div>
              <Tag color="cyan">
                {{ (evidenceResult.evidence || []).length }} evidences
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
            <div class="result-caption">Claim 验证</div>
            <div
              v-for="(claim, index) in evidenceResult.claims"
              :key="`${index}-${claim.text}`"
              class="claim-row"
            >
              <Tag :color="claim.verdict === 'SUPPORTED' ? 'success' : 'error'">
                {{ claim.verdict }}
              </Tag>
              <span class="claim-text">{{ claim.text }}</span>
              <span class="claim-index">证据 #{{ claim.evidenceIndex }}</span>
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
                  score {{ formatScore(item.score) }}
                </div>
              </div>

              <div class="evidence-meta">
                <span v-if="item.documentId">doc={{ item.documentId }}</span>
                <span v-if="item.chunkId">chunk={{ item.chunkId }}</span>
                <span v-if="item.applicationNo">申请号 {{ item.applicationNo }}</span>
                <span v-if="item.publicationNo">公布号 {{ item.publicationNo }}</span>
                <span v-if="item.metric">metric={{ item.metric }}</span>
                <span v-if="item.aggregateValue != null">
                  value={{ item.aggregateValue }}
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
                  直接复制这两份 JSON 发给我，不需要再打开浏览器 Network
                </div>
              </div>
              <div class="debug-actions">
                <Button size="small" @click="copyText(responseJson, '响应 JSON 已复制')">
                  复制响应 JSON
                </Button>
                <Button size="small" @click="copyText(replayJson, 'Trace JSON 已复制')">
                  复制 Trace JSON
                </Button>
              </div>
            </div>
          </template>

          <div class="debug-grid">
            <div>
              <div class="result-caption">evaluate 完整响应</div>
              <pre>{{ responseJson }}</pre>
            </div>
            <div>
              <div class="result-caption">持久化 Trace 回放</div>
              <pre>{{ replayJson }}</pre>
            </div>
          </div>
        </Card>
      </template>

      <Drawer
        v-model:open="traceDrawerOpen"
        title="查询执行回放"
        width="min(760px, 94vw)"
        placement="right"
      >
        <template v-if="evidenceResult">
          <div class="trace-drawer-head">
            <div>
              <div class="result-caption">原始问题</div>
              <div class="trace-query">{{ evidenceResult.query }}</div>
            </div>
            <div class="trace-meta">
              <Tag :color="modeColor">{{ evaluateMode }}</Tag>
              <span>{{ evidenceResult.elapsedMs ?? '-' }} ms</span>
            </div>
          </div>

          <div class="trace-id-row">
            <span class="result-caption">Trace ID</span>
            <code>{{ evidenceResult.traceId || '-' }}</code>
          </div>

          <div class="trace-section">
            <div class="trace-section-head">
              <div>
                <div class="section-title">本次响应 Trace</div>
                <div class="section-subtitle">
                  接口当次返回的 Planner → Capability → Guard → Answer/Stop
                </div>
              </div>
              <Tag color="blue">{{ responseStageCount }} steps</Tag>
            </div>
            <QueryExecutionInspector
              :stages="evidenceResult.stages"
              :default-expanded="false"
            />
          </div>

          <div class="trace-section">
            <div class="trace-section-head">
              <div>
                <div class="section-title">数据库持久化回放</div>
                <div class="section-subtitle">
                  从 ai_query_trace_stage 按 traceId 重新读取，验证刷新后仍可复盘
                </div>
              </div>
              <div class="trace-actions">
                <Tag
                  v-if="replayConsistent !== null"
                  :color="replayConsistent ? 'success' : 'error'"
                >
                  {{ replayConsistent ? '与响应一致' : '与响应不一致' }}
                </Tag>
                <Button
                  size="small"
                  :loading="replayLoading"
                  @click="loadReplayTrace(true)"
                >
                  重新读取
                </Button>
              </div>
            </div>

            <QueryExecutionInspector
              v-if="replayStages.length"
              :stages="replayStages"
              :default-expanded="false"
            />
            <Alert
              v-else
              type="warning"
              show-icon
              message="暂未读取到持久化 Trace"
              description="如果 Agent 已成功执行，请确认 sql/migrate-20260825-agent-v11-trace.sql 已执行。"
            />
          </div>
        </template>
      </Drawer>
    </div>
  </Page>
</template>

<style scoped>
.regression-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background:
    radial-gradient(circle at 8% 0%, rgb(91 112 255 / 8%), transparent 28%),
    var(--el-bg-color-page, transparent);
}

.hero-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 6px 2px 2px;
}

.hero-eyebrow {
  margin-bottom: 6px;
  color: #6366f1;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.hero-title {
  margin: 0;
  color: var(--foreground);
  font-size: 24px;
  font-weight: 760;
  letter-spacing: -0.025em;
}

.hero-description {
  max-width: 820px;
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.hero-status {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.hero-status-text {
  color: #94a3b8;
  font-size: 12px;
}

.control-card,
.result-card,
.overview-card {
  overflow: hidden;
  border: 1px solid rgb(148 163 184 / 18%);
  box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
}

.control-grid {
  display: grid;
  grid-template-columns: 220px 240px minmax(320px, 1fr) auto;
  gap: 14px;
  align-items: end;
}

.control-field {
  min-width: 0;
}

.control-query {
  min-width: 320px;
}

.control-action {
  display: flex;
  align-items: end;
}

.field-label,
.result-caption,
.metric-label {
  margin-bottom: 7px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.quick-cases {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgb(148 163 184 / 14%);
}

.quick-label {
  margin-right: 2px;
  color: #64748b;
  font-size: 12px;
}

.quick-case {
  border-radius: 8px;
}

.quick-code {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
  border-radius: 5px;
  background: rgb(99 102 241 / 10%);
  color: #4f46e5;
  font-size: 10px;
  font-weight: 800;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-card :deep(.ant-card-body) {
  min-height: 118px;
  padding: 17px 18px;
}

.metric-value {
  margin-top: 13px;
}

.metric-main {
  overflow: hidden;
  margin-top: 10px;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-trace {
  overflow: hidden;
  margin-top: 10px;
  color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-sub {
  overflow: hidden;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-title-row,
.trace-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-title {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 750;
}

.section-subtitle {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 400;
}

.result-question {
  padding: 14px 16px;
  border: 1px solid rgb(148 163 184 / 16%);
  border-radius: 10px;
  background: rgb(148 163 184 / 5%);
}

.result-question-text,
.trace-query {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.7;
}

.answer-panel {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid rgb(59 130 246 / 22%);
  border-radius: 10px;
  background: linear-gradient(135deg, rgb(59 130 246 / 6%), rgb(99 102 241 / 4%));
}

.answer-content {
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.citation-chip) {
  display: inline-flex;
  align-items: center;
  margin: 0 2px;
  padding: 0 5px;
  border-radius: 5px;
  background: rgb(59 130 246 / 12%);
  color: #2563eb;
  font-size: 11px;
  font-weight: 750;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.structured-panel {
  margin-top: 14px;
  padding: 14px 16px;
  border: 1px solid rgb(99 102 241 / 18%);
  border-radius: 10px;
  background: rgb(99 102 241 / 4%);
}

.structured-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.structured-grid > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.structured-grid span {
  color: #94a3b8;
  font-size: 10px;
}

.structured-grid b {
  overflow: hidden;
  color: var(--foreground);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structured-ids,
.evidence-filters {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  background: rgb(15 23 42 / 4%);
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
  word-break: break-all;
}

.stage-flow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.stage-node {
  min-width: 0;
  border: 1px solid rgb(148 163 184 / 18%);
  border-radius: 10px;
  padding: 11px 12px;
  background: rgb(255 255 255 / 55%);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: 160ms ease;
}

.stage-node:hover {
  border-color: rgb(99 102 241 / 42%);
  box-shadow: 0 5px 18px rgb(99 102 241 / 8%);
  transform: translateY(-1px);
}

.stage-node-error {
  border-color: rgb(239 68 68 / 40%);
}

.stage-node-skipped {
  opacity: 0.58;
}

.stage-node-top,
.evidence-head,
.evidence-footer,
.trace-drawer-head,
.trace-meta,
.trace-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stage-index {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgb(99 102 241 / 9%);
  color: #6366f1;
  font-size: 10px;
  font-weight: 800;
}

.stage-name {
  overflow: hidden;
  margin-top: 11px;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-time {
  margin-top: 5px;
  color: #94a3b8;
  font-size: 10px;
}

.claims-panel {
  margin-bottom: 16px;
  padding: 13px;
  border: 1px solid rgb(148 163 184 / 16%);
  border-radius: 10px;
}

.claim-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 9px 0;
  border-bottom: 1px solid rgb(148 163 184 / 10%);
}

.claim-row:last-child {
  border-bottom: 0;
}

.claim-text {
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.65;
}

.claim-index {
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
}

.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.evidence-item {
  padding: 14px 15px;
  border: 1px solid rgb(148 163 184 / 16%);
  border-radius: 11px;
  background: rgb(148 163 184 / 3%);
}

.evidence-conflict {
  border-color: rgb(239 68 68 / 38%);
  background: rgb(239 68 68 / 3%);
}

.evidence-title-wrap {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.evidence-title {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-score {
  flex-shrink: 0;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
}

.evidence-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 9px;
  color: #94a3b8;
  font-size: 10px;
}

.evidence-content {
  margin-top: 11px;
  color: var(--foreground);
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.evidence-content-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.evidence-footer {
  margin-top: 10px;
}

.channel-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.empty-evidence {
  padding: 34px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

.debug-actions {
  display: flex;
  gap: 8px;
}

.debug-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.debug-grid pre {
  max-height: 360px;
  margin: 0;
  overflow: auto;
  border: 1px solid rgb(148 163 184 / 14%);
  border-radius: 9px;
  padding: 12px;
  background: #0f172a;
  color: #cbd5e1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.trace-drawer-head {
  align-items: flex-start;
  padding-bottom: 14px;
  border-bottom: 1px solid rgb(148 163 184 / 14%);
}

.trace-meta {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 11px;
}

.trace-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0 18px;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgb(148 163 184 / 6%);
}

.trace-id-row .result-caption {
  margin-bottom: 0;
}

.trace-id-row code {
  overflow: hidden;
  color: #6366f1;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-section {
  margin-top: 20px;
}

.trace-section-head {
  margin-bottom: 12px;
}

@media (max-width: 1180px) {
  .control-grid {
    grid-template-columns: 1fr 1fr;
  }

  .control-query {
    min-width: 0;
  }

  .control-action {
    justify-content: flex-end;
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
    flex-direction: column;
    align-items: stretch;
  }

  .hero-status {
    padding-top: 0;
  }

  .control-grid,
  .overview-grid,
  .structured-grid,
  .debug-grid {
    grid-template-columns: 1fr;
  }

  .control-action :deep(.ant-btn) {
    width: 100%;
  }

  .claim-row {
    grid-template-columns: auto 1fr;
  }

  .claim-index {
    grid-column: 2;
  }
}

:global(html.dark) .stage-node {
  background: rgb(15 23 42 / 42%);
}

:global(html.dark) .structured-ids,
:global(html.dark) .evidence-filters {
  background: rgb(255 255 255 / 5%);
}
</style>
