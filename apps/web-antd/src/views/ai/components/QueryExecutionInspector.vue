<script lang="ts" setup>
import { computed, ref } from 'vue';
import { ChevronDown, ChevronRight } from '@vben/icons';
import { Empty, Tag } from 'ant-design-vue';

export interface QueryExecutionStage {
  seq?: number | null;
  stage?: string | null;
  status?: string | null;
  elapsedMs?: number | null;
  skipped?: boolean | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  modelCallId?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
}

const props = withDefaults(
  defineProps<{
    stages?: QueryExecutionStage[] | null;
    defaultExpanded?: boolean;
  }>(),
  { stages: () => [], defaultExpanded: false },
);

const expanded = ref<Set<number>>(new Set());
const initialized = ref(false);

const STAGE_TEXT: Record<string, string> = {
  QUERY_CONTEXT: '查询上下文',
  ANALYZE: '理解问题',
  REWRITE: '查询改写',
  SPLIT: '问题拆解',
  PLANNER: '任务规划',
  PLAN: '任务规划',
  PLAN_VALIDATE: '计划校验',
  PLAN_VALIDATION: '计划校验',
  CAPABILITY_DISCOVERY: '能力识别',
  CAPABILITY_PREPARE: '能力准备',
  CAPABILITY: '能力执行',
  TOOL_EXECUTION: '工具执行',
  EXECUTION: '计划执行',
  SCOPE_FILTER: '范围过滤',
  TRUSTED_SCOPE: '可信范围校验',
  GUARD: '执行保护',
  BM25: '关键词检索',
  VECTOR: '语义检索',
  FUSION: '结果融合',
  RERANK: '相关性重排',
  EVIDENCE: '证据记录',
  EVIDENCE_RECORD: '证据记录',
  PROVENANCE: '证据来源记录',
  GENERATE: '答案生成',
  VERIFY: '答案校验',
  CLAIM_VERIFY: '答案校验',
  ANSWER_VALIDATION: '答案校验',
  VALIDATE: '答案校验',
  EVALUATE: '最终结果评估',
  RESULT_EVALUATION: '最终结果评估',
  FINAL_EVALUATION: '最终结果评估',
  ANSWER: '最终结果评估与作答',
  FINALIZE: '结果收尾',
  REPLAN: '重新规划',
  REPLANNING: '重新规划',
  RETRY: '重新执行',
  RETRY_PLAN: '重新规划',
  PLAN_RETRY: '重新规划',
  STOP: '执行结束',
  AGENT_FALLBACK_TO_V3: '兼容流程降级',
};

