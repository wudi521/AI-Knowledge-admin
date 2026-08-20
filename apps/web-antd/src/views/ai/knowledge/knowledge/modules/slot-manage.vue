<script lang="ts" setup>
import type { AiKnowledgeSlotApi } from '#/api/ai/knowledge/slot';
import type { AiKnowledgeKnowledgeApi } from '#/api/ai/knowledge/knowledge';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Switch,
  Tag,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction } from '#/adapter/vxe-table';
import {
  createSlot,
  deleteSlot,
  getSlotPage,
  summarizeSlots,
  updateSlot,
} from '#/api/ai/knowledge/slot';

/** 当前知识库 */
const kb = ref<AiKnowledgeKnowledgeApi.Knowledge>();
/** 槽位列表 */
const slots = ref<AiKnowledgeSlotApi.Slot[]>([]);
const listLoading = ref(false);
/** AI 总结中(20~60s 长任务) */
const summarizing = ref(false);

const getTitle = computed(() => {
  return kb.value ? `槽位管理 - ${kb.value.name}` : '槽位管理';
});

/** 加载槽位列表(分页取足量) */
async function loadSlots() {
  if (!kb.value) {
    return;
  }
  listLoading.value = true;
  try {
    const page = await getSlotPage({
      kbId: kb.value.id,
      pageNo: 1,
      pageSize: 100,
    });
    slots.value = page.list || [];
  } catch {
    message.error('槽位列表加载失败');
  } finally {
    listLoading.value = false;
  }
}

/** 新增/编辑槽位弹窗 */
const formOpen = ref(false);
const formSubmitting = ref(false);
const editing = ref<AiKnowledgeSlotApi.Slot | null>(null);
const formCode = ref('');
const formName = ref('');
const formRequired = ref(true);
const formSort = ref(1);
const formDescription = ref('');

/** 打开新增 */
function openCreate() {
  editing.value = null;
  formCode.value = '';
  formName.value = '';
  formRequired.value = true;
  formSort.value = 1;
  formDescription.value = '';
  formOpen.value = true;
}

/** 打开编辑 */
function openEdit(row: AiKnowledgeSlotApi.Slot) {
  editing.value = row;
  formCode.value = row.slotCode;
  formName.value = row.slotName;
  formRequired.value = !!row.required;
  formSort.value = row.sort ?? 1;
  formDescription.value = row.description || '';
  formOpen.value = true;
}

/** 提交新增/编辑 */
async function confirmForm() {
  const code = formCode.value.trim();
  const name = formName.value.trim();
  if (!code) {
    message.warning('请输入槽位编码(英文蛇形, 如 brand)');
    return;
  }
  if (!name) {
    message.warning('请输入槽位名');
    return;
  }
  if (!editing.value && !kb.value) {
    return;
  }
  formSubmitting.value = true;
  try {
    if (editing.value) {
      await updateSlot({
        id: editing.value.id,
        kbId: kb.value!.id,
        slotName: name,
        required: formRequired.value,
        sort: formSort.value,
        description: formDescription.value.trim() || undefined,
      });
      message.success('保存成功');
    } else {
      await createSlot({
        kbId: kb.value!.id,
        slotCode: code,
        slotName: name,
        required: formRequired.value,
        sort: formSort.value,
        description: formDescription.value.trim() || undefined,
      });
      message.success('新增成功');
    }
    formOpen.value = false;
    await loadSlots();
  } catch {
    message.error(editing.value ? '保存失败' : '新增失败');
  } finally {
    formSubmitting.value = false;
  }
}

/** 状态切换(0=启用 / 1=停用; 停用自动槽位 = 永久屏蔽, 不会被 AI 总结重建) */
async function handleStatusChange(
  checked: boolean | number | string,
  row: AiKnowledgeSlotApi.Slot,
) {
  const status = checked ? 0 : 1;
  try {
    await updateSlot({ id: row.id, kbId: row.kbId, status });
    row.status = status;
    message.success(status === 0 ? '已启用' : '已停用');
  } catch {
    message.error('状态更新失败');
  }
}

/** 删除槽位(popConfirm 已确认) */
async function handleDelete(row: AiKnowledgeSlotApi.Slot) {
  try {
    await deleteSlot(row.id);
    message.success('删除成功');
    await loadSlots();
  } catch {
    message.error('删除失败');
  }
}

