<script lang="ts" setup>
import type { AiEvalApi } from '#/api/ai/eval';
import type { KnowledgeDocument } from '#/api/ai/knowledge';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
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
  generateEvalCases,
  getEvalCases,
  getEvalTask,
  getEvalTaskResults,
  getEvalTasks,
  runEvalTask,
  updateEvalCase,
} from '#/api/ai/eval';
import { getChunkPage, type AiChunkApi } from '#/api/ai/chunk';
import { getDocumentPage, getKnowledgeBasePage } from '#/api/ai/knowledge';

const route = useRoute();
const router = useRouter();
defineOptions({ name: 'AiEval' });

const activeTab = ref('cases');
const selectedKbId = ref<number | undefined>(Number(route.query.kbId) || undefined);
const kbOptions = ref<{ label: string; value: number }[]>([]);
const kbNameMap = computed(() => Object.fromEntries(kbOptions.value.map((o) => [o.value, o.label])));
const CATEGORY_OPTIONS = ['检索', '证据', '综合'];

/** ===== 用例集 ===== */
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
      kbId: selectedKbId.value,
    });
    caseList.value = data.list || [];
    caseTotal.value = data.total || 0;
  } finally {
    caseLoading.value = false;
  }
}

const generating = ref(false);
async function autoGenerateCases() {
  if (!selectedKbId.value) {
    message.warning('请先选择一个知识库');
    return;
  }
  generating.value = true;
  try {
    const count = await generateEvalCases(selectedKbId.value);
    message.success(count > 0 ? `已自动生成 ${count} 条评测用例` : '该知识库已有足够用例，无需重复生成');
    await loadCases();
  } catch (e: any) {
    message.error(e?.message || '自动生成评测用例失败');
  } finally {
    generating.value = false;
  }
}

/** 用例编辑：标准证据不再输入 Chunk ID，改为知识库 → 文档 → 内容选择。 */
const caseModalOpen = ref(false);
const caseModalLoading = ref(false);
const editingCaseId = ref<number>();
const caseForm = reactive({
  question: '',
  goldAnswer: '',
  kbId: undefined as number | undefined,
  category: undefined as string | undefined,
  documentId: undefined as number | undefined,
  goldChunks: [] as number[],
});
const documentOptions = ref<{ label: string; value: number }[]>([]);
const evidenceOptions = ref<{ label: string; value: number }[]>([]);
const evidenceLoading = ref(false);

function resetCaseForm() {
  editingCaseId.value = undefined;
  caseForm.question = '';
  caseForm.goldAnswer = '';
  caseForm.kbId = selectedKbId.value;
  caseForm.category = undefined;
  caseForm.documentId = undefined;
  caseForm.goldChunks = [];
  documentOptions.value = [];
  evidenceOptions.value = [];
}

async function loadDocuments(kbId?: number) {
  caseForm.documentId = undefined;
  evidenceOptions.value = [];
  if (!kbId) {
    documentOptions.value = [];
    return;
  }
  const data = await getDocumentPage({ pageNo: 1, pageSize: 200, kbId });
  documentOptions.value = (data.list || [])
    .filter((d: KnowledgeDocument) => d.id != null && d.parseStatus === 'PUBLISHED')
    .map((d: KnowledgeDocument) => ({ label: `${d.name} · ${d.versionNo || ''}`, value: d.id! }));
}

function evidenceLabel(chunk: AiChunkApi.Chunk): string {
  let prefix = '';
  try {
    const meta = chunk.metadata ? JSON.parse(chunk.metadata) : {};
    if (meta.claimNo) prefix = `权利要求${meta.claimNo} · `;
    else if (meta.sectionTitle || meta.sectionType) prefix = `${meta.sectionTitle || meta.sectionType} · `;
  } catch {
    // 元数据只用于显示，解析失败不影响选择
  }
  const text = (chunk.content || '').replaceAll(/\s+/g, ' ').slice(0, 90);
  return `${prefix}${text}${chunk.content?.length > 90 ? '…' : ''}`;
}

