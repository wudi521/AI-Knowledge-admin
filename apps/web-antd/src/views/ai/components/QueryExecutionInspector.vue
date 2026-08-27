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

type StageDescriptor = {
  name: string;
  purpose: string;
};

const props = withDefaults(
  defineProps<{
    stages?: QueryExecutionStage[] | null;
    defaultExpanded?: boolean;
  }>(),
  { stages: () => [], defaultExpanded: false },
);

const expanded = ref<Set<number>>(new Set());
const initialized = ref(false);

/**
 * 这里必须与后端真实 Trace phase 对齐。
 * Agent Runtime 的 phase 在 AgenticEvidenceFacade 中统一加 AGENT_ 前缀；
 * V3 保留 QueryEngineV3 原始阶段名。
 */
const STAGES: Record<string, StageDescriptor> = {
  // AgenticKnowledgeRuntimeEngine
  AGENT_QUERY_PLANNING: {
    name: '查询规划',
    purpose: '根据原始问题、上下文、已有执行结果和可用能力，决定下一步是执行计划、直接作答、补充信息还是停止。',
  },
  AGENT_EXECUTION_PLAN: {
    name: '生成执行计划',
    purpose: '把本轮查询规划转换成可执行计划，明确要调用哪些能力、各节点的依赖关系以及本轮重新规划次数。',
  },
  AGENT_PLAN_VALIDATION: {
    name: '执行计划校验',
    purpose: '校验执行计划是否绑定原始问题，并检查节点参数、依赖关系和计划结构是否可以安全执行。',
  },
  AGENT_NO_PROGRESS_GUARD: {
    name: '重复执行保护',
    purpose: '检查重新规划后的执行语义是否与已经证明无效的计划重复，避免反复访问同一数据却没有新进展。',
  },
  AGENT_RUNTIME_EXECUTOR: {
    name: '执行计划节点',
    purpose: '按执行计划调用真实检索或业务能力，记录每个节点的执行状态、耗时和返回结果。',
  },
  AGENT_RESULT_INTEGRITY: {
    name: '执行结果完整性校验',
    purpose: '核对每个执行节点的结果和活动记录是否一一对应，防止缺结果、重复结果或状态不一致。',
  },
  AGENT_PROVENANCE_INTEGRITY: {
    name: '证据来源完整性校验',
    purpose: '检查每条引用证据是否都有对应的来源记录，并确认计划、节点和能力来源能够正确追溯。',
  },
  AGENT_RESULT_EVALUATION: {
    name: '最终结果评估',
    purpose: '独立判断当前已经取得的事实和证据是否足以完整回答原始问题；不足时触发有限次数的重新规划。',
  },
  AGENT_ANSWER_VALIDATION: {
    name: '答案校验',
    purpose: '在输出答案前检查答案是否真正回答原始问题，并确认关键结论能够被确定性结果或证据支持。',
  },
  AGENT_REFERENCE_RECORD: {
    name: '引用证据记录',
    purpose: '记录本次答案实际引用了哪些执行结果、验证实体和证据，建立答案与证据之间的引用关系。',
  },
  AGENT_PROVENANCE_RECORD: {
    name: '证据来源记录',
    purpose: '记录引用证据来自哪个知识库、领域、执行计划和能力，保证结果可以追溯到真实来源。',
  },
  AGENT_STOP: {
    name: '执行结束',
    purpose: '结束本次执行，并记录为什么停止、是否需要用户补充信息或为什么当前不能可靠作答。',
  },
  AGENT_FALLBACK_TO_V3: {
    name: '降级到兼容检索流程',
    purpose: '当前 Agent Runtime 无法继续时，切换到兼容的 V3 检索流程继续处理。',
  },

  // QueryEngineV3
  ANALYZE: {
    name: '理解问题',
    purpose: '分析用户问题，识别检索意图、关键对象和查询约束。',
  },
  REWRITE: {
    name: '查询改写',
    purpose: '把原始问题改写成更适合知识库检索的查询表达。',
  },
  SPLIT: {
    name: '问题拆解',
    purpose: '把复杂问题拆成可以分别检索和验证的子问题。',
  },
  SCOPE_FILTER: {
    name: '范围过滤',
    purpose: '按照知识库、领域、权限和上下文范围过滤可检索内容。',
  },
  BM25: {
    name: '关键词检索',
    purpose: '使用关键词相关性从知识库中召回候选内容。',
  },
  VECTOR: {
    name: '语义检索',
    purpose: '使用语义相似度从知识库中召回与问题含义接近的候选内容。',
  },
  FUSION: {
    name: '检索结果融合',
    purpose: '合并不同检索通道的候选结果并去重。',
  },
  RERANK: {
    name: '相关性重排',
    purpose: '重新判断候选内容与问题的相关性，并把最有价值的结果排到前面。',
  },
  EVIDENCE: {
    name: '证据构建',
    purpose: '从候选结果中整理能够支持最终答案的证据。',
  },
  GENERATE: {
    name: '答案生成',
    purpose: '基于已经取得的证据生成候选答案。',
  },
  VERIFY: {
    name: '答案验证',
    purpose: '检查候选答案中的结论是否能够被返回证据支持。',
  },
};

