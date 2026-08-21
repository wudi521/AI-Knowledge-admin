<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AiPromptApi } from '#/api/ai/prompt';

import { computed, ref } from 'vue';

import { Page, confirm, useVbenModal } from '@vben/common-ui';

import {
  Input,
  message,
  Table as AntTable,
  Tag,
  type TableColumnsType,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { useVbenForm } from '#/adapter/form';

import {
  createPrompt,
  deletePrompt,
  enablePrompt,
  getPromptKeyList,
  getPromptPage,
  grayEnablePrompt,
  grayOffPrompt,
  updatePrompt,
  validatePrompt,
} from '#/api/ai/prompt';

/** 状态：0停用 1启用全量 2灰度中 */
const STATUS_MAP: Record<number, { text: string; color: string }> = {
  0: { text: '停用', color: 'default' },
  1: { text: '启用', color: 'success' },
  2: { text: '灰度中', color: 'warning' },
};

/** 刷新表格 */
function handleRefresh() {
  gridApi.query();
}

/* ===================== 新增/编辑 ===================== */

const isEdit = ref(false);
const formTitle = computed(() => (isEdit.value ? '编辑提示词' : '新建提示词'));

/** 新增/编辑表单 */
const formSchema: VbenFormSchema[] = [
  { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
  {
    fieldName: 'promptKey',
    label: '提示词标识',
    component: 'Input',
    componentProps: (values) => ({
      placeholder: '如：system.summary',
      clearable: true,
      disabled: !!values.id,
    }),
    rules: 'required',
  },
  {
    fieldName: 'name',
    label: '名称',
    component: 'Input',
    componentProps: { placeholder: '提示词名称', clearable: true },
    rules: 'required',
  },
  {
    fieldName: 'description',
    label: '描述',
    component: 'Input',
    componentProps: { placeholder: '用途说明', clearable: true },
  },
  {
    fieldName: 'content',
    label: '内容',
    component: 'Textarea',
    componentProps: { placeholder: '请输入提示词内容', rows: 8 },
    rules: 'required',
  },
];

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 100,
  },
  layout: 'vertical',
  schema: formSchema,
  showDefaultActions: false,
});

const [FormModal, formModalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    formModalApi.lock();
    try {
      const data = await formApi.getValues();
      if (data.id) {
        await updatePrompt({
          id: data.id,
          name: data.name,
          description: data.description,
          content: data.content,
        });
      } else {
        await createPrompt({
          promptKey: data.promptKey,
          name: data.name,
          description: data.description,
          content: data.content,
        });
      }
      formModalApi.close();
      message.success('操作成功');
      handleRefresh();
    } finally {
      formModalApi.unlock();
    }
  },
  onOpened() {
    const row = formModalApi.getData<AiPromptApi.Prompt>() ?? null;
    isEdit.value = !!row?.id;
    formApi.setValues(row ?? {});
  },
  onClosed() {
    formApi.resetForm();
  },
});

/** 新建 */
function handleCreate() {
  formModalApi.setData(null).open();
}

/** 编辑(仅停用版本) */
function handleEdit(row: AiPromptApi.Prompt) {
  if (row.status !== 0) {
    message.warning('仅可编辑停用版本');
    return;
  }
  formModalApi.setData(row).open();
}

/* ===================== 启用 ===================== */

/** 启用(全量) */
async function handleEnable(row: AiPromptApi.Prompt) {
  await confirm(
    `确认启用提示词「${row.name}」(v${row.version})吗？启用后将以全量模式生效。`,
  );
  try {
    await enablePrompt(row.id);
    message.success('启用成功');
    handleRefresh();
  } catch {
    // 取消或失败
  }
}

/* ===================== 灰度设置 ===================== */

const grayRow = ref<AiPromptApi.Prompt | null>(null);
const grayTenantIdsText = ref('');

const [GrayModal, grayModalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    if (!grayRow.value) {
      return;
    }
    const ids = grayTenantIdsText.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(Number);
    if (ids.length === 0) {
      message.warning('请至少输入一个灰度租户 ID');
      return;
    }
    grayModalApi.lock();
    try {
      await grayEnablePrompt(grayRow.value.id, ids);
      message.success('灰度设置成功');
      grayModalApi.close();
      handleRefresh();
    } finally {
      grayModalApi.unlock();
    }
  },
  onOpened() {
    grayRow.value = grayModalApi.getData<AiPromptApi.Prompt>() ?? null;
    grayTenantIdsText.value = (grayRow.value?.grayTenantIds ?? []).join(',');
  },
});

/** 打开灰度设置 */
function handleGray(row: AiPromptApi.Prompt) {
  grayModalApi.setData(row).open();
}

