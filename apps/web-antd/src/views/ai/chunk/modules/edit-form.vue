<script lang="ts" setup>
import type { AiChunkApi } from '#/api/ai/chunk';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { updateChunk } from '#/api/ai/chunk';

defineOptions({ name: 'AiChunkEditForm' });

const emit = defineEmits<{ success: [] }>();
const formData = ref<AiChunkApi.Chunk>();

const [Form, formApi] = useVbenForm({
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
    formItemClass: 'col-span-2',
    labelWidth: 100,
  },
  layout: 'horizontal',
  schema: [
    {
      component: 'Input',
      fieldName: 'id',
      dependencies: {
        triggerFields: [''],
        show: () => false,
      },
    },
    {
      fieldName: 'content',
      label: '片段内容',
      component: 'Textarea',
      componentProps: {
        placeholder: '请输入片段内容',
        rows: 8,
        showCount: true,
      },
      rules: 'required',
    },
  ],
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
      const values = (await formApi.getValues()) as {
        id: number;
        content: string;
      };
      await updateChunk({ id: values.id, content: values.content });
      await modalApi.close();
      emit('success');
      message.success('操作成功');
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      formData.value = undefined;
      return;
    }
    // 打开时回显当前片段内容
    const data = modalApi.getData<AiChunkApi.Chunk>();
    if (!data || !data.id) {
      return;
    }
    formData.value = data;
    await formApi.setValues({ id: data.id, content: data.content });
  },
});
</script>

<template>
  <Modal class="w-2/5" title="编辑片段内容">
    <Form class="mx-4" />
  </Modal>
</template>
