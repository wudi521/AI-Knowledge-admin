<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { KnowledgeDocument } from '#/api/ai/knowledge';
import type { ActionItem } from '#/adapter/vxe-table';

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import { Alert, Button, Tag, Upload, message } from 'ant-design-vue';
import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentPage,
} from '#/api/ai/knowledge';
import { retryExtractByDocId } from '#/api/ai/review';
import { uploadFile } from '#/api/infra/file';

import ChunkModal from './chunk-modal.vue';
import { useGridColumns, useGridFormSchema } from './data';

const route = useRoute();
const router = useRouter();
const chunkModalOpen = ref(false);
const currentDocumentId = ref<number>();

function openAdvanced(row: KnowledgeDocument) {
  currentDocumentId.value = row.id;
  chunkModalOpen.value = true;
}

function handleRefresh() {
  gridApi.query();
}

function getDocType(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    md: 'MD', pdf: 'PDF', doc: 'WORD', docx: 'WORD', xls: 'EXCEL', xlsx: 'EXCEL',
    ppt: 'PPT', pptx: 'PPT', txt: 'TXT',
  };
  return map[ext] || 'OTHER';
}

async function calcFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleUploadFile(file: File) {
  const kbId = (await gridApi.formApi.getValues()).kbId;
  if (!kbId) {
    message.warning('请先选择要上传到的知识库');
    return false;
  }
  try {
    message.loading({ content: `正在上传：${file.name}`, key: 'upload' });
    const url = (await uploadFile({ file, directory: 'kb-docs' } as any)) as unknown as string;
    const fileHash = await calcFileHash(file);
    const newDocId = await createDocument({
      kbId,
      name: file.name,
      type: getDocType(file.name),
      storagePath: url,
      fileHash,
      // 业务页面不让用户选择 Chunk 算法；由领域适配器/平台默认策略决定。
      chunkStrategy: 'auto',
    });
    message.success({ content: `「${file.name}」上传成功，系统已开始自动处理`, key: 'upload' });
    handleRefresh();
    pollRowStatus(newDocId);
  } catch (e: any) {
    message.error({ content: `「${file.name}」${e?.message || '上传失败'}`, key: 'upload' });
  }
  return false;
}

async function handleDelete(row: KnowledgeDocument) {
  try {
    await deleteDocument(row.id!);
    message.success('删除成功');
    handleRefresh();
  } catch {
    message.error('删除失败');
  }
}

function downloadDocument(row: KnowledgeDocument) {
  if (row.storagePath) window.open(row.storagePath, '_blank');
  else message.warning('原始文件不可用');
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待处理' },
  PARSING: { color: 'processing', text: '解析中' },
  EMBEDDING: { color: 'processing', text: '索引构建中' },
  EXTRACTING: { color: 'processing', text: '知识构建中' },
  REVIEW: { color: 'warning', text: '待审核' },
  INDEXED: { color: 'blue', text: '待发布' },
  PUBLISHED: { color: 'success', text: '已发布' },
  FAILED: { color: 'error', text: '处理失败' },
};

function goReview(row: KnowledgeDocument) {
  router.push({ path: '/ai/review', query: { docId: row.id, status: 'PENDING' } });
}

function viewTrace(row: KnowledgeDocument) {
  router.push({ path: '/kb/ops/document-trace', query: { documentId: row.id } });
}

function buildActions(row: KnowledgeDocument): ActionItem[] {
  const actions: ActionItem[] = [];
  if (row.parseStatus === 'REVIEW') {
    actions.push({ label: '去审核', type: 'link', icon: ACTION_ICON.AUDIT, onClick: () => goReview(row) });
  }
  if (row.parseStatus === 'FAILED') {
    actions.push({ label: '重试处理', type: 'link', icon: ACTION_ICON.REFRESH, onClick: () => handleRetryExtract(row) });
  }
  actions.push({ label: '处理链路', type: 'link', icon: ACTION_ICON.VIEW, onClick: () => viewTrace(row) });
  if (row.parseStatus === 'INDEXED' || row.parseStatus === 'PUBLISHED') {
    actions.push({ label: '高级信息', type: 'link', onClick: () => openAdvanced(row) });
  }
  actions.push({
    label: '删除', icon: ACTION_ICON.DELETE, danger: true,
    popConfirm: { title: `确认删除文档「${row.name}」吗？相关检索数据也会被清理。`, confirm: () => handleDelete(row) },
  });
  return actions;
}

