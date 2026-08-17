<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import type { KnowledgeDocument } from '#/api/ai/knowledge';

import { ref } from 'vue';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, Tag, Upload, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import type { ActionItem } from '#/adapter/vxe-table';

import {
  createDocument,
  deleteDocument,
  getDocumentPage,
} from '#/api/ai/knowledge';
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

/** 上传文档: 先传 MinIO, 再登记 ai_document */
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
    await createDocument({
      kbId,
      name: file.name,
      type: getDocType(file.name),
      storagePath: url,
    });
    message.success({ content: `「${file.name}」已登记入库(待解析)`, key: 'upload' });
    handleRefresh();
  } catch {
    message.error({ content: `「${file.name}」上传失败`, key: 'upload' });
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

/** 操作列(审核中显示"去审核") */
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
          return await getDocumentPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
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
