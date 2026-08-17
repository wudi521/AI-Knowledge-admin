<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ActionItem } from '#/adapter/vxe-table';
import type { AiReviewApi } from '#/api/ai/review';

import { ref } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Modal, Tag, message } from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  approveReviewItem,
  approveReviewItemSecond,
  getReviewItemPage,
  rejectReviewItem,
} from '#/api/ai/review';
import { publishVersion } from '#/api/ai/version';

const route = useRoute();
const router = useRouter();

/** 条目类型 -> Tag */
const ITEM_TYPE_TAG: Record<string, { color: string; text: string }> = {
  POLICY: { color: 'purple', text: '政策' },
  PRICE: { color: 'red', text: '价格' },
  LEGAL: { color: 'volcano', text: '法务' },
  FAQ: { color: 'green', text: '问答' },
  SOP: { color: 'cyan', text: '流程' },
};

/** 风险等级 -> Tag */
const RISK_TAG: Record<string, { color: string; text: string }> = {
  HIGH: { color: 'error', text: '高风险' },
  MED: { color: 'warning', text: '中风险' },
  LOW: { color: 'success', text: '低风险' },
};

/** 条目状态 -> Tag */
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'processing', text: '待审核' },
  APPROVED: { color: 'success', text: '已通过' },
  REJECTED: { color: 'error', text: '已驳回' },
};

/** 四 tab: 待审核 / 已通过 / 已驳回 / 冲突待裁决 */
const tabs = [
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
  { key: 'CONFLICT', label: '冲突待裁决' },
];
const currentTab = ref<string>((route.query.status as string) || 'PENDING');
const docIdFilter = ref<number | undefined>(
  route.query.docId ? Number(route.query.docId) : undefined,
);

/** 当前版本(发布按钮用) */
const currentVersionId = ref<number>();

/** 切换 tab */
function handleTabChange(key: string) {
  currentTab.value = key;
  if (key === 'CONFLICT') {
    router.push({ path: '/ai/conflict', query: docIdFilter.value ? { docId: docIdFilter.value } : {} });
    return;
  }
  gridApi.query();
}

/** 通过条目 */
async function handleApprove(row: AiReviewApi.ReviewItem) {
  try {
    await approveReviewItem(row.id);
    message.success('已通过');
    gridApi.query();
  } catch {
    message.error('操作失败');
  }
}

/** 价格双人复核 */
async function handleApproveSecond(row: AiReviewApi.ReviewItem) {
  try {
    await approveReviewItemSecond(row.id);
    message.success('双人复核完成');
    gridApi.query();
  } catch {
    message.error('操作失败(需由不同审核人复核)');
  }
}

/** 驳回条目(弹窗填原因) */
const rejectOpen = ref(false);
const rejectRow = ref<AiReviewApi.ReviewItem>();
const rejectReason = ref('');
function openReject(row: AiReviewApi.ReviewItem) {
  rejectRow.value = row;
  rejectReason.value = '';
  rejectOpen.value = true;
}
async function confirmReject() {
  if (!rejectRow.value || !rejectReason.value.trim()) {
    message.warning('请填写驳回原因');
    return;
  }
  try {
    await rejectReviewItem(rejectRow.value.id, rejectReason.value.trim());
    message.success('已驳回');
    rejectOpen.value = false;
    gridApi.query();
  } catch {
    message.error('操作失败');
  }
}

/** 发布当前版本 */
async function handlePublish() {
  if (!currentVersionId.value) {
    message.warning('当前无待发布版本');
    return;
  }
  try {
    await publishVersion(currentVersionId.value);
    message.success('发布成功');
    gridApi.query();
  } catch (e: any) {
    message.error(e?.message || '发布失败(存在未处理完的必审条目或待裁决冲突)');
  }
}