async function handleRetryExtract(row: KnowledgeDocument) {
  try {
    await retryExtractByDocId(row.id!);
    message.success('已重新发起处理');
    handleRefresh();
  } catch {
    message.error('重试失败，请从处理链路查看原因');
  }
}

const rowsById = new Map<number, KnowledgeDocument>();
let rowPollTimer: ReturnType<typeof setInterval> | null = null;
function pollRowStatus(docId: number) {
  stopRowPolling();
  let ticks = 0;
  rowPollTimer = setInterval(async () => {
    ticks += 1;
    try {
      const doc = await getDocument(docId);
      const row = rowsById.get(docId);
      if (!doc || !row) return stopRowPolling();
      Object.assign(row, {
        parseStatus: doc.parseStatus,
        chunkCount: doc.chunkCount,
        errorMsg: doc.errorMsg,
        versionNo: doc.versionNo,
        versionStatus: doc.versionStatus,
      });
      if (ticks > 60 || (doc.parseStatus && ['PUBLISHED', 'FAILED', 'INDEXED', 'REVIEW'].includes(doc.parseStatus))) {
        stopRowPolling();
      }
    } catch {
      stopRowPolling();
    }
  }, 10000);
}
function stopRowPolling() {
  if (rowPollTimer) clearInterval(rowPollTimer);
  rowPollTimer = null;
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() as VbenFormSchema[] },
  gridOptions: {
    columns: useGridColumns(), height: 'auto', keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const data = await getDocumentPage({ pageNo: page.currentPage, pageSize: page.pageSize, ...formValues });
          for (const d of data.list ?? []) rowsById.set(d.id!, d);
          return data;
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<KnowledgeDocument>,
});

onMounted(async () => {
  const kbId = Number(route.query.kbId || 0);
  if (kbId) {
    await gridApi.formApi.setFieldValue('kbId', kbId);
    gridApi.query();
  }
  const docId = Number(route.query.docId || 0);
  if (docId) {
    currentDocumentId.value = docId;
    chunkModalOpen.value = true;
  }
});
onBeforeUnmount(stopRowPolling);
</script>

<template>
  <Page
    auto-content-height
    title="文档管理"
    description="上传资料后由系统自动完成解析、领域抽取、知识构建和索引；需要人工确认的资料进入审核发布。"
  >
    <Alert class="mb-3" type="info" show-icon message="默认使用领域最佳处理策略，无需手工选择切分算法。Chunk、Embedding 等工程信息已下沉到“高级信息/处理链路”。" />
    <Grid table-title="文档">
      <template #toolbar-tools>
        <Upload :show-upload-list="false" :before-upload="handleUploadFile" :multiple="false">
          <Button type="primary" :icon="ACTION_ICON.UPLOAD">上传资料</Button>
        </Upload>
      </template>
      <template #name="{ row }">
        <a-tooltip title="查看原始文件"><a class="text-blue-500 hover:underline" @click="downloadDocument(row)">{{ row.name }}</a></a-tooltip>
      </template>
      <template #type="{ row }"><Tag>{{ row.type }}</Tag></template>
      <template #status="{ row }">
        <Tag :color="(row.parseStatus && STATUS_TAG[row.parseStatus]?.color) || 'default'">{{ (row.parseStatus && STATUS_TAG[row.parseStatus]?.text) || row.parseStatus }}</Tag>
        <a-tooltip v-if="row.parseStatus === 'FAILED' && row.errorMsg" :title="row.errorMsg"><span class="ml-1 cursor-help text-xs text-red-500">ⓘ</span></a-tooltip>
      </template>
      <template #chunkCount="{ row }"><span>{{ row.chunkCount ?? '-' }}</span></template>
      <template #versionNo="{ row }"><span>{{ row.versionNo || '-' }}</span></template>
      <template #operation="{ row }"><TableAction :actions="buildActions(row)" /></template>
    </Grid>
    <ChunkModal v-model:open="chunkModalOpen" :document-id="currentDocumentId" @success="handleRefresh" />
  </Page>
</template>
