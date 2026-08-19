<script lang="ts" setup>
import type { AiEvalApi } from '#/api/ai/eval';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  createEvalCase,
  deleteEvalCase,
  getEvalCases,
  getEvalTask,
  getEvalTaskResults,
  getEvalTasks,
  runEvalTask,
  updateEvalCase,
} from '#/api/ai/eval';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';

defineOptions({ name: 'AiEval' });

/** 知识库选项(全部可见知识库; 空 = 全部用例池) */
const kbOptions = ref<{ label: string; value: number }[]>([]);
const kbNameMap = computed(() =>
  Object.fromEntries(kbOptions.value.map((option) => [option.value, option.label])),
);

/** 分类选项 */
const CATEGORY_OPTIONS = ['检索', '证据', '综合'];

onMounted(async () => {
  loadCases();
  loadTasks();
  try {
    const data = await getKnowledgeBasePage({ pageNo: 1, pageSize: 100 });
    kbOptions.value = (data.list || []).map((item) => ({
      label: item.name,
      value: item.id as number,
    }));
  } catch {
    message.error('知识库列表加载失败');
  }
});

/* ========== Tab1 考题集 ========== */
const activeTab = ref('cases');

const caseList = ref<AiEvalApi.Case[]>([]);
const caseTotal = ref(0);
const caseLoading = ref(false);
const casePageNo = ref(1);
const casePageSize = ref(10);

async function loadCases() {
  caseLoading.value = true;
  try {
    const data = await getEvalCases({
      pageNo: casePageNo.value,
      pageSize: casePageSize.value,
    });
    caseList.value = data.list || [];
    caseTotal.value = data.total || 0;
  } catch {
    message.error('考题列表加载失败');
  } finally {
    caseLoading.value = false;
  }
}

function handleCaseTableChange(pagination: { current?: number; pageSize?: number }) {
  casePageNo.value = pagination.current || 1;
  casePageSize.value = pagination.pageSize || 10;
  loadCases();
}

/** 考题新增/编辑 */
const caseModalOpen = ref(false);
const caseModalLoading = ref(false);
const editingCaseId = ref<number | null>(null);
const caseForm = reactive({
  question: '',
  goldAnswer: '',
  goldChunksText: '',
  kbId: undefined as number | undefined,
  category: undefined as string | undefined,
});

function openCreateCase() {
  editingCaseId.value = null;
  caseForm.question = '';
  caseForm.goldAnswer = '';
  caseForm.goldChunksText = '';
  caseForm.kbId = undefined;
  caseForm.category = undefined;
  caseModalOpen.value = true;
}

function openEditCase(row: AiEvalApi.Case) {
  editingCaseId.value = row.id;
  caseForm.question = row.question || '';
  caseForm.goldAnswer = row.goldAnswer || '';
  caseForm.goldChunksText = (row.goldChunks || []).join(',');
  caseForm.kbId = row.kbId ?? undefined;
  caseForm.category = row.category || undefined;
  caseModalOpen.value = true;
}

/** 逗号分隔文本 → number[](非法项忽略) */
function parseChunks(text: string): number[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((num) => Number.isFinite(num));
}

async function submitCase() {
  const question = caseForm.question.trim();
  if (!question) {
    message.warning('请输入问题');
    return;
  }
  caseModalLoading.value = true;
  const payload = {
    question,
    goldAnswer: caseForm.goldAnswer.trim() || undefined,
    goldChunks: parseChunks(caseForm.goldChunksText),
    kbId: caseForm.kbId,
    category: caseForm.category,
  };
  try {
    if (editingCaseId.value != null) {
      await updateEvalCase({ id: editingCaseId.value, ...payload });
      message.success('考题已更新');
    } else {
      await createEvalCase(payload);
      message.success('考题已创建');
    }
    caseModalOpen.value = false;
    loadCases();
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    caseModalLoading.value = false;
  }
}

async function handleDeleteCase(id: number) {
  try {
    await deleteEvalCase(id);
    message.success('删除成功');
    loadCases();
  } catch {
    // 拦截器已提示
  }
}

/* ========== Tab2 评测任务 ========== */
const taskList = ref<AiEvalApi.Task[]>([]);
const taskTotal = ref(0);
const taskLoading = ref(false);
const taskPageNo = ref(1);
const taskPageSize = ref(10);

async function loadTasks() {
  taskLoading.value = true;
  try {
    const data = await getEvalTasks({
      pageNo: taskPageNo.value,
      pageSize: taskPageSize.value,
    });
    taskList.value = data.list || [];
    taskTotal.value = data.total || 0;
  } catch {
    message.error('评测任务列表加载失败');
  } finally {
    taskLoading.value = false;
  }
}

