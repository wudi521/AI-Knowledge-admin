<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import type { KnowledgeDocument } from '#/api/ai/knowledge';

import { onBeforeUnmount, ref } from 'vue';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, Tag, Upload, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import type { ActionItem } from '#/adapter/vxe-table';

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

/** 片段管理弹窗状态 */
const chunkModalOpen = ref(false);
const currentDocumentId = ref<number>();

/** 打开片段管理弹窗 */
function openChunkModal(row: KnowledgeDocument) {
  currentDocumentId.value = row.id;
  chunkModalOpen.value = true;
}

function handleRefresh() {
  gridApi.query();
}

/** 文件后缀 → 文档类型 */
function getDocType(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    md: 'MD',
    pdf: 'PDF',
    doc: 'WORD',
    docx: 'WORD',
    xls: 'EXCEL',
    xlsx: 'EXCEL',
    ppt: 'PPT',
    pptx: 'PPT',
    txt: 'TXT',
  };
  return map[ext] || 'OTHER';
}

/** 计算文件 SHA-256(Web Crypto, 分块读取防大文件卡死) */
async function calcFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 上传文档: 先传 MinIO, 再登记 ai_document(带文件指纹, 重复文档由后端拦截) */
async function handleUploadFile(file: File) {
  // 校验知识库已选择
  const kbId = (await gridApi.formApi.getValues()).kbId;
  if (!kbId) {
    message.warning('请先在搜索区选择知识库');
    return false;
  }
  try {
    message.loading({ content: `上传中: ${file.name}...`, key: 'upload' });
    // 统一走文件服务: { file, directory } 结构
    const url = (await uploadFile({ file, directory: 'kb-docs' } as any)) as unknown as string;
    // 计算文件指纹(重复文档拦截, BR-002)
    const fileHash = await calcFileHash(file);
    const newDocId = await createDocument({
      kbId,
      name: file.name,
      type: getDocType(file.name),
      storagePath: url,
      fileHash,
    });
    message.success({ content: `「${file.name}」已登记入库(待解析)`, key: 'upload' });
    // 全量刷新一次以显示新行, 之后只对该行做原位状态轮询(不整页刷新)
    handleRefresh();
    pollRowStatus(newDocId);
  } catch (e: any) {
    const msg = e?.message || '上传失败';
    message.error({ content: `「${file.name}」${msg}`, key: 'upload' });
  }
  return false;
}

/** 删除文档(popConfirm 已确认) */
async function handleDelete(row: KnowledgeDocument) {
  try {
    await deleteDocument(row.id!);
    message.success('删除成功');
    handleRefresh();
  } catch {
    message.error('删除失败');
  }
}

/** 下载文档(MinIO 直链) */
function downloadDocument(row: KnowledgeDocument) {
  if (row.storagePath) {
    window.open(row.storagePath, '_blank');
  } else {
    message.warning('文档无存储路径');
  }
}

/** 切分策略 → 中文 */
const CHUNK_STRATEGY_TEXT: Record<string, string> = {
  Semantic: '语义切分',
  ParentChild: '父子切分',
  Table: '表格切分',
  FAQ: '问答切分',
  Policy: '条款切分',
};

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'default', text: '待解析' },
  PARSING: { color: 'processing', text: '解析中' },
  EMBEDDING: { color: 'warning', text: '向量化中' },
  EXTRACTING: { color: 'processing', text: '抽取中' },
  REVIEW: { color: 'blue', text: '审核中' },
  INDEXED: { color: 'success', text: '已入库' },
  PUBLISHED: { color: 'success', text: '已发布' },
  FAILED: { color: 'error', text: '失败' },
};

/** 去审核(跳转审核台并按文档过滤) */
const router = useRouter();
function goReview(row: KnowledgeDocument) {
  router.push({ path: '/ai/review', query: { docId: row.id, status: 'PENDING' } });
}

/** 操作列(审核中显示"去审核"; 失败/审核中可重试抽取) */
function buildActions(row: KnowledgeDocument): ActionItem[] {
  const actions: ActionItem[] = [];
  if (row.parseStatus === 'REVIEW') {
    actions.push({
      label: '去审核',
      type: 'link',
      icon: ACTION_ICON.AUDIT,
      onClick: () => goReview(row),
    });
  }
  if (row.parseStatus === 'FAILED' || row.parseStatus === 'REVIEW') {
    actions.push({
      label: '重试抽取',
      type: 'link',
      icon: ACTION_ICON.REFRESH,
      onClick: () => handleRetryExtract(row),
    });
  }
  actions.push({
    label: '删除',
    icon: ACTION_ICON.DELETE,
    danger: true,
    popConfirm: {
      title: `确认删除文档「${row.name}」吗？将同时删除其全部 AI 片段！`,
      confirm: () => handleDelete(row),
    },
  });
  return actions;
}

