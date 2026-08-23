<script setup lang="ts">
/**
 * P0-10C 回答反馈栏: 👍有用 / 👎无用(点踩弹原因 + 可选备注, Upsert 可修改)
 */
import { onMounted, ref } from 'vue';

import { message } from 'ant-design-vue';

import { getFeedbackByMessage, upsertFeedback } from '#/api/ai/chat';

const REASONS: { code: string; label: string }[] = [
  { code: 'WRONG_ANSWER', label: '回答错误' },
  { code: 'NOT_ANSWERED', label: '没有回答到问题' },
  { code: 'WRONG_EVIDENCE', label: '引用证据不对' },
  { code: 'INCOMPLETE', label: '信息不完整' },
  { code: 'OUTDATED_KNOWLEDGE', label: '知识已过期' },
  { code: 'TOO_VERBOSE', label: '回答太啰嗦' },
  { code: 'TOO_SLOW', label: '回答太慢' },
  { code: 'OTHER', label: '其他' },
];

const props = defineProps<{
  messageId?: number | null;
  disabled?: boolean;
}>();

const rating = ref<'HELPFUL' | 'NOT_HELPFUL' | null>(null);
const reasonCode = ref<string>();
const comment = ref('');
const submitting = ref(false);

async function submit(r: 'HELPFUL' | 'NOT_HELPFUL', reason?: string) {
  if (!props.messageId) {
    message.warning('消息尚未完成，暂无法反馈');
    return;
  }
  submitting.value = true;
  try {
    await upsertFeedback({
      messageId: props.messageId,
      rating: r,
      reasonCode: reason,
      comment: comment.value.trim() || undefined,
    });
    rating.value = r;
    reasonCode.value = reason;
    message.success(r === 'HELPFUL' ? '已记录：有用' : '已记录：无用');
  } catch {
    // 全局拦截器提示
  } finally {
    submitting.value = false;
  }
}

async function submitNotHelpful() {
  if (!reasonCode.value) {
    message.warning('请选择无用原因');
    return;
  }
  await submit('NOT_HELPFUL', reasonCode.value);
}

onMounted(async () => {
  if (!props.messageId) return;
  try {
    const current = await getFeedbackByMessage(props.messageId);
    if (current?.rating) {
      rating.value = current.rating;
      reasonCode.value = current.reasonCode;
      comment.value = current.comment || '';
    }
  } catch {
    // 反馈查询失败不阻塞
  }
});
</script>

<template>
  <div class="fb-bar">
    <template v-if="!disabled">
      <button
        class="fb-btn"
        :class="{ active: rating === 'HELPFUL' }"
        :disabled="submitting"
        @click="rating === 'HELPFUL' ? (rating = null) : submit('HELPFUL')"
      >
        👍 {{ rating === 'HELPFUL' ? '已标记有用' : '有用' }}
      </button>

      <a-popover
        trigger="click"
        placement="top"
        :open="rating === 'NOT_HELPFUL' ? false : undefined"
      >
        <template #content>
          <div class="fb-pop">
            <div class="fb-reasons">
              <label
                v-for="r in REASONS"
                :key="r.code"
                class="fb-reason"
                :class="{ selected: reasonCode === r.code }"
              >
                <input
                  v-model="reasonCode"
                  type="radio"
                  :value="r.code"
                  class="fb-radio"
                />
                {{ r.label }}
              </label>
            </div>
            <a-textarea
              v-model:value="comment"
              :rows="2"
              :maxlength="200"
              placeholder="可选：补充说明（例如：引用的第一页没有支撑这个结论）"
              class="fb-comment"
            />
            <div class="fb-actions">
              <a-button size="small" @click="rating = null">取消</a-button>
              <a-button
                type="primary"
                size="small"
                :loading="submitting"
                @click="submitNotHelpful"
              >
                提交
              </a-button>
            </div>
          </div>
        </template>
        <button
          class="fb-btn"
          :class="{ active: rating === 'NOT_HELPFUL' }"
          :disabled="submitting"
        >
          👎 {{ rating === 'NOT_HELPFUL' ? '已标记无用' : '无用' }}
        </button>
      </a-popover>
    </template>
  </div>
</template>

<style scoped>
.fb-bar {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.fb-btn {
  border: 1px solid rgba(128, 128, 128, 0.3);
  background: transparent;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--wb-text-secondary, #6b7280);
  cursor: pointer;
  line-height: 20px;
}
.fb-btn:hover {
  border-color: #1677ff;
  color: #1677ff;
}
.fb-btn.active {
  border-color: #1677ff;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.08);
}
.fb-pop {
  width: 260px;
}
.fb-reasons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
  margin-bottom: 8px;
}
.fb-reason {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
}
.fb-reason.selected {
  color: #1677ff;
}
.fb-radio {
  accent-color: #1677ff;
}
.fb-comment {
  font-size: 12px;
}
.fb-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
