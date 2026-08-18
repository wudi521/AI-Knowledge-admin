<script lang="ts" setup>
import type { AiIntentApi } from '#/api/ai/intent';
import type { AiKnowledgeKnowledgeApi } from '#/api/ai/knowledge/knowledge';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Button, Input, message, Modal, Switch, Tag } from 'ant-design-vue';

import { ACTION_ICON, TableAction } from '#/adapter/vxe-table';
import {
  createIntent,
  deleteIntent,
  getIntentList,
  summarizeIntents,
  updateIntent,
} from '#/api/ai/intent';

/** 当前知识库 */
const kb = ref<AiKnowledgeKnowledgeApi.Knowledge>();
/** 意图列表 */
const intents = ref<AiIntentApi.Intent[]>([]);
const listLoading = ref(false);
/** AI 总结中(20~60s 长任务) */
const summarizing = ref(false);

const getTitle = computed(() => {
  return kb.value ? `意图管理 - ${kb.value.name}` : '意图管理';
});

/** 加载意图列表 */
async function loadIntents() {
  if (!kb.value) {
    return;
  }
  listLoading.value = true;
  try {
    intents.value = await getIntentList(kb.value.id);
  } catch {
    message.error('意图列表加载失败');
  } finally {
    listLoading.value = false;
  }
}

/** 新增/编辑意图弹窗 */
const formOpen = ref(false);
const formSubmitting = ref(false);
const editing = ref<AiIntentApi.Intent | null>(null);
const formName = ref('');
const formDescription = ref('');

/** 打开新增 */
function openCreate() {
  editing.value = null;
  formName.value = '';
  formDescription.value = '';
  formOpen.value = true;
}

/** 打开编辑 */
function openEdit(row: AiIntentApi.Intent) {
  editing.value = row;
  formName.value = row.name;
  formDescription.value = row.description || '';
  formOpen.value = true;
}

/** 提交新增/编辑 */
async function confirmForm() {
  const name = formName.value.trim();
  if (!name) {
    message.warning('请输入意图名称');
    return;
  }
  if (!editing.value && !kb.value) {
    return;
  }
  formSubmitting.value = true;
  try {
    if (editing.value) {
      await updateIntent({
        id: editing.value.id,
        name,
        description: formDescription.value.trim() || undefined,
      });
      message.success('保存成功');
    } else {
      await createIntent({
        kbId: kb.value!.id,
        name,
        description: formDescription.value.trim() || undefined,
      });
      message.success('新增成功');
    }
    formOpen.value = false;
    await loadIntents();
  } catch {
    message.error(editing.value ? '保存失败' : '新增失败');
  } finally {
    formSubmitting.value = false;
  }
}

/** 状态切换(0=启用 / 1=停用) */
async function handleStatusChange(
  checked: boolean | number | string,
  row: AiIntentApi.Intent,
) {
  const status = checked ? 0 : 1;
  try {
    await updateIntent({ id: row.id, status });
    row.status = status;
    message.success(status === 0 ? '已启用' : '已停用');
  } catch {
    message.error('状态更新失败');
  }
}

/** 删除意图(popConfirm 已确认) */
async function handleDelete(row: AiIntentApi.Intent) {
  try {
    await deleteIntent(row.id);
    message.success('删除成功');
    await loadIntents();
  } catch {
    message.error('删除失败');
  }
}

/** AI 总结生成意图(同步长任务) */
async function handleSummarize() {
  if (!kb.value) {
    return;
  }
  summarizing.value = true;
  try {
    const count = await summarizeIntents(kb.value.id);
    message.success(`已生成 ${count} 个意图`);
    await loadIntents();
  } catch {
    message.error('AI 总结失败');
  } finally {
    summarizing.value = false;
  }
}

const [IntentModal, modalApi] = useVbenModal({
  showConfirmButton: false,
  showCancelButton: false,
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      kb.value = undefined;
      intents.value = [];
      return;
    }
    // 打开时加载意图列表
    kb.value = modalApi.getData<AiKnowledgeKnowledgeApi.Knowledge>();
    await loadIntents();
  },
});
</script>

<template>
  <IntentModal :title="getTitle" class="w-3/5">
    <div class="flex flex-col gap-4">
      <!-- 顶部操作 -->
      <div class="flex flex-wrap items-center gap-3">
        <Button type="primary" :disabled="summarizing" @click="openCreate">
          新增意图
        </Button>
        <Button :loading="summarizing" @click="handleSummarize">
          重新总结
        </Button>
        <span v-if="summarizing" class="text-xs text-muted-foreground">
          AI 总结中(约 20~60 秒), 请稍候…
        </span>
      </div>

      <!-- 意图列表 -->
      <div
        v-if="listLoading"
        class="py-10 text-center text-muted-foreground"
      >
        加载中…
      </div>
      <div
        v-else-if="intents.length === 0"
        class="py-10 text-center text-muted-foreground"
      >
        暂无意图, 点『重新总结』让 AI 自动分析该知识库, 或手动新增
      </div>
      <div v-else class="flex max-h-96 flex-col gap-2 overflow-auto pr-1">
        <div
          v-for="row in intents"
          :key="row.id"
          class="rounded-lg border border-border bg-muted/30 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ row.name }}</span>
            <Tag :color="row.source === 'LLM_AUTO' ? 'blue' : 'green'">
              {{ row.source === 'LLM_AUTO' ? 'AI 总结' : '手动' }}
            </Tag>
            <Switch
              class="ml-auto"
              :checked="row.status === 0"
              checked-children="启用"
              un-checked-children="停用"
              @change="
                (checked: boolean | number | string) =>
                  handleStatusChange(checked, row)
              "
            />
            <TableAction
              :actions="[
                {
                  label: '编辑',
                  type: 'link',
                  icon: ACTION_ICON.EDIT,
                  onClick: openEdit.bind(null, row),
                },
                {
                  label: '删除',
                  type: 'link',
                  icon: ACTION_ICON.DELETE,
                  danger: true,
                  popConfirm: {
                    title: `确认删除意图「${row.name}」吗？`,
                    confirm: handleDelete.bind(null, row),
                  },
                },
              ]"
            />
          </div>
          <div
            v-if="row.description"
            class="mt-1 text-sm text-muted-foreground"
          >
            {{ row.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑意图弹窗 -->
    <Modal
      v-model:open="formOpen"
      :title="editing ? '编辑意图' : '新增意图'"
      width="480px"
      :z-index="3000"
      :confirm-loading="formSubmitting"
      @ok="confirmForm"
    >
      <div class="flex flex-col gap-4 py-2">
        <div>
          <div class="mb-1 text-sm font-medium">
            意图名称 <span class="text-red-500">*</span>
          </div>
          <Input
            v-model:value="formName"
            placeholder="如: 保修政策咨询"
            allow-clear
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">说明</div>
          <Input.TextArea
            v-model:value="formDescription"
            :rows="3"
            placeholder="意图说明(可选)"
          />
        </div>
      </div>
    </Modal>
  </IntentModal>
</template>
