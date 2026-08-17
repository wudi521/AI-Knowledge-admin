<script lang="ts" setup>
import type { AiVersionApi } from '#/api/ai/version';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import { InputNumber, Tag, message } from 'ant-design-vue';

import { getVersionList } from '#/api/ai/version';

const docId = ref<number>();
const versions = ref<AiVersionApi.Version[]>([]);
const loading = ref(false);

/** 版本状态 -> Tag */
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  DRAFT: { color: 'default', text: '草稿' },
  REVIEW: { color: 'processing', text: '审核中' },
  PUBLISHED: { color: 'success', text: '已发布' },
  EXPIRED: { color: 'warning', text: '已过期' },
  ARCHIVED: { color: 'default', text: '已归档' },
};

/** 冲突状态说明 */
function conflictText(status: number | undefined): string {
  if (status === 1) {
    return ' · 冲突待裁决';
  }
  if (status === 2) {
    return ' · 冲突已裁决';
  }
  return '';
}

/** 查询版本时间线 */
async function handleQuery() {
  if (!docId.value) {
    message.warning('请输入文档编号');
    return;
  }
  loading.value = true;
  try {
    versions.value = await getVersionList(docId.value);
  } catch {
    message.error('查询失败');
  } finally {
    loading.value = false;
  }
}
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
      <a-button type="primary" :loading="loading" @click="handleQuery">
        查询版本
      </a-button>
      <span class="text-sm text-muted-foreground">
        同一文档仅一个"已发布"版本参与检索, 旧版本发布时自动过期
      </span>
    </div>

    <div v-if="versions.length === 0" class="text-muted-foreground">
      暂无版本记录
    </div>
    <div v-else class="max-w-3xl">
      <!-- 时间线 -->
      <div class="relative border-l-2 border-muted pl-6">
        <div v-for="v in versions" :key="v.id" class="relative mb-6">
          <!-- 时间点 -->
          <span
            class="absolute -left-[31px] top-1 h-3 w-3 rounded-full"
            :class="{
              'bg-green-500': v.status === 'PUBLISHED',
              'bg-blue-500': v.status === 'REVIEW',
              'bg-gray-300': v.status === 'DRAFT' || v.status === 'ARCHIVED',
              'bg-orange-400': v.status === 'EXPIRED',
            }"
          />
          <div class="flex items-center gap-2">
            <span class="text-base font-bold">{{ v.versionNo }}</span>
            <Tag :color="STATUS_TAG[v.status]?.color || 'default'">
              {{ STATUS_TAG[v.status]?.text || v.status }}
            </Tag>
            <span v-if="v.conflictStatus > 0" class="text-xs text-amber-600">
              {{ conflictText(v.conflictStatus) }}
            </span>
            <span v-if="v.reviewResult === 'REJECTED'" class="text-xs text-red-500">
              · 已驳回{{ v.reviewComment ? `: ${v.reviewComment}` : '' }}
            </span>
          </div>
          <div class="mt-1 text-sm text-muted-foreground">
            <span v-if="v.effectiveFrom">
              生效: {{ v.effectiveFrom }}
              <template v-if="v.effectiveTo"> ~ {{ v.effectiveTo }}</template>
            </span>
            <span v-if="v.reviewer" class="ml-3">审核人: {{ v.reviewer }}</span>
            <span class="ml-3">创建: {{ v.createTime }}</span>
          </div>
        </div>
      </div>
    </div>
  </Page>
</template>
