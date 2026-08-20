<script lang="ts" setup>
import type { AiEvalApi } from '#/api/ai/eval';
import type { AiKnowledgeKnowledgeApi } from '#/api/ai/knowledge/knowledge';

import { computed, onUnmounted, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Button, message, Progress, Tag } from 'ant-design-vue';

import {
  generateEvalCases,
  getEvalTask,
  getEvalTasks,
  runEvalTask,
} from '#/api/ai/eval';

/** 当前知识库 */
const kb = ref<AiKnowledgeKnowledgeApi.Knowledge>();
/** 最近一次评测任务 */
const latestTask = ref<AiEvalApi.Task | null>(null);
const listLoading = ref(false);
/** 一键评测进行中 */
const running = ref(false);
/** 轮询定时器 */
let pollTimer: ReturnType<typeof setInterval> | null = null;

const getTitle = computed(() => {
  return kb.value ? `评测 - ${kb.value.name}` : '评测';
});

const gateTag = computed(() => {
  const t = latestTask.value;
  if (!t) {
    return null;
  }
  if (t.status === 'RUNNING') {
    return { color: 'processing', text: '评测中…' };
  }
  if (t.status === 'FAILED') {
    return { color: 'red', text: '任务失败' };
  }
  if (t.gatePass === 1) {
    return { color: 'green', text: '闸门已通过(可发布)' };
  }
  return { color: 'orange', text: '未达标(发布被拦截)' };
});

/** 加载该库最近一次评测任务 */
async function loadLatestTask() {
  if (!kb.value) {
    return;
  }
  listLoading.value = true;
  try {
    const page = await getEvalTasks({
      kbId: kb.value.id,
      pageNo: 1,
      pageSize: 1,
    });
    latestTask.value = (page.list || [])[0] || null;
  } catch {
    latestTask.value = null;
  } finally {
    listLoading.value = false;
  }
}

/** 轮询任务直到非 RUNNING */
async function pollTask(taskId: number) {
  return new Promise<AiEvalApi.Task>((resolve) => {
    let polls = 0;
    pollTimer = setInterval(async () => {
      polls++;
      try {
        const t = await getEvalTask(taskId);
        latestTask.value = t;
        if (t.status !== 'RUNNING' || polls >= 60) {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          resolve(t);
        }
      } catch {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        resolve({ id: taskId, status: 'FAILED' } as AiEvalApi.Task);
      }
    }, 5000);
  });
}

/** 一键评测: 生成考题 -> 发起任务 -> 轮询结果 */
async function handleRunEval() {
  if (!kb.value || running.value) {
    return;
  }
  running.value = true;
  try {
    // 1. 生成用例(该库已有≥5个则跳过)
    const generated = await generateEvalCases(kb.value.id);
    if (generated > 0) {
      message.success(`已自动生成 ${generated} 个考题`);
    } else if (generated === 0) {
      message.info('未生成新考题(已有足量用例或无已发布内容), 直接用现有考题评测');
    } else {
      message.warning('考题生成失败, 使用现有考题评测');
    }
    // 2. 发起评测任务
    const taskId = await runEvalTask({ kbId: kb.value.id });
    message.success(`评测任务已发起: #${taskId}, 轮询结果中…`);
    // 3. 轮询
    const done = await pollTask(taskId);
    if (done.status === 'DONE') {
      message.success(
        done.gatePass === 1
          ? '评测完成, 闸门已通过 ✅'
          : `评测完成, 未全达标(${done.metrics?.passedCount ?? 0}/${done.metrics?.caseCount ?? 0} 题), 发布仍被拦截`,
      );
    } else {
      message.error('评测任务执行失败');
    }
    await loadLatestTask();
  } catch {
    message.error('一键评测失败');
  } finally {
    running.value = false;
  }
}

const [EvalModal, modalApi] = useVbenModal({
  showConfirmButton: false,
  showCancelButton: false,
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      kb.value = undefined;
      latestTask.value = null;
      return;
    }
    kb.value = modalApi.getData<AiKnowledgeKnowledgeApi.Knowledge>();
    await loadLatestTask();
  },
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
</script>

<template>
  <EvalModal :title="getTitle" class="w-3/5">
    <div class="flex flex-col gap-4">
      <!-- 一键评测 -->
      <div class="flex flex-wrap items-center gap-3">
        <Button type="primary" :loading="running" @click="handleRunEval">
          生成考题并评测
        </Button>
        <span v-if="running" class="text-xs text-muted-foreground">
          自动命题 + 评测中(约 1~3 分钟), 请稍候…
        </span>
      </div>

      <!-- 最近评测状态 -->
      <div class="rounded-lg border border-border bg-muted/30 p-4">
        <div v-if="listLoading" class="text-center text-muted-foreground">
          加载中…
        </div>
        <div v-else-if="!latestTask" class="text-muted-foreground">
          该知识库还没有评测记录。点『生成考题并评测』: AI 从已发布内容自动出题 →
          发起评测 → 全指标达标后闸门放行, 才能发布文档。
        </div>
        <div v-else class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">最近评测 #{{ latestTask.id }}</span>
            <Tag v-if="gateTag" :color="gateTag.color">
              {{ gateTag.text }}
            </Tag>
            <span class="text-xs text-muted-foreground">
              {{ latestTask.caseCount ?? 0 }} 题
            </span>
          </div>
          <div v-if="latestTask.metrics" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <div class="text-xs text-muted-foreground">Recall@5</div>
              <Progress
                :percent="Math.round((latestTask.metrics.recallAt5 ?? 0) * 100)"
                :status="
                  (latestTask.metrics.recallAt5 ?? 0) >= 0.9 ? 'success' : 'exception'
                "
              />
            </div>
            <div>
              <div class="text-xs text-muted-foreground">MRR</div>
              <Progress
                :percent="Math.round((latestTask.metrics.mrr ?? 0) * 100)"
                :status="(latestTask.metrics.mrr ?? 0) >= 0.8 ? 'success' : 'exception'"
              />
            </div>
            <div>
              <div class="text-xs text-muted-foreground">NDCG@5</div>
              <Progress
                :percent="Math.round((latestTask.metrics.ndcg ?? 0) * 100)"
                :status="(latestTask.metrics.ndcg ?? 0) >= 0.8 ? 'success' : 'exception'"
              />
            </div>
            <div>
              <div class="text-xs text-muted-foreground">忠实度</div>
              <Progress
                :percent="Math.round((latestTask.metrics.faithfulness ?? 0) * 100)"
                :status="
                  (latestTask.metrics.faithfulness ?? 0) >= 0.95 ? 'success' : 'exception'
                "
              />
            </div>
            <div>
              <div class="text-xs text-muted-foreground">幻觉率</div>
              <Progress
                :percent="Math.round((latestTask.metrics.hallucinationRate ?? 0) * 100)"
                :status="
                  (latestTask.metrics.hallucinationRate ?? 0) <= 0.02 ? 'success' : 'exception'
                "
              />
            </div>
            <div>
              <div class="text-xs text-muted-foreground">引用准确率</div>
              <Progress
                :percent="Math.round((latestTask.metrics.citationAccuracy ?? 0) * 100)"
                :status="
                  (latestTask.metrics.citationAccuracy ?? 0) >= 0.97 ? 'success' : 'exception'
                "
              />
            </div>
          </div>
          <div
            v-if="latestTask.status === 'DONE' && latestTask.failCases?.length"
            class="text-sm text-muted-foreground"
          >
            {{ latestTask.failCases.length }} 题未达标, 可到评测平台页查看/打磨考题后重跑
          </div>
        </div>
      </div>
    </div>
  </EvalModal>
</template>