async function loadEvidence(documentId?: number) {
  evidenceOptions.value = [];
  caseForm.goldChunks = [];
  if (!documentId) return;
  evidenceLoading.value = true;
  try {
    const data = await getChunkPage({ pageNo: 1, pageSize: 200, documentId });
    evidenceOptions.value = (data.list || []).map((chunk) => ({
      label: evidenceLabel(chunk),
      value: chunk.id,
    }));
  } finally {
    evidenceLoading.value = false;
  }
}

async function openCreateCase() {
  resetCaseForm();
  if (caseForm.kbId) await loadDocuments(caseForm.kbId);
  caseModalOpen.value = true;
}

async function openEditCase(row: AiEvalApi.Case) {
  resetCaseForm();
  editingCaseId.value = row.id;
  caseForm.question = row.question || '';
  caseForm.goldAnswer = row.goldAnswer || '';
  caseForm.kbId = row.kbId;
  caseForm.category = row.category;
  caseForm.goldChunks = [...(row.goldChunks || [])];
  if (row.kbId) await loadDocuments(row.kbId);
  // 旧用例可能只有 chunk id、没有文档上下文；保留已有证据，不要求用户重填。
  evidenceOptions.value = (row.goldChunks || []).map((id) => ({ label: `已保存证据 #${id}`, value: id }));
  caseModalOpen.value = true;
}

async function submitCase() {
  const question = caseForm.question.trim();
  if (!question || !caseForm.kbId) {
    message.warning('问题和知识库为必填项');
    return;
  }
  caseModalLoading.value = true;
  const payload = {
    question,
    goldAnswer: caseForm.goldAnswer.trim() || undefined,
    goldChunks: caseForm.goldChunks,
    kbId: caseForm.kbId,
    category: caseForm.category,
  };
  try {
    if (editingCaseId.value) {
      await updateEvalCase({ id: editingCaseId.value, ...payload });
      message.success('评测用例已更新');
    } else {
      await createEvalCase(payload);
      message.success('评测用例已创建');
    }
    caseModalOpen.value = false;
    await loadCases();
  } finally {
    caseModalLoading.value = false;
  }
}

async function deleteCase(id: number) {
  await deleteEvalCase(id);
  message.success('已删除');
  loadCases();
}

/** ===== 评测任务 ===== */
const taskList = ref<AiEvalApi.Task[]>([]);
const taskTotal = ref(0);
const taskLoading = ref(false);
const taskPageNo = ref(1);
const taskPageSize = ref(10);
const running = ref(false);

async function loadTasks() {
  taskLoading.value = true;
  try {
    const data = await getEvalTasks({
      pageNo: taskPageNo.value,
      pageSize: taskPageSize.value,
      kbId: selectedKbId.value,
    });
    taskList.value = data.list || [];
    taskTotal.value = data.total || 0;
  } finally {
    taskLoading.value = false;
  }
}

let pollTimer: number | null = null;
function stopPoll() {
  if (pollTimer != null) window.clearInterval(pollTimer);
  pollTimer = null;
}
function startPoll() {
  stopPoll();
  pollTimer = window.setInterval(() => loadTasks(), 5000);
}

async function runEvaluation() {
  if (!selectedKbId.value) {
    message.warning('请先选择要评测的知识库');
    return;
  }
  running.value = true;
  try {
    const taskId = await runEvalTask({ kbId: selectedKbId.value });
    message.success(`评测任务 #${taskId} 已启动`);
    activeTab.value = 'tasks';
    await loadTasks();
    startPoll();
  } catch (e: any) {
    message.error(e?.message || '发起评测失败');
  } finally {
    running.value = false;
  }
}

const detailOpen = ref(false);
const detailTask = ref<AiEvalApi.Task>();
const detailResults = ref<AiEvalApi.TaskResult[]>([]);
const detailLoading = ref(false);

async function openTaskDetail(row: AiEvalApi.Task) {
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const [task, results] = await Promise.all([getEvalTask(row.id), getEvalTaskResults(row.id)]);
    detailTask.value = task;
    detailResults.value = results || [];
  } finally {
    detailLoading.value = false;
  }
}