const STAGE_PURPOSE: Record<string, string> = {
  QUERY_CONTEXT: '整理本次查询的上下文、知识库范围和执行约束，为后续规划提供输入。',
  ANALYZE: '分析用户问题，识别检索意图、关键对象和约束。',
  REWRITE: '将原始问题改写为更适合知识库检索的查询。',
  SPLIT: '把复杂问题拆成可以独立检索和验证的子问题。',
  PLANNER: '理解问题并生成本次检索、计算与回答的执行计划。',
  PLAN: '理解问题并生成本次检索、计算与回答的执行计划。',
  PLAN_VALIDATE: '检查执行计划是否完整、可执行，并满足当前约束。',
  PLAN_VALIDATION: '检查执行计划是否完整、可执行，并满足当前约束。',
  CAPABILITY_DISCOVERY: '识别本次查询可以调用的检索、工具和业务能力。',
  CAPABILITY_PREPARE: '准备当前计划需要的能力、工具和执行参数。',
  CAPABILITY: '按计划调用检索或业务能力，并收集执行结果。',
  TOOL_EXECUTION: '调用计划指定的工具，并记录工具返回结果。',
  EXECUTION: '执行已经确认的计划节点，并汇总各节点结果。',
  SCOPE_FILTER: '按照知识库、权限和范围条件过滤可检索内容。',
  TRUSTED_SCOPE: '收敛到可信知识范围，过滤不满足范围要求的内容。',
  GUARD: '检查安全、权限、范围以及当前结果是否可以继续执行。',
  BM25: '使用关键词相关性检索候选文档或数据。',
  VECTOR: '使用语义向量相似度检索候选文档或数据。',
  FUSION: '合并不同检索通道的候选结果并去重。',
  RERANK: '重新排序候选结果，保留与问题最相关的内容。',
  EVIDENCE: '整理可用于作答的证据，并记录证据来源和引用关系。',
  EVIDENCE_RECORD: '整理可用于作答的证据，并记录证据来源和引用关系。',
  PROVENANCE: '记录结果来自哪些文档、数据或工具，保证答案可以追溯。',
  GENERATE: '基于已经取得的证据生成候选答案。',
  VERIFY: '逐项校验答案中的结论是否有证据支持。',
  CLAIM_VERIFY: '逐项校验答案中的结论是否有证据支持。',
  ANSWER_VALIDATION: '检查最终答案与证据是否一致，避免无依据回答。',
  VALIDATE: '检查最终答案与证据是否一致，避免无依据回答。',
  EVALUATE: '综合检查答案完整性、证据充分性和执行结果，形成最终结果评估。',
  RESULT_EVALUATION: '综合检查答案完整性、证据充分性和执行结果，形成最终结果评估。',
  FINAL_EVALUATION: '综合检查答案完整性、证据充分性和执行结果，形成最终结果评估。',
  ANSWER: '综合执行结果和可信证据，判断是否可以作答并形成最终答案。',
  FINALIZE: '整理最终状态、答案、证据和校验结果，结束本次执行。',
  REPLAN: '根据上一次失败原因重新规划执行路径，并准备再次执行。',
  REPLANNING: '根据上一次失败原因重新规划执行路径，并准备再次执行。',
  RETRY: '根据失败原因调整执行条件，并重新执行当前步骤。',
  RETRY_PLAN: '根据上一次失败原因重新规划执行路径，并准备再次执行。',
  PLAN_RETRY: '根据上一次失败原因重新规划执行路径，并准备再次执行。',
  STOP: '结束本次执行链路，并记录终止原因和已有结果。',
  AGENT_FALLBACK_TO_V3: '当前 Agent 链路无法继续时，切换到兼容检索流程完成请求。',
};

const FAILED_STATUS = new Set([
  'FAILED',
  'FAILURE',
  'ERROR',
  'REJECTED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'CANCELED',
]);

const RUNNING_STATUS = new Set([
  'RUNNING',
  'IN_PROGRESS',
  'PROCESSING',
  'STARTED',
  'PENDING',
]);

const normalizedStages = computed(() => {
  const list = props.stages || [];
  if (!initialized.value && props.defaultExpanded && list.length > 0) {
    expanded.value = new Set(list.map((_, index) => index));
    initialized.value = true;
  }
  return list;
});

function normalizeCode(value?: null | string) {
  return value?.trim().toUpperCase() || '';
}

