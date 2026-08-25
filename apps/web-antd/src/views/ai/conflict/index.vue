<script lang="ts" setup>
import type { AiConflictApi } from '#/api/ai/conflict';

import { onMounted, ref } from 'vue';

import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Tag,
  message,
} from 'ant-design-vue';

import { getConflictList, resolveConflict } from '#/api/ai/conflict';

const route = useRoute();

const docId = ref<number | undefined>(
  route.query.docId ? Number(route.query.docId) : undefined,
);
const conflicts = ref<AiConflictApi.Conflict[]>([]);
const loading = ref(false);
const queried = ref(false);

/** 状态 -> Tag */
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'error', text: '待裁决' },
  RESOLVED_NEW: { color: 'success', text: '已裁决·以新版为准' },
  RESOLVED_OLD: { color: 'warning', text: '已裁决·以旧版为准' },
};

/** 查询 */
async function handleQuery() {
  if (!docId.value) {
    message.warning('请输入文档编号');
    return;
  }
  loading.value = true;
  try {
    conflicts.value = await getConflictList(docId.value);
  } catch {
    message.error('查询失败');
  } finally {
    loading.value = false;
    queried.value = true;
  }
}

/** 裁决弹窗 */
const resolveOpen = ref(false);
const resolveRow = ref<AiConflictApi.Conflict>();
const resolveType = ref<'RESOLVED_NEW' | 'RESOLVED_OLD'>('RESOLVED_NEW');
const resolveComment = ref('');
function openResolve(
  row: AiConflictApi.Conflict,
  type: 'RESOLVED_NEW' | 'RESOLVED_OLD',
) {
  resolveRow.value = row;
  resolveType.value = type;
  resolveComment.value = '';
  resolveOpen.value = true;
}
async function confirmResolve() {
  if (!resolveRow.value) {
    return;
  }
  try {
    await resolveConflict(
      resolveRow.value.id,
      resolveType.value,
      resolveComment.value.trim() || undefined,
    );
    message.success('裁决完成');
    resolveOpen.value = false;
    handleQuery();
  } catch {
    message.error('裁决失败');
  }
}

onMounted(() => {
  if (docId.value) handleQuery();
});
</script>

<template>
  <Page auto-content-height>
    <div class="mb-4 flex items-center gap-2">
      <InputNumber
        v-model:value="docId"
        class="w-44"
        placeholder="文档编号"
        :controls="false"
        :disabled="loading"
      />
      <Button type="primary" :loading="loading" @click="handleQuery">
        查询冲突
      </Button>
      <span class="text-sm text-muted-foreground">
        裁决前不发布新版本(按旧版本口径), 冲突裁决留痕
      </span>
    </div>

    <Empty
      v-if="!loading && conflicts.length === 0"
      :description="queried ? '该文档暂无冲突记录' : '请输入文档编号后查询'"
    />

    <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div
        v-for="c in conflicts"
        :key="c.id"
        class="rounded-lg border border-muted bg-muted/30 p-4"
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="font-bold">{{ c.title }}</span>
          <Tag :color="STATUS_TAG[c.status]?.color || 'default'">
            {{ STATUS_TAG[c.status]?.text || c.status }}
          </Tag>
        </div>
        <div class="mb-3 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded bg-muted p-3">
            <div class="mb-1 font-semibold text-muted-foreground">
              旧版本表述
            </div>
            <div class="whitespace-pre-wrap">{{ c.oldContent }}</div>
          </div>
          <div class="rounded bg-muted p-3">
            <div class="mb-1 font-semibold text-muted-foreground">
              新版本表述
            </div>
            <div class="whitespace-pre-wrap">{{ c.newContent }}</div>
          </div>
        </div>
        <div class="mb-3 text-xs text-muted-foreground">
          <span v-if="c.llmJudgement">
            LLM 判定: {{ c.llmJudgement }}
            <template v-if="c.llmReason"> · {{ c.llmReason }}</template>
          </span>
          <span v-if="c.resolver" class="ml-3">
            裁决人: {{ c.resolver }} · {{ c.resolveTime }}
          </span>
        </div>
        <div v-if="c.status === 'PENDING'" class="flex gap-2">
          <Button
            type="primary"
            size="small"
            @click="openResolve(c, 'RESOLVED_NEW')"
          >
            以新版为准·发布
          </Button>
          <Button danger size="small" @click="openResolve(c, 'RESOLVED_OLD')">
            以旧版为准·驳回
          </Button>
        </div>
      </div>
    </div>

    <!-- 裁决弹窗(规范: antd Modal z-index 1000 + destroyOnClose) -->
    <Modal
      v-model:open="resolveOpen"
      :title="`裁决冲突: ${resolveRow?.title}`"
      :z-index="1000"
      :destroy-on-close="true"
      @ok="confirmResolve"
    >
      <p class="mb-3 text-sm text-muted-foreground">
        {{
          resolveType === 'RESOLVED_NEW'
            ? '以新版为准: 解除冲突并允许新版本继续发布'
            : '以旧版为准: 解除冲突并自动驳回新版本关联条目, 新版本将无法发布'
        }}
      </p>
      <Input.TextArea
        v-model:value="resolveComment"
        :rows="2"
        placeholder="裁决意见(可选)"
      />
    </Modal>
  </Page>
</template>