const gridOptions: VxeTableGridOptions<AiReviewApi.ReviewItem> = {
  columns: [
    {
      field: 'title',
      title: '主题',
      minWidth: 180,
      showOverflow: true,
    },
    {
      field: 'itemType',
      title: '类型',
      width: 90,
      slots: { default: 'itemType' },
    },
    {
      field: 'riskLevel',
      title: '风险',
      width: 90,
      slots: { default: 'riskLevel' },
    },
    {
      field: 'content',
      title: '条目内容',
      minWidth: 260,
      showOverflow: true,
    },
    {
      field: 'aiConfidence',
      title: 'AI置信度',
      width: 100,
      formatter: ({ row }: any) =>
        row.aiConfidence == null ? '-' : Number(row.aiConfidence).toFixed(2),
    },
    {
      field: 'docName',
      title: '来源文档',
      minWidth: 140,
      showOverflow: true,
    },
    {
      field: 'reviewer',
      title: '审核人',
      width: 90,
    },
    {
      field: 'status',
      title: '状态',
      width: 90,
      slots: { default: 'status' },
    },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ],
  height: 'auto',
  keepSource: true,
  proxyConfig: {
    ajax: {
      query: async ({ page }) => {
        // 分页时解析当前版本(用于发布按钮)
        const data = await getReviewItemPage({
          pageNo: page.currentPage,
          pageSize: page.pageSize,
          status: currentTab.value === 'CONFLICT' ? undefined : currentTab.value,
          docId: docIdFilter.value,
        });
        const first = data.list[0];
        currentVersionId.value = first?.versionId;
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
    search: false,
  },
};

/** 操作列(通过/驳回/双人复核) */
function buildActions(row: AiReviewApi.ReviewItem): ActionItem[] {
  const actions: ActionItem[] = [];
  if (row.status === 'PENDING') {
    actions.push({
      label: '通过',
      type: 'link',
      icon: ACTION_ICON.AUDIT,
      onClick: () => handleApprove(row),
    });
    actions.push({
      label: '驳回',
      type: 'link',
      danger: true,
      icon: ACTION_ICON.CLOSE,
      onClick: () => openReject(row),
    });
  }
  if (row.itemType === 'PRICE' && row.status === 'APPROVED' && !row.reviewer2) {
    actions.push({
      label: '双人复核',
      type: 'link',
      icon: ACTION_ICON.AUDIT,
      onClick: () => handleApproveSecond(row),
    });
  }
  return actions;
}

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="知识审核台">
      <template #toolbar-tools>
        <a-input-number
          v-model:value="docIdFilter"
          class="w-44"
          placeholder="按文档编号过滤"
          :controls="false"
          @change="gridApi.query()"
        />
        <a-button type="primary" :disabled="!currentVersionId" @click="handlePublish">
          发布当前版本
        </a-button>
      </template>
      <template #toolbar-actions>
        <div class="flex gap-1">
          <a-button
            v-for="tab in tabs"
            :key="tab.key"
            :type="currentTab === tab.key ? 'primary' : 'default'"
            size="small"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </a-button>
        </div>
      </template>
      <template #itemType="{ row }">
        <Tag :color="ITEM_TYPE_TAG[row.itemType]?.color || 'default'">
          {{ ITEM_TYPE_TAG[row.itemType]?.text || row.itemType }}
        </Tag>
      </template>
      <template #riskLevel="{ row }">
        <Tag :color="RISK_TAG[row.riskLevel]?.color || 'default'">
          {{ RISK_TAG[row.riskLevel]?.text || row.riskLevel }}
        </Tag>
      </template>
      <template #status="{ row }">
        <Tag :color="STATUS_TAG[row.status]?.color || 'default'">
          {{ STATUS_TAG[row.status]?.text || row.status }}
        </Tag>
      </template>
      <template #actions="{ row }">
        <TableAction :actions="buildActions(row)" />
      </template>
    </Grid>

    <!-- 驳回原因弹窗(规范: antd Modal z-index 1000 + destroyOnClose) -->
    <Modal
      v-model:open="rejectOpen"
      title="驳回审核条目"
      :z-index="1000"
      :destroy-on-close="true"
      @ok="confirmReject"
    >
      <p class="mb-2 text-muted-foreground">{{ rejectRow?.title }}</p>
      <a-textarea
        v-model:value="rejectReason"
        :rows="3"
        placeholder="请填写驳回原因(必填)"
      />
    </Modal>
  </Page>
</template>