function toggle(index: number) {
  const next = new Set(expanded.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  expanded.value = next;
}

function statusText(stage: QueryExecutionStage) {
  const status = normalizeCode(stage.status);
  if (FAILED_STATUS.has(status)) return '失败';
  if (RUNNING_STATUS.has(status)) return '进行中';
  return '已完成';
}

function isFailure(stage: QueryExecutionStage) {
  return statusText(stage) === '失败';
}

function statusColor(stage: QueryExecutionStage) {
  if (isFailure(stage)) return 'error';
  if (statusText(stage) === '进行中') return 'processing';
  if (stage.skipped || normalizeCode(stage.status) === 'SKIPPED') {
    return 'default';
  }
  if (normalizeCode(stage.status) === 'CLARIFY') return 'warning';
  return 'success';
}

function stageText(stage: QueryExecutionStage) {
  const code = normalizeCode(stage.stage);
  return STAGE_TEXT[code] || '其他执行阶段';
}

function stageTitle(stage: QueryExecutionStage, index: number) {
  return `第 ${stage.seq ?? index + 1} 步 · ${stageText(stage)}`;
}

function stagePurpose(stage: QueryExecutionStage) {
  const code = normalizeCode(stage.stage);
  return (
    STAGE_PURPOSE[code] ||
    '执行当前计划中的处理步骤，并将处理结果传递给后续阶段。'
  );
}

function resultText(stage: QueryExecutionStage) {
  const output = stage.outputSummary?.trim();
  if (output) return output;
  if (isFailure(stage)) return '本步骤未完成，没有产生可用结果。';
  if (statusText(stage) === '进行中') return '本步骤正在执行，结果尚未生成。';
  if (stage.skipped || normalizeCode(stage.status) === 'SKIPPED') {
    return '本步骤根据执行条件被跳过，没有产生新的业务结果。';
  }
  if (normalizeCode(stage.status) === 'CLARIFY') {
    return '当前信息不足，已形成需要用户补充的信息。';
  }
  return '本步骤已执行完成，后端没有记录单独的结果摘要。';
}

function failureReason(stage: QueryExecutionStage) {
  const message = stage.errorMessage?.trim();
  const code = stage.errorCode?.trim();
  if (message && code) return `${message}（错误码：${code}）`;
  if (message) return message;
  if (code) return `错误码：${code}`;
  return '后端没有记录具体失败原因。';
}

function retryGroupKey(stageCode?: null | string) {
  const code = normalizeCode(stageCode);
  if (
    code === 'REPLAN' ||
    code === 'REPLANNING' ||
    code === 'RETRY_PLAN' ||
    code === 'PLAN_RETRY'
  ) {
    return 'PLANNER';
  }
  return code;
}

function isExplicitRetryStage(stageCode?: null | string) {
  const code = normalizeCode(stageCode);
  return code.includes('REPLAN') || code.includes('RETRY');
}

function retryProcess(index: number) {
  const current = normalizedStages.value[index];
  if (!current) return '';

  const key = retryGroupKey(current.stage);
  if (!key) return '';

  const attempts = normalizedStages.value
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => retryGroupKey(item.stage) === key);

  if (attempts.length <= 1) return '';
  if (attempts[attempts.length - 1]?.itemIndex !== index) return '';

  const previousAttempts = attempts.slice(0, -1);
  const hasPreviousFailure = previousAttempts.some(({ item }) =>
    isFailure(item),
  );
  const hasExplicitRetry = attempts.some(({ item }) =>
    isExplicitRetryStage(item.stage),
  );

  if (!hasPreviousFailure && !hasExplicitRetry) return '';

  return attempts
    .map(({ item }, attemptIndex) => {
      const round = `第 ${attemptIndex + 1} 次`;
      if (isFailure(item)) {
        const reason = item.errorMessage?.trim() || item.errorCode?.trim();
        return `${round}尝试失败${reason ? `（${reason}）` : ''}`;
      }

      if (statusText(item) === '进行中') {
        return `${round}${attemptIndex > 0 ? '重试' : '尝试'}进行中`;
      }

      const action =
        attemptIndex > 0 && key === 'PLANNER' ? '重新规划' : '尝试';
      return `${round}${action}已完成`;
    })
    .join(' → ');
}
</script>

