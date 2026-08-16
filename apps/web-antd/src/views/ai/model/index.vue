<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ModelApi } from '#/api/ai/model';

import {
  Page,
  useVbenModal,
  confirm,
} from '@vben/common-ui';

import { Tag, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';

import { deleteModelConfig, getModelConfigPage } from '#/api/ai/model';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

function handleRefresh() {
  gridApi.query();
}

function handleAdd() {
  formModalApi.setData(null).open();
}

function handleEdit(row: ModelApi.ModelConfig) {
  formModalApi.setData(row).open();
}

async function handleDelete(row: ModelApi.ModelConfig) {
  await confirm(`确认删除模型「${row.name}」吗？`);
  try {
    await deleteModelConfig(row.id!);
    message.success('删除成功');
    handleRefresh();
  } catch {
    // 取消或失败
  }
}

const TYPE_TAG: Record<string, { color: string; text: string }> = {
  chat: { color: 'blue', text: '对话' },
  embedding: { color: 'purple', text: '向量' },
  rerank: { color: 'orange', text: '重排' },
};

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
          return await getModelConfigPage({
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
  } as VxeTableGridOptions<ModelApi.ModelConfig>,
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <Grid table-title="模型配置列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '新增模型',
              type: 'primary',
              icon: ACTION_ICON.ADD,
              onClick: handleAdd,
            },
          ]"
        />
      </template>
      <template #type="{ row }">
        <Tag :color="TYPE_TAG[row.type]?.color || 'default'">
          {{ TYPE_TAG[row.type]?.text || row.type }}
        </Tag>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status === 1 ? 'success' : 'default'">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </Tag>
      </template>
      <template #operation="{ row }">
        <TableAction
          :actions="[
            {
              label: '编辑',
              icon: ACTION_ICON.EDIT,
              onClick: () => handleEdit(row),
            },
            {
              label: '删除',
              icon: ACTION_ICON.DELETE,
              onClick: () => handleDelete(row),
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
