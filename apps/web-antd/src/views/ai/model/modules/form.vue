<script lang="ts" setup>
import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';

import { createModelConfig, updateModelConfig } from '#/api/ai/model';

import { useFormSchema } from '../data';

defineOptions({ name: 'ModelConfigForm' });

const emit = defineEmits(['success']);

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 100,
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
      if (data.id) {
        await updateModelConfig(data);
      } else {
        await createModelConfig(data);
      }
      await modalApi.close();
      emit('success');
      message.success('操作成功');
    } finally {
      modalApi.unlock();
    }
  },
  onOpened() {
    const row = modalApi.getData<{ id?: number }>();
    formApi.setValues(row ?? {});
  },
  onClosed() {
    formApi.resetForm();
  },
});
</script>

<template>
  <Modal title="模型配置">
    <Form class="mx-4" />
  </Modal>
</template>
