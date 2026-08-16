<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AiChunkApi } from '#/api/ai/chunk';

import { ref } from 'vue';

import { Page, confirm, useVbenModal } from '@vben/common-ui';

import { Descriptions, Modal, Tag, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteChunk,
  deleteChunkBatch,
  getChunkPage,
  updateChunkStatus,
} from '#/api/ai/chunk';

import {
  CHUNK_STATUS_TAG,
  CHUNK_TYPE_TAG,
  useGridColumns,
  useGridFormSchema,
} from './data';
import EditForm from './modules/edit-form.vue';

/** 查看详情弹窗 */
const detailOpen = ref(false);
const detailRow = ref<AiChunkApi.Chunk>();

/** 打开查看详情 */
function handleView(row: AiChunkApi.Chunk) {
  detailRow.value = row;
  detailOpen.value = true;
}

/** 编辑片段内容弹窗 */
const [EditModal, editModalApi] = useVbenModal({
  connectedComponent: EditForm,
  destroyOnClose: true,
  // 显式高于同页详情 antd Modal(默认 z-index 1000), 避免编辑弹窗被详情弹窗遮挡
  zIndex: 2000,
});

/** 打开编辑 */
function handleEdit(row: AiChunkApi.Chunk) {
  editModalApi.setData(row).open();
}

/** 刷新列表 */
function handleRefresh() {
  gridApi.query();
}

/** 下载文档(MinIO 直链) */
function downloadDocument(row: AiChunkApi.Chunk) {
  if (row.storagePath) {
    window.open(row.storagePath, '_blank');
  }
}

/** 删除片段(popConfirm 已确认) */
async function handleDelete(row: AiChunkApi.Chunk) {
  try {
    await deleteChunk(row.id);
    message.success('删除成功');
    handleRefresh();
  } catch {
    message.error('删除失败');
  }
}

// 选中行
const selectedRows = ref<AiChunkApi.Chunk[]>([]);
/** checkbox 变化 */
function handleCheckboxChange() {
  selectedRows.value = gridApi.grid.getCheckboxRecords() as AiChunkApi.Chunk[];
}

/** 批量删除选中片段 */
async function handleBatchDelete() {
  if (selectedRows.value.length === 0) {
    message.warning('请先勾选要删除的片段');
    return;
  }
  try {
    await deleteChunkBatch(selectedRows.value.map((r) => r.id));
    message.success(`已删除 ${selectedRows.value.length} 个片段`);
    selectedRows.value = [];
    gridApi.grid.clearCheckboxRow?.();
    handleRefresh();
  } catch {
    message.error('批量删除失败');
  }
}

/** 状态切换(PUBLISHED ↔ DISABLED) */
async function handleStatusChange(checked: boolean, row: AiChunkApi.Chunk) {
  const newStatus = checked ? 'PUBLISHED' : 'DISABLED';
  try {
    await confirm(
      `确认将片段 ${row.id} 的状态切换为【${newStatus === 'PUBLISHED' ? '启用' : '禁用'}】吗？`,
    );
  } catch {
    return;
  }
  try {
    await updateChunkStatus({ id: row.id, status: newStatus });
    row.status = newStatus;
    message.success('操作成功');
  } catch {
    message.error('操作失败');
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
  },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getChunkPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            documentId: formValues.documentId
              ? Number(formValues.documentId)
              : undefined,
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
  } as VxeTableGridOptions<AiChunkApi.Chunk>,
  gridEvents: {
    checkboxChange: handleCheckboxChange,
    checkboxAll: handleCheckboxChange,
  },
});
</script>

<template>
  <Page auto-content-height>
    <EditModal @success="handleRefresh" />
    <Grid table-title="AI 片段管理">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '批量删除',
              icon: ACTION_ICON.DELETE,
              danger: true,
              popConfirm: {
                title: `确认删除选中的 ${selectedRows.length} 个片段吗？将同时删除向量与检索索引！`,
                confirm: handleBatchDelete,
              },
            },
          ]"
        />
      </template>
      <template #expand_content="{ row }">
        <div class="whitespace-pre-wrap border-l-4 border-blue-500 px-2.5 py-5 leading-5">
          <div class="mb-2 text-sm font-bold text-muted-foreground">完整内容：</div>
          {{ row.content }}
        </div>
      </template>
      <template #chunkType="{ row }">
        <Tag
          :color="(row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.color) || 'default'"
        >
          {{ (row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.text) || row.chunkType }}
        </Tag>
      </template>
      <template #documentId="{ row }">
        <a
          v-if="row.documentName"
          class="text-blue-500 hover:underline"
          @click="downloadDocument(row)"
        >
          {{ row.documentName }}
        </a>
        <span v-else>{{ row.documentId }}</span>
      </template>
      <template #status="{ row }">
        <div class="flex items-center justify-center gap-2">
          <Tag
            :color="(row.status && CHUNK_STATUS_TAG[row.status]?.color) || 'default'"
          >
            {{ (row.status && CHUNK_STATUS_TAG[row.status]?.text) || row.status }}
          </Tag>
          <a-switch
            :checked="row.status === 'PUBLISHED'"
            checked-children="启用"
            un-checked-children="禁用"
            @change="(checked: boolean) => handleStatusChange(checked, row)"
          />
        </div>
      </template>
      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: '查看详情',
              type: 'link',
              icon: ACTION_ICON.VIEW,
              onClick: () => handleView(row),
            },
            {
              label: '编辑',
              type: 'link',
              icon: ACTION_ICON.EDIT,
              onClick: () => handleEdit(row),
            },
            {
              label: '删除',
              icon: ACTION_ICON.DELETE,
              danger: true,
              popConfirm: {
                title: `确认删除片段 #${row.id} 吗？将同时删除向量与检索索引！`,
                confirm: handleDelete.bind(null, row),
              },
            },
          ]"
        />
      </template>
    </Grid>

    <Modal v-model:open="detailOpen" title="片段详情" width="680px" :footer="null" :z-index="1000" :destroy-on-close="true">
      <template v-if="detailRow">
        <div class="mb-4">
          <div class="mb-2 text-sm font-bold text-muted-foreground">片段内容：</div>
          <div
            class="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 leading-6"
          >
            {{ detailRow.content }}
          </div>
        </div>
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item label="Chunk ID">
            {{ detailRow.id }}
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            {{ CHUNK_TYPE_TAG[detailRow.chunkType]?.text || detailRow.chunkType }}
          </Descriptions.Item>
          <Descriptions.Item label="所属文档">
            {{ detailRow.documentId }}
          </Descriptions.Item>
          <Descriptions.Item label="父块">
            {{ detailRow.parentId ?? '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {{ CHUNK_STATUS_TAG[detailRow.status]?.text || detailRow.status }}
          </Descriptions.Item>
          <Descriptions.Item label="向量键">
            {{ detailRow.vectorKey || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="元数据" :span="2">
            {{ detailRow.metadata || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间" :span="2">
            {{ detailRow.createTime }}
          </Descriptions.Item>
        </Descriptions>
      </template>
    </Modal>
  </Page>
</template>
