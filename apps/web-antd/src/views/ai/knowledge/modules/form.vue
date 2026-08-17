<script lang="ts" setup>
import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';

import {
  createKnowledgeBase,
  updateKnowledgeBase,
} from '#/api/ai/knowledge';
import { getModelListByType } from '#/api/ai/model';

import { useFormSchema } from '../data';

defineOptions({ name: 'KnowledgeBaseForm' });

const emit = defineEmits(['success']);

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 110,
  },
  layout: 'vertical',
  schema: useFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) {
      return;
    }
    modalApi.lock();
    try {
      const data = await formApi.getValues();
      // 可见角色: 数组 join 为逗号分隔字符串(后端 varchar 存储)
      if (Array.isArray(data.visibleRoles)) {
        data.visibleRoles = data.visibleRoles.join(',');
      }
      if (data.id) {
        await updateKnowledgeBase(data);
      } else {
        await createKnowledgeBase(data);
      }
      await modalApi.close();
      emit('success');
      message.success('操作成功');
    } finally {
      modalApi.unlock();
    }
  },
  async onOpened() {
    // 动态加载已配置且启用的 Embedding 模型
    try {
      const models = await getModelListByType('embedding');
      formApi.updateSchema([
        {
          fieldName: 'embedModel',
          componentProps: {
            options: models.map((m) => ({
              label: `${m.name} (${m.modelName})`,
              value: m.modelName,
            })),
          },
        },
      ]);
    } catch {
      // 模型网关未启动时忽略, 保留静态选项
    }
    const row = modalApi.getData<Record<string, any>>();
    // 可见角色: 后端存逗号分隔字符串, 表单用数组(多选) -> 回显时拆分
    if (row && typeof row.visibleRoles === 'string' && row.visibleRoles) {
      row.visibleRoles = row.visibleRoles
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    formApi.setValues(row ?? {});
  },
  onClosed() {
    formApi.resetForm();
  },
});
</script>

<template>
  <Modal title="知识库">
    <Form class="mx-4" />
  </Modal>
</template>