function handleTaskTableChange(pagination: { current?: number; pageSize?: number }) {
  taskPageNo.value = pagination.current || 1;
  taskPageSize.value = pagination.pageSize || 10;
  loadTasks();
}

/** 发起评测 */
const runModalOpen = ref(false);
const runModalLoading = ref(false);
const runKbId = ref<number | undefined>(undefined);

function openRunModal() {
  runKbId.value = undefined;
  runModalOpen.value = true;
}

async function submitRun() {
  runModalLoading.value = true;
  try {
    const taskId = await runEvalTask({ kbId: runKbId.value });
    message.success(`评测任务已发起: #${taskId}`);
    runModalOpen.value = false;
    loadTasks();
    startPoll(taskId);
  } catch {
    // 拦截器已提示
  } finally {
    runModalLoading.value = false;
  }
}

/* ========== 轮询(发起后 5s 一次, RUNNING 最长 5 分钟; 卸载/终止即清理) ========== */
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 300_000;
let pollTimer: number | null = null;
let pollTaskId: number | null = null;
let pollElapsedMs = 0;

function startPoll(taskId: number) {
  stopPoll();
  pollTaskId = taskId;
  pollElapsedMs = 0;
  pollTimer = window.setTimeout(pollTick, POLL_INTERVAL_MS);
}