/** 关闭灰度 */
async function handleGrayOff(row: AiPromptApi.Prompt) {
  await confirm(
    `确认关闭「${row.name}」(v${row.version})的灰度吗？关闭后该版本将回到停用状态。`,
  );
  try {
    await grayOffPrompt(row.id);
    message.success('已关闭灰度');
    handleRefresh();
  } catch {
    // 取消或失败
  }
}

/* ===================== 试运行 ===================== */

const validateRow = ref<AiPromptApi.Prompt | null>(null);
const factsText = ref('{}');
const conclusions = ref<AiPromptApi.ValidateResult[]>([]);

const [ValidateModal, validateModalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    if (!validateRow.value) {
      return;
    }
    let facts: Record<string, unknown>;
    try {
      facts = JSON.parse(factsText.value || '{}');
    } catch {
      message.error('facts 不是合法的 JSON');
      return;
    }
    validateModalApi.lock();
    try {
      conclusions.value = await validatePrompt(validateRow.value.id, facts);
      message.success('校验完成');
    } finally {
      validateModalApi.unlock();
    }
  },
  onOpened() {
    validateRow.value =
      validateModalApi.getData<AiPromptApi.Prompt>() ?? null;
    factsText.value = '{}';
    conclusions.value = [];
  },
});

/** 打开试运行 */
function handleValidate(row: AiPromptApi.Prompt) {
  validateModalApi.setData(row).open();
}

/* ===================== 版本概览 ===================== */

const keyList = ref<AiPromptApi.KeyInfo[]>([]);

const keyColumns: TableColumnsType<AiPromptApi.KeyInfo> = [
  { title: '提示词标识', dataIndex: 'promptKey', key: 'promptKey' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  {
    title: '启用版本',
    dataIndex: 'enabledVersion',
    key: 'enabledVersion',
    width: 90,
    customRender: ({ text }) => text ?? '-',
  },
  {
    title: '灰度版本',
    dataIndex: 'grayVersion',
    key: 'grayVersion',
    width: 90,
    customRender: ({ text }) => text ?? '-',
  },
  {
    title: '灰度租户',
    dataIndex: 'grayTenantIds',
    key: 'grayTenantIds',
    customRender: ({ text }) =>
      Array.isArray(text) && text.length ? text.join(', ') : '-',
  },
  {
    title: '版本数',
    dataIndex: 'versionCount',
    key: 'versionCount',
    width: 90,
  },
];

const [KeyModal, keyModalApi] = useVbenModal({
  onOpened: handleLoadKeyList,
});

/** 打开版本概览 */
function handleOpenKeyList() {
  keyModalApi.open();
}

/** 加载 Key 列表 */
async function handleLoadKeyList() {
  try {
    keyList.value = await getPromptKeyList();
  } catch {
    keyList.value = [];
  }
}

/* ===================== 删除 ===================== */

/** 删除 */
async function handleDelete(row: AiPromptApi.Prompt) {
  await confirm(`确认删除提示词「${row.name}」(v${row.version})吗？`);
  try {
    await deletePrompt(row.id);
    message.success('删除成功');
    handleRefresh();
  } catch {
    // 取消或失败
  }
}

/* ===================== 表格 ===================== */

/** 列表列 */
const columns: VxeTableGridOptions['columns'] = [
  { field: 'id', title: '编号', width: 70 },
  {
    field: 'promptKey',
    title: '提示词标识',
    minWidth: 140,
    showOverflow: true,
  },
  {
    field: 'name',
    title: '名称',
    minWidth: 140,
    showOverflow: true,
  },
  {
    field: 'version',
    title: '版本',
    width: 80,
  },
  {
    field: 'status',
    title: '状态',
    width: 90,
    slots: { default: 'status' },
  },
  {
    field: 'grayTenantIds',
    title: '灰度租户',
    minWidth: 130,
    showOverflow: true,
    slots: { default: 'grayTenantIds' },
  },
  {
    field: 'content',
    title: '内容',
    minWidth: 220,
    showOverflow: true,
  },
  {
    field: 'updateTime',
    title: '更新时间',
    width: 170,
    formatter: 'formatDateTime',
  },
  {
    field: 'operation',
    title: '操作',
    width: 460,
    slots: { default: 'operation' },
    fixed: 'right',
  },
];

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: [
      {
        fieldName: 'promptKey',
        label: '提示词标识',
        component: 'Input',
        componentProps: { placeholder: '请输入提示词标识', clearable: true },
      },
      {
        fieldName: 'status',
        label: '状态',
        component: 'Select',
        componentProps: {
          placeholder: '全部状态',
          options: [
            { label: '停用', value: 0 },
            { label: '启用', value: 1 },
            { label: '灰度中', value: 2 },
          ],
          allowClear: true,
        },
      },
    ],
  },
  gridOptions: {
    columns,
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getPromptPage({
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
  } as VxeTableGridOptions<AiPromptApi.Prompt>,
});
</script>