<template>
  <div v-if="normalizedStages.length" class="qe-inspector">
    <div
      v-for="(stage, index) in normalizedStages"
      :key="`${stage.seq ?? index}-${stage.stage ?? 'stage'}-${index}`"
      class="qe-stage"
      :class="{
        'qe-stage-failed': isFailure(stage),
        'qe-stage-skipped': stage.skipped || stage.status === 'SKIPPED',
      }"
    >
      <button class="qe-stage-head" type="button" @click="toggle(index)">
        <span class="qe-toggle">
          <ChevronDown v-if="expanded.has(index)" class="size-4" />
          <ChevronRight v-else class="size-4" />
        </span>
        <span class="qe-stage-name">{{ stageTitle(stage, index) }}</span>
        <Tag :color="statusColor(stage)">{{ statusText(stage) }}</Tag>
        <span class="qe-stage-ms">耗时：{{ stage.elapsedMs ?? 0 }} ms</span>
      </button>

      <div class="qe-stage-summary">
        <div class="qe-summary-row">
          <span class="qe-summary-label">本步要做什么：</span>
          <span>{{ stagePurpose(stage) }}</span>
        </div>
        <div class="qe-summary-row qe-result-row">
          <span class="qe-summary-label">本步产生了什么结果：</span>
          <span class="qe-summary-value">{{ resultText(stage) }}</span>
        </div>
        <div
          v-if="isFailure(stage) || stage.errorCode || stage.errorMessage"
          class="qe-summary-row qe-error-row"
        >
          <span class="qe-summary-label">失败原因：</span>
          <span>{{ failureReason(stage) }}</span>
        </div>
        <div v-if="retryProcess(index)" class="qe-summary-row qe-retry-row">
          <span class="qe-summary-label">重试过程：</span>
          <span>{{ retryProcess(index) }}</span>
        </div>
      </div>

      <div v-if="expanded.has(index)" class="qe-stage-body">
        <div v-if="stage.inputSummary" class="qe-block">
          <div class="qe-label">执行输入摘要</div>
          <pre>{{ stage.inputSummary }}</pre>
        </div>
        <div v-if="stage.outputSummary" class="qe-block qe-output">
          <div class="qe-label">后端原始结果摘要</div>
          <pre>{{ stage.outputSummary }}</pre>
        </div>
        <div v-if="stage.modelCallId" class="qe-meta">
          <span>模型调用编号</span>
          <code>{{ stage.modelCallId }}</code>
        </div>
        <div v-if="stage.stage" class="qe-meta">
          <span>原始阶段标识</span>
          <code>{{ stage.stage }}</code>
        </div>
        <div
          v-if="
            !stage.inputSummary &&
            !stage.outputSummary &&
            !stage.modelCallId &&
            !stage.errorMessage &&
            !stage.errorCode
          "
          class="qe-empty-detail"
        >
          当前步骤没有更多诊断明细。
        </div>
      </div>
    </div>
  </div>
  <Empty v-else description="暂无执行链路数据" />
</template>

<style scoped>
.qe-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qe-stage {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #fff;
}
:global(html.dark) .qe-stage {
  border-color: #353a45;
  background: #1f232b;
}
.qe-stage-failed {
  border-color: #fca5a5;
}
.qe-stage-skipped {
  opacity: 0.78;
}
.qe-stage-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 10px 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.qe-stage-head:hover {
  background: #f8fafc;
}
:global(html.dark) .qe-stage-head:hover {
  background: #292e38;
}
.qe-toggle {
  width: 14px;
  color: #94a3b8;
}
.qe-stage-name {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 650;
}
.qe-stage-ms {
  min-width: 96px;
  color: #64748b;
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.qe-stage-summary {
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-top: 1px solid #eef2f7;
  padding: 10px 12px 11px 34px;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.65;
}
:global(html.dark) .qe-stage-summary {
  border-top-color: #343a46;
  color: #d1d5db;
}
.qe-summary-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.qe-summary-label {
  flex: 0 0 auto;
  color: #374151;
  font-weight: 650;
}
:global(html.dark) .qe-summary-label {
  color: #e5e7eb;
}
.qe-summary-value {
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.qe-error-row {
  color: #b91c1c;
}
:global(html.dark) .qe-error-row {
  color: #fca5a5;
}
.qe-retry-row {
  color: #b45309;
}
:global(html.dark) .qe-retry-row {
  color: #fbbf24;
}
.qe-stage-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px dashed #e5e7eb;
  padding: 10px 12px 12px 34px;
}
:global(html.dark) .qe-stage-body {
  border-top-color: #343a46;
}
.qe-block {
  border-left: 3px solid #93c5fd;
  border-radius: 4px;
  padding: 7px 9px;
  background: #f8fbff;
}
.qe-output {
  border-left-color: #86efac;
  background: #f7fdf9;
}
:global(html.dark) .qe-block {
  background: #192331;
}
:global(html.dark) .qe-output {
  background: #19271f;
}
.qe-label {
  margin-bottom: 5px;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
}
.qe-block pre {
  margin: 0;
  overflow-wrap: anywhere;
  color: #1f2937;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
:global(html.dark) .qe-block pre {
  color: #e5e7eb;
}
.qe-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
}
.qe-meta code {
  overflow-wrap: anywhere;
}
.qe-empty-detail {
  color: #94a3b8;
  font-size: 11px;
}
</style>