function fmtPercent(value?: number): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}
function statusTag(status?: string) {
  if (status === 'RUNNING') return { color: 'processing', text: '评测中' };
  if (status === 'DONE') return { color: 'success', text: '已完成' };
  if (status === 'FAILED') return { color: 'error', text: '失败' };
  return { color: 'default', text: status || '-' };
}
function gateTag(value?: 0 | 1 | null) {
  if (value === 1) return { color: 'green', text: '质量闸门通过' };
  if (value === 0) return { color: 'red', text: '质量闸门未通过' };
  return { color: 'default', text: '未判定' };
}
function openTrace(traceId?: string) {
  if (traceId) router.push({ path: '/kb/ops/query-trace', query: { traceId } });
}

watch(selectedKbId, () => {
  casePageNo.value = 1;
  taskPageNo.value = 1;
  loadCases();
  loadTasks();
});

onMounted(async () => {
  try {
    const data = await getKnowledgeBasePage({ pageNo: 1, pageSize: 200 });
    kbOptions.value = (data.list || []).filter((kb) => kb.id != null).map((kb) => ({ label: kb.name, value: kb.id! }));
  } catch {
    message.error('知识库列表加载失败');
  }
  await Promise.all([loadCases(), loadTasks()]);
});
onBeforeUnmount(stopPoll);
</script>

