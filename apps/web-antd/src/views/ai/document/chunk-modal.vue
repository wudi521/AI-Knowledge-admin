<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AiChunkApi } from '#/api/ai/chunk';

import { computed, nextTick, watch } from 'vue';

import { confirm, useVbenModal } from '@vben/common-ui';

import { Modal, Tag, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getChunkPage, updateChunkStatus } from '#/api/ai/chunk';

import ChunkEditForm from '../chunk/modules/edit-form.vue';

defineOptions({ name: 'AiDocumentChunkModal' });

const props = withDefaults(
  defineProps<{
    open?: boolean;
    documentId?: number;
  }>(),
  {
    open: false,
    documentId: undefined,
  },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  success: [];
}>();

const openComputed = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val),
});

/** 片段类型 → Tag 颜色 */
const CHUNK_TYPE_TAG: Record<string, { color: string; text: string }> = {
  SEMANTIC: { color: 'blue', text: '语义' },
  TABLE: { color: 'orange', text: '表格' },
  FAQ: { color: 'green', text: '问答' },
  POLICY: { color: 'purple', text: '政策' },
};

/** 编辑片段内容弹窗 */
const [EditModal, editModalApi] = useVbenModal({
  connectedComponent: ChunkEditForm,
  destroyOnClose: true,
  // 显式高于外层 antd Modal(默认 z-index 1000), 避免编辑弹窗被片段管理弹窗遮挡
  zIndex: 2000,
});

/** 打开编辑 */
function handleEdit(row: AiChunkApi.Chunk) {
  editModalApi.setData(row).open();
}

/** 状态切换(PUBLISHED ↔ DISABLED) */
async function handleStatusChange(
  newStatus: string,
  row: AiChunkApi.Chunk,
): Promise<boolean | undefined> {
  try {
    await confirm(
      `确认将片段 ${row.id} 的状态切换为【${newStatus === 'PUBLISHED' ? '启用' : '禁用'}】吗？`,
    );
  } catch {
    return false;
  }
  try {
    await updateChunkStatus({ id: row.id, status: newStatus });
    message.success('操作成功');
    return true;
  } catch {
    message.error('操作失败');
    return false;
  }
}

/** 刷新片段列表 */
function handleRefresh() {
  gridApi.query();
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'id', title: '序号', width: 80 },
      {
        field: 'chunkType',
        title: '类型',
        width: 90,
        slots: { default: 'chunkType' },
      },
      {
        type: 'expand',
        width: 40,
        slots: { content: 'expand_content' },
      },
      {
        field: 'content',
        title: '内容',
        minWidth: 300,
        showOverflow: true,
      },
      {
        field: 'parentId',
        title: '父块',
        width: 90,
        align: 'center',
        slots: { default: 'parentId' },
      },
      {
        field: 'status',
        title: '状态',
        width: 100,
        align: 'center',
        cellRender: {
          attrs: { beforeChange: handleStatusChange },
          name: 'CellSwitch',
          props: {
            checkedValue: 'PUBLISHED',
            unCheckedValue: 'DISABLED',
            checkedChildren: '启用',
            unCheckedChildren: '禁用',
          },
        },
      },
      {
        title: '操作',
        width: 90,
        fixed: 'right',
        slots: { default: 'operation' },
      },
    ],
    height: 420,
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          if (!props.documentId) {
            return { list: [], total: 0 };
          }
          return await getChunkPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            documentId: props.documentId,
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
    },
  } as VxeTableGridOptions<AiChunkApi.Chunk>,
});

/** 弹窗打开动画结束后刷新(首次打开由 Grid 自动查询, 再次打开需手动刷新) */
function handleAfterOpenChange(isOpen: boolean) {
  if (!isOpen) {
    return;
  }
  nextTick(() => {
    gridApi.query();
  });
}

/** 文档切换时刷新列表 */
watch(
  () => props.documentId,
  () => {
    if (props.open) {
      gridApi.query();
    }
  },
);
</script>

<template>
  <Modal
    v-model:open="openComputed"
    :title="`片段管理${props.documentId ? ` · 文档 #${props.documentId}` : ''}`"
    width="90%"
    :footer="null"
    :z-index="1000"
    :destroy-on-close="true"
    @after-open-change="handleAfterOpenChange"
  >
    <Grid>
      <template #chunkType="{ row }">
        <Tag
          :color="(row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.color) || 'default'"
        >
          {{ (row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.text) || row.chunkType }}
        </Tag>
      </template>
      <template #expand_content="{ row }">
        <div class="whitespace-pre-wrap border-l-4 border-blue-500 px-2.5 py-5 leading-5">
          <div class="mb-2 text-sm font-bold text-gray-600">完整内容：</div>
          {{ row.content }}
        </div>
      </template>
      <template #parentId="{ row }">
        <span v-if="row.parentId" class="text-blue-500">子块</span>
        <span v-else class="text-gray-400">-</span>
      </template>
      <template #operation="{ row }">
        <TableAction
          :actions="[
            {
              label: '编辑',
              type: 'link',
              icon: ACTION_ICON.EDIT,
              onClick: () => handleEdit(row),
            },
          ]"
        />
      </template>
    </Grid>
  </Modal>
  <EditModal @success="handleRefresh" />
</template>