/** 重试 LLM 抽取(抽取失败恢复) */
async function handleRetryExtract(row: KnowledgeDocument) {
  try {
    await retryExtractByDocId(row.id!);
    message.success('已重新抽取, 请稍后刷新查看');
    handleRefresh();
  } catch {
    message.error('重试抽取失败(请确认模型服务正常)');
  }
}

/** 已加载行缓存(供单行状态原位刷新, 不整页重查) */
const rowsById = new Map<number, KnowledgeDocument>();
let rowPollTimer: ReturnType<typeof setInterval> | null = null;

/** 单行状态轮询: 只更新该行字段(grid keepSource 原位生效), 终态后停止 */
function pollRowStatus(docId: number) {
  stopRowPolling();
  let ticks = 0;
  rowPollTimer = setInterval(async () => {
    ticks += 1;
    try {
      const doc = await getDocument(docId);
      const row = rowsById.get(docId);
      if (!doc || !row) {
        stopRowPolling();
        return;
      }
      row.parseStatus = doc.parseStatus;
      row.chunkCount = doc.chunkCount;
      row.errorMsg = doc.errorMsg;
      row.versionNo = doc.versionNo;
      row.versionStatus = doc.versionStatus;
      if (
        ticks > 60 ||
        ['PUBLISHED', 'FAILED', 'INDEXED'].includes(doc.parseStatus)
      ) {
        stopRowPolling();
      }
    } catch {
      stopRowPolling();
    }
  }, 10000);
}

function stopRowPolling() {
  if (rowPollTimer) {
    clearInterval(rowPollTimer);
    rowPollTimer = null;
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema() as VbenFormSchema[],
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          const data = await getDocumentPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
          // 记录已加载行, 供上传后单行原位刷新
          for (const d of data.list ?? []) {
            rowsById.set(d.id!, d);
          }
          return data;
        },
      },
    },
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    toolbarConfig: {
      refresh: true,
      search: true,
    },
  } as VxeTableGridOptions<KnowledgeDocument>,
});

onBeforeUnmount(() => stopRowPolling());
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="入库管线 · 文档列表">
      <template #toolbar-tools>
        <Upload
          :show-upload-list="false"
          :before-upload="handleUploadFile"
          :multiple="false"
        >
          <Button type="primary" :icon="ACTION_ICON.UPLOAD">上传文档</Button>
        </Upload>
      </template>
      <template #name="{ row }">
        <a-tooltip title="点击下载">
          <a class="text-blue-500 hover:underline" @click="downloadDocument(row)">
            {{ row.name }}
          </a>
        </a-tooltip>
      </template>
      <template #type="{ row }">
        <Tag>{{ row.type }}</Tag>
      </template>
      <template #chunkStrategy="{ row }">
        <span>{{ CHUNK_STRATEGY_TEXT[row.chunkStrategy] || row.chunkStrategy || '-' }}</span>
      </template>
      <template #status="{ row }">
        <Tag :color="(row.parseStatus && STATUS_TAG[row.parseStatus]?.color) || 'default'">
          {{ (row.parseStatus && STATUS_TAG[row.parseStatus]?.text) || row.parseStatus }}
        </Tag>
        <a-tooltip v-if="row.parseStatus === 'FAILED' && row.errorMsg" :title="row.errorMsg">
          <span class="ml-1 cursor-help text-xs text-red-500">ⓘ</span>
        </a-tooltip>
      </template>
      <template #chunkCount="{ row }">
        <a
          v-if="row.parseStatus === 'INDEXED' || row.parseStatus === 'PUBLISHED'"
          class="text-blue-500 hover:underline"
          @click="openChunkModal(row)"
        >
          {{ row.chunkCount ?? 0 }}
        </a>
        <span v-else class="text-muted-foreground">-</span>
      </template>
      <template #versionNo="{ row }">
        <span>{{ row.versionNo || '-' }}</span>
      </template>
      <template #operation="{ row }">
        <TableAction :actions="buildActions(row)" />
      </template>
    </Grid>
    <ChunkModal
      v-model:open="chunkModalOpen"
      :document-id="currentDocumentId"
      @success="handleRefresh"
    />
  </Page>
</template>
