<script lang="ts" setup>
import type { AiVersionApi } from '#/api/ai/version';

import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import { Empty, Tag, message } from 'ant-design-vue';
import { getVersionList } from '#/api/ai/version';

const route = useRoute();
const router = useRouter();
const docId = ref<number>(Number(route.query.docId || 0));
const versions = ref<AiVersionApi.Version[]>([]);
const loading = ref(false);

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  DRAFT: { color: 'default', text: '草稿' },
  REVIEW: { color: 'processing', text: '待审核' },
  PUBLISHED: { color: 'success', text: '已发布' },
  EXPIRED: { color: 'warning', text: '已失效' },
  ARCHIVED: { color: 'default', text: '已归档' },
};

function conflictText(status: number | undefined): string {
  if (status === 1) return '冲突待裁决';
  if (status === 2) return '冲突已裁决';
  return '';
}

async function loadVersions() {
  if (!docId.value) return;
  loading.value = true;
  try {
    versions.value = await getVersionList(docId.value);
  } catch {
    message.error('版本记录加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!docId.value) {
    message.warning('请从文档管理进入版本记录');
    router.back();
    return;
  }
  loadVersions();
});
</script>

<template>
  <Page
    auto-content-height
    title="版本记录"
    description="版本属于具体文档。发布新版本后，旧版本退出当前检索范围，但历史记录继续保留用于追溯。"
  >
    <div class="mb-4 flex items-center gap-3">
      <a-button @click="router.back()">← 返回文档</a-button>
      <span class="text-sm text-muted-foreground">文档 #{{ docId }}</span>
      <a-button :loading="loading" @click="loadVersions">刷新</a-button>
    </div>

    <Empty v-if="!loading && versions.length === 0" description="暂无版本记录" />
    <div v-else class="max-w-4xl">
      <div class="relative border-l-2 border-muted pl-6">
        <div v-for="v in versions" :key="v.id" class="relative mb-6">
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
            <Tag :color="STATUS_TAG[v.status]?.color || 'default'">{{ STATUS_TAG[v.status]?.text || v.status }}</Tag>
            <Tag v-if="v.conflictStatus > 0" color="warning">{{ conflictText(v.conflictStatus) }}</Tag>
            <Tag v-if="v.reviewResult === 'REJECTED'" color="error">审核驳回</Tag>
          </div>
          <div class="mt-2 text-sm text-muted-foreground">
            <span v-if="v.effectiveFrom">生效：{{ v.effectiveFrom }}<template v-if="v.effectiveTo"> ~ {{ v.effectiveTo }}</template></span>
            <span v-if="v.reviewer" class="ml-3">审核人：{{ v.reviewer }}</span>
            <span class="ml-3">创建：{{ v.createTime }}</span>
          </div>
          <div v-if="v.reviewComment" class="mt-1 text-sm">审核意见：{{ v.reviewComment }}</div>
        </div>
      </div>
    </div>
  </Page>
</template>
