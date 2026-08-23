<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { KnowledgeApi } from '#/api/ai/knowledge';

import { Page, confirm, useVbenModal } from '@vben/common-ui';
import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { useRouter } from 'vue-router';
import { Tag, message } from 'ant-design-vue';
import { deleteKnowledgeBase, getKnowledgeBasePage } from '#/api/ai/knowledge';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const router = useRouter();

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

function handleEdit(row: KnowledgeApi.KnowledgeBase) {
  formModalApi.setData(row).open();
}

function enterWorkspace(row: KnowledgeApi.KnowledgeBase) {
  router.push({
    path: '/kb/workspace',
    query: { kbId: row.id },
  });
}

async function handleDelete(row: KnowledgeApi.KnowledgeBase) {
  await confirm(`确认删除知识库「${row.name}」吗？知识库内仍有资料时请先完成资料处置。`);
  try {
    await deleteKnowledgeBase(row.id!);
    message.success('删除成功');
    handleRefresh();
  } catch {
    // 取消或失败
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
          return await getKnowledgeBasePage({
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
  } as VxeTableGridOptions<KnowledgeApi.KnowledgeBase>,
});
</script>

<template>
  <Page
    auto-content-height
    title="知识库"
    description="知识库是资料、审核、问答与质量管理的业务工作空间。进入知识库后再处理具体业务，避免在列表页堆叠技术操作。"
  >
    <FormModal @success="handleRefresh" />
    <Grid table-title="知识库">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '新建知识库',
              type: 'primary',
              icon: ACTION_ICON.ADD,
              onClick: handleAdd,
            },
          ]"
        />
      </template>
      <template #domainCode="{ row }">
        <Tag v-if="row.domainCode === 'PATENT'" color="blue">专利</Tag>
        <Tag v-else color="default">通用</Tag>
      </template>
      <template #status="{ row }">
        <Tag :color="row.status === 1 ? 'success' : 'default'">
          {{ row.status === 1 ? '启用' : '停用' }}
        </Tag>
      </template>
      <template #operation="{ row }">
        <TableAction
          :actions="[
            {
              label: '进入知识库',
              type: 'primary',
              icon: 'lucide:arrow-right-circle',
              onClick: () => enterWorkspace(row),
            },
            {
              label: '设置',
              icon: ACTION_ICON.EDIT,
              onClick: () => handleEdit(row),
            },
            {
              label: '删除',
              icon: ACTION_ICON.DELETE,
              danger: true,
              onClick: () => handleDelete(row),
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
