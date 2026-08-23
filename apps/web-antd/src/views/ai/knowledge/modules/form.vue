<script lang="ts" setup>
import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';

import {
  createKnowledgeBase,
  updateKnowledgeBase,
} from '#/api/ai/knowledge';

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
    const row = modalApi.getData<Record<string, any>>();

    // 领域决定解析、切分、审核和检索策略。知识库创建后不允许在编辑表单里切换领域，
    // 避免已有文档继续沿用旧领域产物形成混合状态；需要换领域时应新建知识库重新入库。
    formApi.updateSchema([
      {
        fieldName: 'domainCode',
        componentProps: {
          disabled: !!row?.id,
          placeholder: row?.id ? '知识库创建后领域不可修改' : '请选择知识领域',
          options: [
            { label: '通用知识库', value: 'GENERAL' },
            { label: '专利知识库', value: 'PATENT' },
          ],
        },
        help: row?.id
          ? '领域决定文档解析、切分、审核和检索策略。已有知识库如需切换领域，请新建目标领域知识库并重新入库。'
          : '选择后将自动套用对应领域的解析、检索和回答策略。',
      },
    ]);

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
