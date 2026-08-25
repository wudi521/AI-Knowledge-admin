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

const normalizedStages = computed(() => {
  const list = props.stages || [];
  if (!initialized.value && props.defaultExpanded && list.length > 0) {
    expanded.value = new Set(list.map((_, index) => index));
    initialized.value = true;
  }
  return list;
});

function toggle(index: number) {
  const next = new Set(expanded.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  expanded.value = next;
}

function statusColor(stage: QueryExecutionStage) {
  if (stage.skipped || stage.status === 'SKIPPED') return 'default';
  if (stage.status === 'FAILED' || stage.status === 'REJECTED') return 'error';
  if (stage.status === 'CLARIFY') return 'warning';
  if (stage.status === 'RUNNING') return 'processing';
  return 'success';
}

function stageTitle(stage: QueryExecutionStage) {
  const code = stage.stage || 'UNKNOWN';
  return `${stage.seq ?? '-'} · ${STAGE_TEXT[code] || code}`;
}
</script>

<template>
  <div v-if="normalizedStages.length" class="qe-inspector">
    <div
      v-for="(stage, index) in normalizedStages"
      :key="`${stage.seq ?? index}-${stage.stage ?? 'stage'}`"
      class="qe-stage"
      :class="{
        'qe-stage-failed':
          stage.status === 'FAILED' || stage.status === 'REJECTED',
        'qe-stage-skipped': stage.skipped || stage.status === 'SKIPPED',
      }"
    >
      <button class="qe-stage-head" type="button" @click="toggle(index)">
        <span class="qe-toggle">
          <ChevronDown v-if="expanded.has(index)" class="size-4" />
          <ChevronRight v-else class="size-4" />
        </span>
        <span class="qe-stage-name">{{ stageTitle(stage) }}</span>
        <Tag :color="statusColor(stage)">{{ stage.status || '-' }}</Tag>
        <span class="qe-stage-ms">{{ stage.elapsedMs ?? 0 }} ms</span>
      </button>

      <div v-if="expanded.has(index)" class="qe-stage-body">
        <div v-if="stage.inputSummary" class="qe-block">
          <div class="qe-label">输入 / 本阶段收到什么</div>
          <pre>{{ stage.inputSummary }}</pre>
        </div>
        <div v-if="stage.outputSummary" class="qe-block qe-output">
          <div class="qe-label">输出 / 本阶段得到什么</div>
          <pre>{{ stage.outputSummary }}</pre>
        </div>
        <div v-if="stage.modelCallId" class="qe-meta">
          <span>Model Call</span>
          <code>{{ stage.modelCallId }}</code>
        </div>
        <div v-if="stage.errorCode || stage.errorMessage" class="qe-error">
          <div class="qe-label">错误</div>
          <div v-if="stage.errorCode">{{ stage.errorCode }}</div>
          <div v-if="stage.errorMessage">{{ stage.errorMessage }}</div>
        </div>
        <div
          v-if="
            !stage.inputSummary && !stage.outputSummary && !stage.errorMessage
          "
          class="qe-empty-detail"
        >
          当前节点还没有更深的诊断数据。若这里是问题来源，需要继续把执行器内部数据下沉到
          Trace。
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
  opacity: 0.72;
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
  min-width: 64px;
  color: #64748b;
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.qe-stage-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid #eef2f7;
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
.qe-error {
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12px;
}
:global(html.dark) .qe-error {
  border-color: #7f1d1d;
  background: #351b1b;
  color: #fca5a5;
}
.qe-empty-detail {
  color: #94a3b8;
  font-size: 11px;
}
</style>
