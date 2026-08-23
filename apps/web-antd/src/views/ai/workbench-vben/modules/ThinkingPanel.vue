<script setup lang="ts">
/**
 * P0-10B 执行过程面板(Thinking UI)
 * 展示真实可审计的 Query Stage(与 Query Trace 同源), 不展示隐藏思维链。
 */
import { computed, ref } from 'vue';

export interface StreamStage {
  stage?: string;
  status?: string;
  label?: string;
  elapsedMs?: number;
  inputSummary?: string;
  outputSummary?: string;
}

const props = defineProps<{
  stages: StreamStage[];
  running?: boolean;
  evidenceCount?: number;
  verifyStatus?: string;
}>();

const expanded = ref(false);

/** 默认简化清单: 由阶段流推导友好步骤 */
const steps = computed(() => {
  const list: { label: string; done: boolean }[] = [];
  const doneOf = (s: string) => {
    const match = props.stages.find((x) => x.stage === s);
    return match?.status === 'DONE' || match?.status === 'SUCCEEDED';
  };
  list.push({ label: '已理解问题', done: doneOf('ANALYZE') });
  list.push({ label: '已锁定知识库/目标', done: doneOf('SCOPE_FILTER') || doneOf('DOC_LOOKUP') });
  list.push({
    label:
      props.evidenceCount != null
        ? `已筛选 ${props.evidenceCount} 条证据`
        : '正在检索知识',
    done: props.evidenceCount != null,
  });
  list.push({ label: '正在生成回答', done: doneOf('GENERATE') });
  const verify = props.verifyStatus;
  list.push({ label: '回答校验通过', done: verify === 'PASSED' });
  return list;
});

const isRunning = computed(() => props.running ?? false);
</script>

<template>
  <div class="tp-panel" :class="{ running: isRunning }">
    <div class="tp-head" @click="expanded = !expanded">
      <span class="tp-title">
        <span v-if="isRunning" class="tp-spin" />
        {{ isRunning ? '正在处理…' : '执行过程' }}
      </span>
      <span class="tp-toggle">{{ expanded ? '收起 ▲' : '展开 ▼' }}</span>
    </div>

    <!-- 简化模式 -->
    <div v-if="!expanded" class="tp-steps">
      <span
        v-for="(s, i) in steps"
        :key="i"
        class="tp-step"
        :class="{ done: s.done }"
      >
        {{ s.done ? '✓' : '·' }} {{ s.label }}
      </span>
    </div>

    <!-- 展开详情 -->
    <div v-else class="tp-detail">
      <div class="tp-stage-list">
        <div v-if="stages.length === 0" class="tp-empty">暂无阶段信息</div>
        <div
          v-for="(s, i) in stages"
          :key="`${s.stage}-${i}`"
          class="tp-stage-row"
        >
          <span class="tp-stage-code">{{ s.stage }}</span>
          <span class="tp-stage-label">{{ s.label || s.stage }}</span>
          <span class="tp-stage-status" :class="(s.status || '').toLowerCase()">
            {{ s.status }}
          </span>
          <span v-if="s.elapsedMs != null" class="tp-stage-ms">
            {{ s.elapsedMs }}ms
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tp-panel {
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--wb-text-secondary, #6b7280);
  background: rgba(128, 128, 128, 0.06);
}
.tp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
.tp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tp-spin {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(128, 128, 128, 0.3);
  border-top-color: #1677ff;
  border-radius: 50%;
  animation: tp-rotate 0.8s linear infinite;
}
@keyframes tp-rotate {
  to {
    transform: rotate(360deg);
  }
}
.tp-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 6px;
}
.tp-step {
  color: #9ca3af;
}
.tp-step.done {
  color: #22c55e;
}
.tp-detail {
  margin-top: 6px;
}
.tp-stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.tp-stage-code {
  font-family: monospace;
  font-weight: 600;
  color: #374151;
}
.tp-stage-label {
  flex: 1;
  color: #4b5563;
}
.tp-stage-status {
  font-size: 11px;
}
.tp-stage-status.done,
.tp-stage-status.succeeded {
  color: #22c55e;
}
.tp-stage-status.running {
  color: #1677ff;
}
.tp-stage-status.skipped {
  color: #9ca3af;
}
.tp-stage-status.failed {
  color: #ef4444;
}
.tp-stage-ms {
  color: #9ca3af;
  font-family: monospace;
}
.tp-empty {
  color: #9ca3af;
}
</style>