/** AI 总结生成槽位(同步长任务) */
async function handleSummarize() {
  if (!kb.value) {
    return;
  }
  summarizing.value = true;
  try {
    const count = await summarizeSlots(kb.value.id);
    message.success(`已生成 ${count} 个槽位`);
    await loadSlots();
  } catch {
    message.error('AI 总结失败');
  } finally {
    summarizing.value = false;
  }
}

const [SlotModal, modalApi] = useVbenModal({
  showConfirmButton: false,
  showCancelButton: false,
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      kb.value = undefined;
      slots.value = [];
      return;
    }
    // 打开时加载槽位列表
    kb.value = modalApi.getData<AiKnowledgeKnowledgeApi.Knowledge>();
    await loadSlots();
  },
});
</script>

<template>
  <SlotModal :title="getTitle" class="w-3/5">
    <div class="flex flex-col gap-4">
      <!-- 顶部操作 -->
      <div class="flex flex-wrap items-center gap-3">
        <Button type="primary" :disabled="summarizing" @click="openCreate">
          新增槽位
        </Button>
        <Button :loading="summarizing" @click="handleSummarize">
          重新总结
        </Button>
        <span v-if="summarizing" class="text-xs text-muted-foreground">
          AI 总结中(约 20~60 秒), 请稍候…
        </span>
      </div>

      <!-- 槽位列表 -->
      <div
        v-if="listLoading"
        class="py-10 text-center text-muted-foreground"
      >
        加载中…
      </div>
      <div
        v-else-if="slots.length === 0"
        class="py-10 text-center text-muted-foreground"
      >
        暂无槽位, 点『重新总结』让 AI 自动分析该知识库, 或手动新增
      </div>
      <div v-else class="flex max-h-96 flex-col gap-2 overflow-auto pr-1">
        <div
          v-for="row in slots"
          :key="row.id"
          class="rounded-lg border border-border bg-muted/30 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs text-muted-foreground">
              {{ row.slotCode }}
            </span>
            <span class="font-medium">{{ row.slotName }}</span>
            <Tag :color="row.source === 'LLM_AUTO' ? 'blue' : 'green'">
              {{ row.source === 'LLM_AUTO' ? 'AI 总结' : '手动' }}
            </Tag>
            <Tag v-if="row.required" color="red">必填</Tag>
            <Tag v-else color="default">选填</Tag>
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
                    title: `确认删除槽位「${row.slotName}」吗？(AI 总结槽位可重新生成; 想永久屏蔽请用停用)`,
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

    <!-- 新增/编辑槽位弹窗 -->
    <Modal
      v-model:open="formOpen"
      :title="editing ? '编辑槽位' : '新增槽位'"
      width="560px"
      :z-index="3000"
      :confirm-loading="formSubmitting"
      @ok="confirmForm"
    >
      <div class="flex flex-col gap-4 py-2">
        <div>
          <div class="mb-1 text-sm font-medium">
            槽位编码 <span class="text-red-500">*</span>
          </div>
          <Input
            v-model:value="formCode"
            :disabled="!!editing"
            placeholder="英文蛇形且唯一, 如 brand / faultType / purchaseTime"
            allow-clear
          />
          <div class="mt-0.5 text-xs text-muted-foreground">
            创建后不可修改(编辑已生成槽位会转为手动保护, 不再被 AI 总结覆盖)
          </div>
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">
            槽位名 <span class="text-red-500">*</span>
          </div>
          <Input
            v-model:value="formName"
            placeholder="如: 品牌型号"
            allow-clear
          />
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">是否必填</span>
            <Switch v-model:checked="formRequired" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">排序</span>
            <InputNumber v-model:value="formSort" :min="1" :max="99" />
          </div>
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">抽取说明</div>
          <Input.TextArea
            v-model:value="formDescription"
            :rows="3"
            placeholder="喂给槽位检测 LLM 的判定标准与示例, 如: 客户产品的具体品牌/型号, 如 苹果13、X100 Pro; 泛指(手机/电脑)不算已提供"
          />
        </div>
      </div>
    </Modal>
  </SlotModal>
</template>