const COMPLETED_STATUS = new Set([
  'SUCCEEDED',
  'SUCCESS',
  'PARTIAL',
  'EMPTY',
  'REPLAN',
  'SKIPPED',
  'CLARIFY',
]);

const RUNNING_STATUS = new Set([
  'RUNNING',
  'IN_PROGRESS',
  'PROCESSING',
  'STARTED',
  'PENDING',
]);

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

function descriptor(stage: QueryExecutionStage): StageDescriptor | null {
  return STAGES[normalizeCode(stage.stage)] || null;
}

function stageText(stage: QueryExecutionStage) {
  const item = descriptor(stage);
  if (item) return item.name;
  const code = normalizeCode(stage.stage);
  // 不再用“其他执行阶段”掩盖前后端阶段不一致。
  return code ? `未映射阶段：${code}` : '未映射阶段：阶段码为空';
}

function stagePurpose(stage: QueryExecutionStage) {
  const item = descriptor(stage);
  if (item) return item.purpose;
  const code = normalizeCode(stage.stage);
  return `前端尚未配置阶段 ${code || '（空阶段码）'} 的中文说明，请按原始阶段码检查后端 Trace 定义。`;
}

function statusText(stage: QueryExecutionStage) {
  const status = normalizeCode(stage.status);
  if (FAILED_STATUS.has(status)) return '失败';
  if (RUNNING_STATUS.has(status)) return '进行中';
  if (status === 'STOPPED') {
    return normalizeCode(stage.errorCode) === 'NEED_USER_INPUT' ? '已完成' : '失败';
  }
  if (COMPLETED_STATUS.has(status) || stage.skipped) return '已完成';
  // 当前后端实际状态已全部映射；若以后新增，直接暴露状态码，避免误判为成功。
  return status ? `未映射状态：${status}` : '未映射状态：空';
}

function isFailure(stage: QueryExecutionStage) {
  return statusText(stage) === '失败';
}

function statusColor(stage: QueryExecutionStage) {
  if (isFailure(stage)) return 'error';
  if (statusText(stage) === '进行中') return 'processing';
  if (statusText(stage) === '已完成') return 'success';
  return 'warning';
}

function stageTitle(stage: QueryExecutionStage, index: number) {
  return `第 ${stage.seq ?? index + 1} 步 · ${stageText(stage)}`;
}

function extractValue(text: string, key: string) {
  const match = text.match(new RegExp(`(?:^|;)\\s*${key}=([^;]*)`));
  return match?.[1]?.trim() || '';
}