function stopPoll() {
  if (pollTimer != null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollTaskId = null;
  pollElapsedMs = 0;
}

function pollTick() {
  if (pollTaskId == null) {
    return;
  }
  pollElapsedMs += POLL_INTERVAL_MS;
  getEvalTask(pollTaskId)
    .then((task) => {
      const terminal = task.status !== 'RUNNING';
      const timeout = pollElapsedMs >= POLL_MAX_MS;
      if (terminal) {
        const finishedId = pollTaskId;
        stopPoll();
        message.success(`评测任务 #${finishedId} 已完成: ${task.status}`);
        loadTasks();
        if (detailOpen.value && detailTask.value?.id === finishedId) {
          loadDetail(finishedId);
        }
      } else if (timeout) {
        stopPoll();
        message.warning('评测任务仍在进行中, 请稍后手动刷新');
      } else {
        pollTimer = window.setTimeout(pollTick, POLL_INTERVAL_MS);
      }
    })
    .catch(() => {
      // 瞬时错误不中断轮询(仍在预算内则继续)
      if (pollElapsedMs < POLL_MAX_MS && pollTaskId != null) {
        pollTimer = window.setTimeout(pollTick, POLL_INTERVAL_MS);
      } else {
        stopPoll();
      }
    });
}

onBeforeUnmount(stopPoll);

/* ========== 任务详情 ========== */
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailTask = ref<AiEvalApi.Task | null>(null);
const detailResults = ref<AiEvalApi.TaskResult[]>([]);

async function loadDetail(taskId: number) {
  detailLoading.value = true;
  try {
    const [task, results] = await Promise.all([
      getEvalTask(taskId),
      getEvalTaskResults(taskId),
    ]);
    detailTask.value = task;
    detailResults.value = results || [];
  } catch {
    message.error('任务详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

function openDetail(row: AiEvalApi.Task) {
  detailTask.value = row;
  detailResults.value = [];
  detailOpen.value = true;
  loadDetail(row.id);
}

function closeDetail() {
  detailOpen.value = false;
  detailTask.value = null;
  detailResults.value = [];
}

/* ========== 格式化 ========== */
/** 时间(epoch 毫秒或 ISO 字符串) → 可读格式 */
function formatTime(value?: string | number): string {
  if (value == null || value === '') {
    return '-';
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  return value.replace('T', ' ').slice(0, 19);
}

/** 指标 0~1 → 百分比 */
function fmtPercent(value?: number): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

/** 任务状态 Tag */
function statusTag(status?: string) {
  if (status === 'RUNNING') {
    return { color: 'processing', text: '进行中' };
  }
  if (status === 'DONE') {
    return { color: 'success', text: '完成' };
  }
  if (status === 'FAILED') {
    return { color: 'error', text: '失败' };
  }
  return { color: 'default', text: status || '-' };
}

/** 闸门徽标 */
function gatePassTag(gatePass?: 0 | 1 | null) {
  if (gatePass === 1) {
    return { color: 'green', text: '通过' };
  }
  if (gatePass === 0) {
    return { color: 'red', text: '未通过' };
  }
  return { color: 'default', text: '—' };
}

/** 任务指标列摘要 */
function metricsSummary(metrics?: AiEvalApi.TaskMetrics | null): string {
  if (!metrics) {
    return '';
  }
  const parts = [
    `R@5 ${fmtPercent(metrics.recallAt5)}`,
    `MRR ${fmtPercent(metrics.mrr)}`,
    `NDCG ${fmtPercent(metrics.ndcg)}`,
    `忠实 ${fmtPercent(metrics.faithfulness)}`,
    `幻觉 ${fmtPercent(metrics.hallucinationRate)}`,
    `引用 ${fmtPercent(metrics.citationAccuracy)}`,
  ];
  return parts.join(' / ');
}
</script>

<template>
  <Page auto-content-height>
    <div class="p-4">
      <Tabs v-model:active-key="activeTab">
        <!-- ================= 考题集 ================= -->
        <Tabs.TabPane key="cases" tab="考题集">
          <div class="mb-3">
            <Button type="primary" @click="openCreateCase">新增考题</Button>
          </div>
          <Table
            :data-source="caseList"
            :loading="caseLoading"
            :pagination="{
              current: casePageNo,
              pageSize: casePageSize,
              total: caseTotal,
              showSizeChanger: true,
              showTotal: (total: number) => `共 ${total} 条`,
            }"
            row-key="id"
            size="middle"
            @change="handleCaseTableChange"
          >
            <Table.Column key="id" title="ID" data-index="id" width="70" />
            <Table.Column
              key="question"
              title="问题"
              data-index="question"
              ellipsis
            />
            <Table.Column
              key="goldAnswer"
              title="标准答案"
              data-index="goldAnswer"
              ellipsis
            >
              <template #default="{ text }">{{ text || '-' }}</template>
            </Table.Column>
            <Table.Column key="goldChunks" title="标准证据 Chunks" width="160">
              <template #default="{ record }">
                <span v-if="record.goldChunks?.length" class="font-mono text-xs">
                  {{ record.goldChunks.map((chunk: number) => `#${chunk}`).join(', ') }}
                </span>
                <span v-else>-</span>
              </template>
            </Table.Column>
            <Table.Column key="kbId" title="知识库" width="150">
              <template #default="{ record }">
                {{ record.kbId ? kbNameMap[record.kbId] || `#${record.kbId}` : '全部' }}
              </template>
            </Table.Column>
            <Table.Column key="category" title="分类" width="90">
              <template #default="{ record }">
                <Tag v-if="record.category" color="blue">{{ record.category }}</Tag>
                <span v-else>-</span>
              </template>
            </Table.Column>
            <Table.Column key="createTime" title="创建时间" width="170">
              <template #default="{ record }">
                {{ formatTime(record.createTime) }}
              </template>
            </Table.Column>
            <Table.Column key="action" title="操作" width="130">
              <template #default="{ record }">
                <Space>
                  <Button type="link" size="small" @click="openEditCase(record)">
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除该考题？"
                    ok-text="删除"
                    cancel-text="取消"
                    @confirm="handleDeleteCase(record.id)"
                  >
                    <Button type="link" size="small" danger>删除</Button>
                  </Popconfirm>
                </Space>
              </template>
            </Table.Column>
          </Table>
        </Tabs.TabPane>

        <!-- ================= 评测任务 ================= -->
        <Tabs.TabPane key="tasks" tab="评测任务">
          <div class="mb-3">
            <Button type="primary" @click="openRunModal">发起评测</Button>
          </div>
          <Table
            :data-source="taskList"
            :loading="taskLoading"
            :pagination="{
              current: taskPageNo,
              pageSize: taskPageSize,
              total: taskTotal,
              showSizeChanger: true,
              showTotal: (total: number) => `共 ${total} 条`,
            }"
            row-key="id"
            size="middle"
            @change="handleTaskTableChange"
          >
            <Table.Column key="id" title="ID" data-index="id" width="70" />
            <Table.Column key="status" title="状态" width="90">
              <template #default="{ record }">
                <Tag :color="statusTag(record.status).color">
                  {{ statusTag(record.status).text }}
                </Tag>
              </template>
            </Table.Column>
            <Table.Column key="gatePass" title="闸门" width="90">
              <template #default="{ record }">
                <Tag :color="gatePassTag(record.gatePass).color">
                  {{ gatePassTag(record.gatePass).text }}
                </Tag>
              </template>
            </Table.Column>
            <Table.Column key="metrics" title="指标(均值)">
              <template #default="{ record }">
                <span v-if="record.metrics" class="text-xs">
                  {{ metricsSummary(record.metrics) }}
                </span>
                <span v-else-if="record.status === 'RUNNING'" class="text-xs text-muted-foreground">
                  评测中…
                </span>
                <span v-else>-</span>
              </template>
            </Table.Column>
            <Table.Column key="caseCount" title="考题数" width="80">
              <template #default="{ record }">{{ record.caseCount ?? '-' }}</template>
            </Table.Column>
            <Table.Column key="kbId" title="知识库" width="120">
              <template #default="{ record }">
                {{ record.kbId ? kbNameMap[record.kbId] || `#${record.kbId}` : '全部' }}
              </template>
            </Table.Column>
            <Table.Column key="time" title="时间" width="210">
              <template #default="{ record }">
                <span class="text-xs">
                  {{ formatTime(record.startTime) }} ~ {{ formatTime(record.endTime) }}
                </span>
              </template>
            </Table.Column>
            <Table.Column key="action" title="操作" width="80">
              <template #default="{ record }">
                <Button type="link" size="small" @click="openDetail(record)">
                  详情
                </Button>
              </template>
            </Table.Column>
          </Table>
        </Tabs.TabPane>
      </Tabs>
    </div>

    <!-- 考题新增/编辑 Modal -->
    <Modal
      v-model:open="caseModalOpen"
      :title="editingCaseId == null ? '新增考题' : `编辑考题 #${editingCaseId}`"
      :confirm-loading="caseModalLoading"
      ok-text="保存"
      cancel-text="取消"
      width="640px"
      @ok="submitCase"
    >
      <Form layout="vertical" class="mt-2">
        <Form.Item label="问题(必填)" required>
          <Input.TextArea
            v-model:value="caseForm.question"
            :rows="3"
            placeholder="输入评测问题, 如: X100 Pro 碎屏能免费修吗"
          />
        </Form.Item>
        <Form.Item label="标准答案">
          <Input.TextArea
            v-model:value="caseForm.goldAnswer"
            :rows="3"
            placeholder="期望的标准答案(可选, 用于人工对照)"
          />
        </Form.Item>
        <Form.Item label="标准证据 Chunks">
          <Input
            v-model:value="caseForm.goldChunksText"
            placeholder="逗号分隔的 chunk 编号, 如: 2101,2093"
          />
        </Form.Item>
        <Form.Item label="知识库">
          <Select
            v-model:value="caseForm.kbId"
            :options="kbOptions"
            placeholder="不限定(全部用例池)"
            allow-clear
            show-search
            option-filter-prop="label"
          />
        </Form.Item>
        <Form.Item label="分类">
          <Select
            v-model:value="caseForm.category"
            :options="CATEGORY_OPTIONS.map((category) => ({ label: category, value: category }))"
            placeholder="选择分类"
            allow-clear
          />
        </Form.Item>
      </Form>
    </Modal>

    <!-- 发起评测 Modal -->
    <Modal
      v-model:open="runModalOpen"
      title="发起评测"
      :confirm-loading="runModalLoading"
      ok-text="发起"
      cancel-text="取消"
      width="480px"
      @ok="submitRun"
    >
      <Form layout="vertical" class="mt-2">
        <Form.Item label="评测知识库(留空 = 全部考题)">
          <Select
            v-model:value="runKbId"
            :options="kbOptions"
            placeholder="全部用例(不限定知识库)"
            allow-clear
            show-search
            option-filter-prop="label"
          />
        </Form.Item>
      </Form>
    </Modal>

    <!-- 任务详情 Drawer -->
    <Drawer
      v-model:open="detailOpen"
      title="评测任务详情"
      :width="860"
      destroy-on-close
      @close="closeDetail"
    >
      <div v-if="detailLoading" class="py-16 text-center text-muted-foreground">
        加载中…
      </div>
      <div v-else-if="detailTask" class="flex flex-col gap-4">
        <!-- 摘要 -->
        <div class="rounded-lg border border-border bg-muted/30 p-4">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="font-bold">任务 #{{ detailTask.id }}</span>
            <Tag :color="statusTag(detailTask.status).color">
              {{ statusTag(detailTask.status).text }}
            </Tag>
            <Tag :color="gatePassTag(detailTask.gatePass).color">
              闸门 {{ gatePassTag(detailTask.gatePass).text }}
            </Tag>
            <span class="ml-auto text-xs text-muted-foreground">
              {{ detailTask.model || '-' }}
            </span>
          </div>
          <Descriptions :column="3" size="small">
            <Descriptions.Item label="考题数">
              {{ detailTask.caseCount ?? '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="知识库">
              {{ detailTask.kbId ? kbNameMap[detailTask.kbId] || `#${detailTask.kbId}` : '全部' }}
            </Descriptions.Item>
            <Descriptions.Item label="时间">
              <span class="text-xs">
                {{ formatTime(detailTask.startTime) }} ~ {{ formatTime(detailTask.endTime) }}
              </span>
            </Descriptions.Item>
          </Descriptions>
          <div v-if="detailTask.metrics" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>通过率: {{ fmtPercent(detailTask.metrics.passRate) }}</span>
            <span>Recall@5: {{ fmtPercent(detailTask.metrics.recallAt5) }}</span>
            <span>MRR: {{ fmtPercent(detailTask.metrics.mrr) }}</span>
            <span>NDCG@5: {{ fmtPercent(detailTask.metrics.ndcg) }}</span>
            <span>忠实度: {{ fmtPercent(detailTask.metrics.faithfulness) }}</span>
            <span>幻觉率: {{ fmtPercent(detailTask.metrics.hallucinationRate) }}</span>
            <span>引用准确率: {{ fmtPercent(detailTask.metrics.citationAccuracy) }}</span>
          </div>
        </div>

        <!-- 失败用例 -->
        <div v-if="detailTask.failCases?.length" class="rounded-lg border border-red-500/40 bg-red-50/50 p-4 dark:bg-red-950/20">
          <div class="mb-1 text-sm font-bold text-red-600 dark:text-red-400">
            未达标用例 ({{ detailTask.failCases.length }})
          </div>
          <div
            v-for="failCase in detailTask.failCases"
            :key="failCase.caseId"
            class="text-sm leading-6 text-red-600 dark:text-red-400"
          >
            考题 #{{ failCase.caseId }}: {{ failCase.failReasons || '未达标' }}
          </div>
        </div>

        <!-- 逐题结果 -->
        <div class="text-sm font-bold">逐题结果 ({{ detailResults.length }})</div>
        <div v-if="detailResults.length === 0" class="py-10 text-center text-muted-foreground">
          <Empty description="暂无逐题结果" />
        </div>
        <Table
          v-else
          :data-source="detailResults"
          :loading="detailLoading"
          :pagination="false"
          row-key="caseId"
          size="small"
        >
          <Table.Column key="caseId" title="考题ID" data-index="caseId" width="80" />
          <Table.Column key="question" title="问题" data-index="question" ellipsis />
          <Table.Column key="passed" title="达标" width="70">
            <template #default="{ record }">
              <Tag :color="record.passed ? 'success' : 'error'">
                {{ record.passed ? '✓' : '✗' }}
              </Tag>
            </template>
          </Table.Column>
          <Table.Column key="recallAt5" title="R@5" width="70">
            <template #default="{ record }">{{ fmtPercent(record.recallAt5) }}</template>
          </Table.Column>
          <Table.Column key="mrr" title="MRR" width="70">
            <template #default="{ record }">{{ fmtPercent(record.mrr) }}</template>
          </Table.Column>
          <Table.Column key="ndcg" title="NDCG" width="75">
            <template #default="{ record }">{{ fmtPercent(record.ndcg) }}</template>
          </Table.Column>
          <Table.Column key="faithfulness" title="忠实" width="70">
            <template #default="{ record }">{{ fmtPercent(record.faithfulness) }}</template>
          </Table.Column>
          <Table.Column key="hallucinationRate" title="幻觉" width="70">
            <template #default="{ record }">{{ fmtPercent(record.hallucinationRate) }}</template>
          </Table.Column>
          <Table.Column key="citationAccuracy" title="引用" width="70">
            <template #default="{ record }">{{ fmtPercent(record.citationAccuracy) }}</template>
          </Table.Column>
          <Table.Column key="failReasons" title="未达标原因" ellipsis>
            <template #default="{ record }">
              <span v-if="record.failReasons" class="text-red-600 dark:text-red-400">
                {{ record.failReasons }}
              </span>
              <span v-else>-</span>
            </template>
          </Table.Column>
          <template #expandedRowRender="{ record }">
            <div class="px-4 py-2">
              <div class="mb-1 text-xs text-muted-foreground">
                traceId: {{ record.traceId || '-' }}
              </div>
              <div class="whitespace-pre-wrap break-all text-sm leading-6">
                {{ record.answer || '(无回答)' }}
              </div>
            </div>
          </template>
        </Table>
      </div>
    </Drawer>
  </Page>
</template>
