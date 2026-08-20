<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AiKnowledgeKnowledgeApi } from '#/api/ai/knowledge/knowledge';

import { useRouter } from 'vue-router';

import { DocAlert, Page, useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteKnowledge,
  getKnowledgePage,
} from '#/api/ai/knowledge/knowledge';
import { $t } from '#/locales';

import { useGridColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';
import IntentManage from './modules/intent-manage.vue';
import SlotManage from './modules/slot-manage.vue';

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

/** 意图管理弹窗 */
const [IntentManageModal, intentManageModalApi] = useVbenModal({
  connectedComponent: IntentManage,
  destroyOnClose: true,
});

/** 打开意图管理 */
function handleIntentManage(row: AiKnowledgeKnowledgeApi.Knowledge) {
  intentManageModalApi.setData(row).open();
}

/** 槽位管理弹窗 */
const [SlotManageModal, slotManageModalApi] = useVbenModal({
  connectedComponent: SlotManage,
  destroyOnClose: true,
});

/** 打开槽位管理 */
function handleSlotManage(row: AiKnowledgeKnowledgeApi.Knowledge) {
  slotManageModalApi.setData(row).open();
}

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/** 创建知识库 */
function handleCreate() {
  formModalApi.setData(null).open();
}

/** 编辑知识库 */
function handleEdit(row: AiKnowledgeKnowledgeApi.Knowledge) {
  formModalApi.setData(row).open();
}

/** 删除知识库 */
async function handleDelete(row: AiKnowledgeKnowledgeApi.Knowledge) {
  const hideLoading = message.loading({
    content: $t('ui.actionMessage.deleting', [row.name]),
    duration: 0,
  });
  try {
    await deleteKnowledge(row.id!);
    message.success($t('ui.actionMessage.deleteSuccess', [row.name]));
    handleRefresh();
  } finally {
    hideLoading();
  }
}

/** 跳转到知识库文档页面 */
const router = useRouter();
function handleDocument(id: number) {
  router.push({
    name: 'AiKnowledgeDocument',
    query: { knowledgeId: id },
  });
}

/** 跳转到文档召回测试页面 */
function handleRetrieval(id: number) {
  router.push({
    name: 'AiKnowledgeRetrieval',
    query: { id },
  });
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
          return await getKnowledgePage({
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
  } as VxeTableGridOptions<AiKnowledgeKnowledgeApi.Knowledge>,
});
</script>

<template>
  <Page auto-content-height>
    <template #doc>
      <DocAlert title="AI 手册" url="https://doc.iocoder.cn/ai/build/" />
    </template>
    <FormModal @success="handleRefresh" />
    <IntentManageModal />
    <SlotManageModal />
    <Grid table-title="AI 知识库列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: $t('ui.actionTitle.create', ['AI 知识库']),
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['ai:knowledge:create'],
              onClick: handleCreate,
            },
          ]"
        />
      </template>
      <template #actions="{ row }">
        <TableAction
          :actions="[
            {
              label: $t('common.edit'),
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['ai:knowledge:update'],
              onClick: handleEdit.bind(null, row),
            },
            {
              label: $t('ui.widgets.document'),
              type: 'link',
              icon: ACTION_ICON.BOOK,
              auth: ['ai:knowledge:query'],
              onClick: handleDocument.bind(null, row.id),
            },
            {
              label: '召回测试',
              type: 'link',
              icon: ACTION_ICON.SEARCH,
              auth: ['ai:knowledge:query'],
              onClick: handleRetrieval.bind(null, row.id),
            },
            {
              label: '意图管理',
              type: 'link',
              icon: 'lucide:settings',
              auth: ['knowledge:intent:query'],
              onClick: handleIntentManage.bind(null, row),
            },
            {
              label: '槽位管理',
              type: 'link',
              icon: 'lucide:list-checks',
              auth: ['knowledge:kb-slot:query'],
              onClick: handleSlotManage.bind(null, row),
            },
            {
              label: $t('common.delete'),
              type: 'link',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['ai:knowledge:delete'],
              popConfirm: {
                title: $t('ui.actionMessage.deleteConfirm', [row.name]),
                confirm: handleDelete.bind(null, row),
              },
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