function translateVerdict(value: string) {
  const verdict = normalizeCode(value);
  if (verdict === 'SATISFIED') return '已经满足原始问题，可以进入答案校验';
  if (verdict === 'INSUFFICIENT') return '现有结果仍不足，将重新规划后继续执行';
  if (verdict === 'NEED_MORE_INFO') return '现有信息不足，需要用户补充关键信息';
  if (verdict === 'EVALUATION_FAILED') return '结果充分性评估失败，不能直接输出答案';
  return value;
}

function translateRuntimeStatus(value: string) {
  const status = normalizeCode(value);
  if (status === 'SUCCESS' || status === 'SUCCEEDED') return '执行成功';
  if (status === 'PARTIAL') return '部分完成';
  if (status === 'EMPTY') return '执行完成，但没有查到结果';
  if (status === 'FAILED') return '执行失败';
  return value;
}

function translatedOutput(stage: QueryExecutionStage) {
  const code = normalizeCode(stage.stage);
  const raw = stage.outputSummary?.trim() || '';

  if (code === 'AGENT_EXECUTION_PLAN') {
    const planId = extractValue(raw, 'planId');
    const nodes = extractValue(raw, 'nodes');
    const replanAttempt = extractValue(raw, 'replanAttempt');
    if (planId || nodes || replanAttempt) {
      const parts = [
        planId ? `计划编号 ${planId}` : '',
        nodes ? `共 ${nodes} 个执行节点` : '',
        replanAttempt ? `当前已重新规划 ${replanAttempt} 次` : '',
      ].filter(Boolean);
      return `执行计划已生成：${parts.join('，')}。`;
    }
  }

  if (code === 'AGENT_PLAN_VALIDATION' && raw === 'schema/DAG validation passed') {
    return '执行计划的参数结构和节点依赖关系校验通过。';
  }
  if (
    code === 'AGENT_RESULT_INTEGRITY' &&
    raw === 'node results and activity records are consistent'
  ) {
    return '执行节点结果与活动记录一致，结果完整性校验通过。';
  }
  if (
    code === 'AGENT_PROVENANCE_INTEGRITY' &&
    raw === 'every ReferenceRecord is linked to provenance'
  ) {
    return '每条引用证据都已关联对应来源记录，证据来源链校验通过。';
  }

  if (code === 'AGENT_RESULT_EVALUATION') {
    const verdict = extractValue(raw, 'verdict');
    const reason = raw.includes(';') ? raw.slice(raw.indexOf(';') + 1).trim() : '';
    if (verdict) {
      return `评估结论：${translateVerdict(verdict)}${reason ? `。评估依据：${reason}` : '。'}`;
    }
  }

  if (code === 'AGENT_ANSWER_VALIDATION') {
    if (raw === 'deterministic references satisfy immutable OriginalGoal') {
      return '确定性执行结果已经完整回答原始问题，答案校验通过。';
    }
    if (raw === 'answer failed claim/evidence validation') {
      return '最终答案没有通过结论与证据一致性校验。';
    }
    if (raw === 'immutable OriginalGoal passed goal evaluation + claim/evidence validation') {
      return '最终答案已通过目标充分性评估和结论/证据一致性校验。';
    }
  }

  if (code === 'AGENT_RUNTIME_EXECUTOR') {
    const runtimeStatus = extractValue(raw, 'status');
    const failureType = extractValue(raw, 'failureType');
    const detail = raw.includes(';') ? raw.slice(raw.lastIndexOf(';') + 1).trim() : '';
    if (runtimeStatus) {
      const parts = [`节点${translateRuntimeStatus(runtimeStatus)}`];
      if (failureType) parts.push(`失败类型：${failureType}`);
      if (detail && !detail.startsWith('status=')) parts.push(`结果：${detail}`);
      return parts.join('；');
    }
  }

  if (code === 'AGENT_REFERENCE_RECORD') {
    const referenceId = extractValue(raw, 'referenceId');
    const entityIds = extractValue(raw, 'verifiedEntityIds');
    const evidenceCount = extractValue(raw, 'evidenceCount');
    const deterministic = extractValue(raw, 'deterministic');
    const parts = [
      referenceId ? `引用记录 ${referenceId}` : '',
      entityIds ? `已验证实体 ${entityIds}` : '',
      evidenceCount ? `记录 ${evidenceCount} 条证据` : '',
      deterministic ? `确定性结果：${deterministic}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join('；');
  }

  if (code === 'AGENT_PROVENANCE_RECORD') {
    const kbId = extractValue(raw, 'kbId');
    const domainCode = extractValue(raw, 'domainCode');
    const traceId = extractValue(raw, 'traceId');
    const parts = [
      kbId ? `知识库 ID：${kbId}` : '',
      domainCode ? `领域：${domainCode}` : '',
      traceId ? `Trace ID：${traceId}` : '',
    ].filter(Boolean);
    if (parts.length) return `证据来源已记录：${parts.join('，')}。`;
  }

  return raw;
}

function resultText(stage: QueryExecutionStage) {
  const output = translatedOutput(stage);
  if (output) return output;
  if (isFailure(stage)) return '本步骤未完成，没有产生可继续使用的结果。';
  if (statusText(stage) === '进行中') return '本步骤正在执行，结果尚未生成。';
  if (stage.skipped || normalizeCode(stage.status) === 'SKIPPED') {
    return '本步骤按执行条件跳过，没有产生新的结果。';
  }
  if (normalizeCode(stage.status) === 'EMPTY') {
    return '本步骤已经正常执行完成，但没有查到符合条件的数据。';
  }
  return '本步骤已执行完成。';
}

function failureReason(stage: QueryExecutionStage) {
  const message = stage.errorMessage?.trim();
  const output = translatedOutput(stage);
  const code = stage.errorCode?.trim();
  if (message && code) return `${message}（原因码：${code}）`;
  if (message) return message;
  if (isFailure(stage) && output) {
    return code ? `${output}（原因码：${code}）` : output;
  }
  if (code) return `原因码：${code}`;
  return '后端没有记录更具体的失败原因。';
}

function planningRound(index: number) {
  let round = 0;
  for (let i = 0; i <= index; i += 1) {
    if (normalizeCode(normalizedStages.value[i]?.stage) === 'AGENT_QUERY_PLANNING') {
      round += 1;
    }
  }
  return round;
}

function retryProcess(index: number) {
  const current = normalizedStages.value[index];
  if (!current) return '';
  const code = normalizeCode(current.stage);

  if (code === 'AGENT_RESULT_EVALUATION' && normalizeCode(current.status) === 'REPLAN') {
    const nextRound = planningRound(index) + 1;
    return `第 ${nextRound - 1} 轮执行后的结果仍不足，系统将进行第 ${nextRound - 1} 次重新规划。`;
  }

  if (code === 'AGENT_QUERY_PLANNING') {
    const round = planningRound(index);
    if (round <= 1) return '';
    let trigger: QueryExecutionStage | undefined;
    for (let i = index - 1; i >= 0; i -= 1) {
      const item = normalizedStages.value[i];
      const itemStatus = normalizeCode(item?.status);
      if (itemStatus === 'REPLAN' || itemStatus === 'FAILED') {
        trigger = item;
        break;
      }
      if (normalizeCode(item?.stage) === 'AGENT_QUERY_PLANNING') break;
    }
    const reason = trigger ? translatedOutput(trigger) || trigger.errorCode || '' : '';
    return `第 ${round - 1} 次重新规划已完成${reason ? `；触发原因：${reason}` : ''}。`;
  }

  return '';
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
          <div class="qe-label">后端原始输入摘要</div>
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
          <span>后端阶段码</span>
          <code>{{ stage.stage }}</code>
        </div>
        <div v-if="stage.status" class="qe-meta">
          <span>后端状态码</span>
          <code>{{ stage.status }}</code>
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
