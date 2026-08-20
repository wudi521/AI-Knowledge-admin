<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { KnowledgeApi } from '#/api/ai/knowledge';

import {
  Page,
  useVbenModal,
  confirm,
} from '@vben/common-ui';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';

import { useRouter } from 'vue-router';

import { Tag, message } from 'ant-design-vue';

import { deleteKnowledgeBase, getKnowledgeBasePage } from '#/api/ai/knowledge';

const router = useRouter();

import { CHUNK_STRATEGY_TEXT, useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';
import EvalManage from './knowledge/modules/eval-manage.vue';
import IntentManage from './knowledge/modules/intent-manage.vue';
import SlotManage from './knowledge/modules/slot-manage.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/** 评测管理弹窗 */
const [EvalManageModal, evalManageModalApi] = useVbenModal({
  connectedComponent: EvalManage,
  destroyOnClose: true,
});

/** 打开评测管理 */
function handleEvalManage(row: KnowledgeApi.KnowledgeBase) {
  evalManageModalApi.setData(row).open();
}

/** 意图管理弹窗 */
const [IntentManageModal, intentManageModalApi] = useVbenModal({
  connectedComponent: IntentManage,
  destroyOnClose: true,
});

/** 打开意图管理 */
function handleIntentManage(row: KnowledgeApi.KnowledgeBase) {
  intentManageModalApi.setData(row).open();
}

/** 槽位管理弹窗 */
const [SlotManageModal, slotManageModalApi] = useVbenModal({
  connectedComponent: SlotManage,
  destroyOnClose: true,
});

/** 打开槽位管理 */
function handleSlotManage(row: KnowledgeApi.KnowledgeBase) {
  slotManageModalApi.setData(row).open();
}

/** 新增知识库 */
function handleAdd() {
  formModalApi.setData(null).open();
}

/** 编辑知识库 */
function handleEdit(row: KnowledgeApi.KnowledgeBase) {
  formModalApi.setData(row).open();
}

/** 删除知识库 */
async function handleDelete(row: KnowledgeApi.KnowledgeBase) {
  await confirm(`确认删除知识库「${row.name}」吗？`);
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
  <Page auto-content-height>
    <FormModal @success="handleRefresh" />
    <EvalManageModal />
    <IntentManageModal />
    <SlotManageModal />
    <Grid table-title="知识库列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '新增知识库',
              type: 'primary',
              icon: ACTION_ICON.ADD,
              onClick: handleAdd,
            },
          ]"
        />
      </template>
      <template #chunkStrategy="{ row }">
        <span>{{ CHUNK_STRATEGY_TEXT[row.chunkStrategy] || row.chunkStrategy || '-' }}</span>
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
              label: '检索测试',
              icon: ACTION_ICON.SEARCH,
              onClick: () =>
                router.push({
                  path: '/ai/retrieval',
                  query: { kbId: row.id },
                }),
            },
            {
              label: '意图管理',
              icon: 'lucide:settings',
              auth: ['knowledge:intent:query'],
              onClick: () => handleIntentManage(row),
            },
            {
              label: '槽位管理',
              icon: 'lucide:list-checks',
              auth: ['knowledge:kb-slot:query'],
              onClick: () => handleSlotManage(row),
            },
            {
              label: '评测',
              icon: 'lucide:clipboard-check',
              auth: ['eval:task:run'],
              onClick: () => handleEvalManage(row),
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
