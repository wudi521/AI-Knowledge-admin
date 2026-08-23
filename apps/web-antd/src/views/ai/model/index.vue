<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ModelApi } from '#/api/ai/model';

import { Page, confirm, useVbenModal } from '@vben/common-ui';
import { Alert, Tag, message } from 'ant-design-vue';
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
  await confirm(`确认删除模型「${row.name}」吗？若该模型正在承担默认场景或降级路由，删除后可能影响在线调用。`);
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
  image: { color: 'cyan', text: '视觉' },
};

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: { schema: useGridFormSchema() },
  gridOptions: {
    columns: useGridColumns(),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          await getModelConfigPage({ pageNo: page.currentPage, pageSize: page.pageSize, ...formValues }),
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<ModelApi.ModelConfig>,
});
</script>

<template>
  <Page
    auto-content-height
    title="模型网关"
    description="统一管理 Chat、Embedding、Rerank 等模型端点。调用时按模型类型、场景和优先级选择可用模型，并在失败时按优先级降级。"
  >
    <Alert
      class="mb-3"
      type="info"
      show-icon
      message="场景 + 优先级决定模型路由顺序。这里配置的是运行时能力，不建议业务页面直接绑定具体模型名称。"
    />
    <FormModal @success="handleRefresh" />
    <Grid table-title="模型与路由配置">
      <template #toolbar-tools>
        <TableAction :actions="[{ label: '新增模型', type: 'primary', icon: ACTION_ICON.ADD, onClick: handleAdd }]" />
      </template>
      <template #type="{ row }">
        <Tag :color="TYPE_TAG[row.type]?.color || 'default'">{{ TYPE_TAG[row.type]?.text || row.type }}</Tag>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status === 1 ? 'success' : 'default'">{{ row.status === 1 ? '启用' : '停用' }}</Tag>
      </template>
      <template #operation="{ row }">
        <TableAction
          :actions="[
            { label: '编辑', icon: ACTION_ICON.EDIT, onClick: () => handleEdit(row) },
            { label: '删除', icon: ACTION_ICON.DELETE, danger: true, onClick: () => handleDelete(row) },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