<template>
  <Page auto-content-height>
    <FormModal :title="formTitle">
      <Form class="mx-4" />
    </FormModal>

    <GrayModal title="灰度设置">
      <div class="mx-4">
        <div class="text-muted-foreground mb-2 text-sm">
          提示词：{{ grayRow?.name }}（v{{ grayRow?.version }}）
        </div>
        <div class="mb-1 text-sm font-medium">灰度租户 ID</div>
        <Input
          v-model:value="grayTenantIdsText"
          placeholder="如：1,2,3（逗号分隔）"
        />
        <div class="text-muted-foreground mt-1 text-xs">
          仅指定租户可见该灰度版本，其他租户继续使用启用版本。
        </div>
      </div>
    </GrayModal>

    <ValidateModal title="试运行">
      <div class="mx-4">
        <div class="text-muted-foreground mb-2 text-sm">
          提示词：{{ validateRow?.name }}（v{{ validateRow?.version }}）
        </div>
        <div class="mb-1 text-sm font-medium">facts（JSON）</div>
        <Input.TextArea
          v-model:value="factsText"
          :rows="6"
          placeholder='默认 {}，如 {"意图": "订单查询"}'
        />
        <div class="text-muted-foreground mt-1 text-xs">
          点击「确定」运行校验
        </div>
        <div
          v-if="conclusions.length"
          class="mt-3 space-y-1"
        >
          <div
            v-for="(item, index) in conclusions"
            :key="index"
            class="flex items-start gap-2"
          >
            <Tag v-if="item.code" color="blue">{{ item.code }}</Tag>
            <span class="text-sm">{{ item.text }}</span>
          </div>
        </div>
        <div v-else class="text-muted-foreground mt-3 text-sm">
          校验结果将显示在此处
        </div>
      </div>
    </ValidateModal>

    <KeyModal title="版本概览" :footer="false">
      <div class="mx-4">
        <AntTable
          :columns="keyColumns"
          :data-source="keyList"
          :pagination="false"
          row-key="promptKey"
          size="small"
        />
      </div>
    </KeyModal>

    <Grid table-title="提示词列表">
      <template #toolbar-tools>
        <TableAction
          :actions="[
            {
              label: '新建提示词',
              type: 'primary',
              icon: ACTION_ICON.ADD,
              auth: ['model:prompt:create'],
              onClick: handleCreate,
            },
            {
              label: '版本概览',
              type: 'primary',
              icon: ACTION_ICON.VIEW,
              auth: ['model:prompt:query'],
              onClick: handleOpenKeyList,
            },
          ]"
        />
      </template>
      <template #status="{ row }">
        <Tag :color="STATUS_MAP[row.status]?.color || 'default'">
          {{ STATUS_MAP[row.status]?.text || row.status }}
        </Tag>
      </template>
      <template #grayTenantIds="{ row }">
        <span class="text-muted-foreground">
          {{ (row.grayTenantIds || []).join(', ') || '-' }}
        </span>
      </template>
      <template #operation="{ row }">
        <TableAction
          :actions="[
            {
              label: '编辑',
              type: 'link',
              icon: ACTION_ICON.EDIT,
              auth: ['model:prompt:update'],
              ifShow: () => row.status === 0,
              onClick: () => handleEdit(row),
            },
            {
              label: '启用',
              type: 'link',
              icon: 'lucide:play-circle',
              auth: ['model:prompt:update'],
              ifShow: () => row.status === 0,
              onClick: () => handleEnable(row),
            },
            {
              label: '灰度设置',
              type: 'link',
              icon: 'lucide:users',
              auth: ['model:prompt:update'],
              ifShow: () => row.status === 0,
              onClick: () => handleGray(row),
            },
            {
              label: '关闭灰度',
              type: 'link',
              icon: 'lucide:user-x',
              auth: ['model:prompt:update'],
              ifShow: () => row.status === 2,
              onClick: () => handleGrayOff(row),
            },
            {
              label: '试运行',
              type: 'link',
              icon: 'lucide:flask-conical',
              auth: ['model:prompt:query'],
              onClick: () => handleValidate(row),
            },
            {
              label: '删除',
              type: 'link',
              danger: true,
              icon: ACTION_ICON.DELETE,
              auth: ['model:prompt:delete'],
              onClick: () => handleDelete(row),
            },
          ]"
        />
      </template>
    </Grid>
  </Page>
</template>