<template>
  <Page
    auto-content-height
    title="质量评测"
    description="用标准问题、答案和证据验证检索与回答质量。发布闸门需要的质量结果也在这里产生。"
  >
    <Alert
      class="mb-4"
      type="info"
      show-icon
      message="优先使用“自动生成用例”从已发布知识构建基准集；手工用例通过选择文档和证据内容建立，不需要知道 Chunk ID。"
    />

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Select
        v-model:value="selectedKbId"
        :options="kbOptions"
        placeholder="选择知识库"
        style="width: 280px"
        allow-clear
        show-search
        option-filter-prop="label"
      />
      <Button :loading="generating" :disabled="!selectedKbId" @click="autoGenerateCases">自动生成用例</Button>
      <Button type="primary" :loading="running" :disabled="!selectedKbId" @click="runEvaluation">运行质量评测</Button>
    </div>

    <Tabs v-model:active-key="activeTab">
      <Tabs.TabPane key="cases" tab="评测用例">
        <div class="mb-3"><Button type="primary" ghost @click="openCreateCase">新增手工用例</Button></div>
        <Table
          :data-source="caseList"
          :loading="caseLoading"
          row-key="id"
          size="small"
          :pagination="{ current: casePageNo, pageSize: casePageSize, total: caseTotal, showSizeChanger: true }"
          @change="(p: any) => { casePageNo = p.current || 1; casePageSize = p.pageSize || 10; loadCases(); }"
        >
          <Table.Column title="问题" data-index="question" ellipsis />
          <Table.Column title="标准答案" data-index="goldAnswer" ellipsis>
            <template #default="{ text }">{{ text || '未设置' }}</template>
          </Table.Column>
          <Table.Column title="标准证据" :width="120">
            <template #default="{ record }">{{ record.goldChunks?.length ? `${record.goldChunks.length} 条` : '未设置' }}</template>
          </Table.Column>
          <Table.Column title="知识库" :width="150">
            <template #default="{ record }">{{ kbNameMap[record.kbId] || '-' }}</template>
          </Table.Column>
          <Table.Column title="类型" data-index="category" :width="90" />
          <Table.Column title="操作" :width="140">
            <template #default="{ record }">
              <Space>
                <a @click="openEditCase(record)">编辑</a>
                <Popconfirm title="确认删除该评测用例？" @confirm="deleteCase(record.id)"><a class="text-red-500">删除</a></Popconfirm>
              </Space>
            </template>
          </Table.Column>
        </Table>
      </Tabs.TabPane>

      <Tabs.TabPane key="tasks" tab="评测记录">
        <Table
          :data-source="taskList"
          :loading="taskLoading"
          row-key="id"
          size="small"
          :pagination="{ current: taskPageNo, pageSize: taskPageSize, total: taskTotal, showSizeChanger: true }"
          @change="(p: any) => { taskPageNo = p.current || 1; taskPageSize = p.pageSize || 10; loadTasks(); }"
        >
          <Table.Column title="任务" :width="90"><template #default="{ record }">#{{ record.id }}</template></Table.Column>
          <Table.Column title="状态" :width="100"><template #default="{ record }"><Tag :color="statusTag(record.status).color">{{ statusTag(record.status).text }}</Tag></template></Table.Column>
          <Table.Column title="发布闸门" :width="140"><template #default="{ record }"><Tag :color="gateTag(record.gatePass).color">{{ gateTag(record.gatePass).text }}</Tag></template></Table.Column>
          <Table.Column title="用例数" data-index="caseCount" :width="90" />
          <Table.Column title="通过率" :width="100"><template #default="{ record }">{{ fmtPercent(record.metrics?.passRate) }}</template></Table.Column>
          <Table.Column title="忠实度" :width="100"><template #default="{ record }">{{ fmtPercent(record.metrics?.faithfulness) }}</template></Table.Column>
          <Table.Column title="引用准确率" :width="110"><template #default="{ record }">{{ fmtPercent(record.metrics?.citationAccuracy) }}</template></Table.Column>
          <Table.Column title="操作" :width="90"><template #default="{ record }"><a @click="openTaskDetail(record)">详情</a></template></Table.Column>
        </Table>
      </Tabs.TabPane>
    </Tabs>

    <Modal
      v-model:open="caseModalOpen"
      :title="editingCaseId ? '编辑评测用例' : '新增评测用例'"
      :confirm-loading="caseModalLoading"
      width="720px"
      @ok="submitCase"
    >
      <Form layout="vertical">
        <Form.Item label="知识库" required>
          <Select
            v-model:value="caseForm.kbId"
            :options="kbOptions"
            placeholder="选择知识库"
            @change="(value: number) => loadDocuments(value)"
          />
        </Form.Item>
        <Form.Item label="问题" required><Input.TextArea v-model:value="caseForm.question" :rows="2" placeholder="输入一个用户真实会问的问题" /></Form.Item>
        <Form.Item label="标准答案"><Input.TextArea v-model:value="caseForm.goldAnswer" :rows="3" placeholder="人工确认的标准答案；可选" /></Form.Item>
        <Form.Item label="类型"><Select v-model:value="caseForm.category" :options="CATEGORY_OPTIONS.map((x) => ({ label: x, value: x }))" allow-clear /></Form.Item>
        <Form.Item label="标准证据文档">
          <Select
            v-model:value="caseForm.documentId"
            :options="documentOptions"
            placeholder="选择已发布文档"
            allow-clear
            show-search
            option-filter-prop="label"
            @change="(value: number) => loadEvidence(value)"
          />
        </Form.Item>
        <Form.Item label="标准证据内容">
          <Select
            v-model:value="caseForm.goldChunks"
            mode="multiple"
            :options="evidenceOptions"
            :loading="evidenceLoading"
            placeholder="选择能支撑标准答案的知识内容"
            allow-clear
            show-search
            option-filter-prop="label"
            :max-tag-count="3"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Drawer v-model:open="detailOpen" title="评测详情" width="820" :loading="detailLoading">
      <Descriptions v-if="detailTask" bordered size="small" :column="3" class="mb-4">
        <Descriptions.Item label="任务">#{{ detailTask.id }}</Descriptions.Item>
        <Descriptions.Item label="状态">{{ statusTag(detailTask.status).text }}</Descriptions.Item>
        <Descriptions.Item label="发布闸门">{{ gateTag(detailTask.gatePass).text }}</Descriptions.Item>
      </Descriptions>
      <Table :data-source="detailResults" row-key="caseId" size="small" :pagination="false">
        <Table.Column title="问题" data-index="question" ellipsis />
        <Table.Column title="结果" :width="90"><template #default="{ record }"><Tag :color="record.passed ? 'green' : 'red'">{{ record.passed ? '通过' : '未通过' }}</Tag></template></Table.Column>
        <Table.Column title="R@5" :width="80"><template #default="{ record }">{{ fmtPercent(record.recallAt5) }}</template></Table.Column>
        <Table.Column title="忠实度" :width="90"><template #default="{ record }">{{ fmtPercent(record.faithfulness) }}</template></Table.Column>
        <Table.Column title="失败原因" data-index="failReasons" ellipsis />
        <Table.Column title="操作" :width="90"><template #default="{ record }"><a v-if="record.traceId" @click="openTrace(record.traceId)">查询链路</a><span v-else>-</span></template></Table.Column>
      </Table>
    </Drawer>
  </Page>
</template>
