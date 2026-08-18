<script lang="ts" setup>
import type { AiRetrievalApi } from '#/api/ai/retrieval';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, Card, Input, Select, Tag, message } from 'ant-design-vue';

import { getKnowledgeBasePage } from '#/api/ai/knowledge';
import { searchRetrieval } from '#/api/ai/retrieval';

defineOptions({ name: 'AiRetrieval' });

const route = useRoute();

/** 检索输入 */
const query = ref('');
const kbIds = ref<number[]>([]); // 选中的知识库(空 = 全部可见)
const loading = ref(false);
const result = ref<AiRetrievalApi.SearchResp | null>(null);

/** 知识库选项(全部可见知识库) */
const kbOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  // 预选知识库(从知识库列表「检索测试」按钮进入)
  const initialKbId = Number(route.query.kbId);
  try {
    const data = await getKnowledgeBasePage({ pageNo: 1, pageSize: 100 });
    kbOptions.value = (data.list || []).map((item) => ({
      label: item.name,
      value: item.id as number,
    }));
    if (
      initialKbId &&
      kbOptions.value.some((option) => option.value === initialKbId)
    ) {
      kbIds.value = [initialKbId];
    }
  } catch {
    message.error('知识库列表加载失败');
  }
});

/** 意图 -> Tag */
const INTENT_TAG: Record<string, { color: string; text: string }> = {
  WARRANTY: { color: 'blue', text: '保修' },
  REFUND: { color: 'volcano', text: '退款' },
  LOGISTICS: { color: 'cyan', text: '物流' },
  REPAIR: { color: 'orange', text: '维修' },
  PRICE: { color: 'gold', text: '价格' },
  OTHER: { color: 'default', text: '其他' },
};

/** 当前意图(带默认色) */
const intent = computed(() => {
  const intentCode = result.value?.analysis?.intent;
  if (!intentCode) {
    return null;
  }
  return INTENT_TAG[intentCode] || { color: 'default', text: intentCode };
});

/** 通道徽标颜色 */
const CHANNEL_COLOR: Record<string, string> = {
  bm25: 'blue',
  vector: 'green',
  fused: 'purple',
};

/** 检索 */
async function handleSearch() {
  const keyword = query.value.trim();
  if (!keyword) {
    message.warning('请输入检索内容');
    return;
  }
  loading.value = true;
  result.value = null;
  try {
    result.value = await searchRetrieval({
      query: keyword,
      kbIds: kbIds.value.length > 0 ? kbIds.value : undefined,
      topK: 5,
    });
  } catch {
    message.error('检索失败');
  } finally {
    loading.value = false;
  }
}

/** HTML 转义(先转义再高亮, 防 XSS) */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 高亮: 先转义 HTML, 再把命中 token 包进 <mark> */
function highlightHtml(text?: string, keyword?: string): string {
  const safe = escapeHtml(text || '');
  const tokens = (keyword || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  let html = safe;
  for (const token of tokens) {
    const escapedToken = escapeHtml(token);
    if (!escapedToken) {
      continue;
    }
    const regex = new RegExp(
      escapedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'gi',
    );
    html = html.replace(
      regex,
      (match) =>
        `<mark class="bg-yellow-200 px-0.5 rounded dark:bg-yellow-600/40">${match}</mark>`,
    );
  }
  return html;
}

/** 分数保留 2 位 */
function formatScore(score?: number): string {
  return score == null ? '-' : score.toFixed(2);
}

/** AI 总结渲染: 先转义, 再把 [C1][C2] 引用编号美化(防 XSS) */
function renderAnswer(answer?: string): string {
  const safe = escapeHtml(answer || '');
  return safe.replace(
    /\[C(\d+)\]/g,
    (_m, num: string) =>
      `<span class="mx-0.5 rounded bg-blue-500/15 px-1 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">[C${num}]</span>`,
  );
}
</script>

<template>
  <Page auto-content-height>
    <div class="flex flex-col gap-4 p-4">
      <!-- 检索栏 -->
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query"
          class="w-96"
          placeholder="输入检索内容, 如: 保修期多久"
          allow-clear
          @press-enter="handleSearch"
        />
        <Select
          v-model:value="kbIds"
          class="w-64"
          mode="multiple"
          :options="kbOptions"
          placeholder="全部可见知识库"
          allow-clear
        />
        <Button type="primary" :loading="loading" @click="handleSearch">
          检索
        </Button>
      </div>

      <!-- 分析区 -->
      <div
        v-if="result?.analysis"
        class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">意图:</span>
          <Tag v-if="intent" :color="intent.color">
            {{ intent.text }}
          </Tag>
          <Tag v-if="!result.analysis.intent" color="default">未识别</Tag>
          <span
            v-if="result.channels"
            class="ml-auto text-xs text-muted-foreground"
          >
            通道统计: BM25 召回 {{ result.channels.bm25 ?? 0 }} /
            向量召回 {{ result.channels.vector ?? 0 }} /
            融合 {{ result.channels.fused ?? 0 }}
          </span>
        </div>
        <div v-if="result.analysis.entities?.length" class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">实体:</span>
          <Tag v-for="entity in result.analysis.entities" :key="entity">
            {{ entity }}
          </Tag>
        </div>
        <div v-if="result.analysis.rewrites?.length" class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">改写变体:</span>
          <Tag v-for="rewrite in result.analysis.rewrites" :key="rewrite" color="processing">
            {{ rewrite }}
          </Tag>
        </div>
        <div
          v-if="result.analysis.subQuestions?.length"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-sm text-muted-foreground">子问题:</span>
          <Tag v-for="question in result.analysis.subQuestions" :key="question" color="cyan">
            {{ question }}
          </Tag>
        </div>
        <div
          v-if="!result.analysis.success"
          class="text-xs text-muted-foreground"
        >
          语义分析未成功, 已直接走关键词检索
        </div>
      </div>

      <!-- AI 总结 -->
      <Card v-if="result?.answer" size="small" class="border-blue-500/40 bg-blue-50/50 dark:bg-blue-950/20">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-sm font-bold">AI 总结</span>
          <Tag color="blue">基于检索结果生成</Tag>
        </div>
        <div
          class="whitespace-pre-wrap leading-6 text-card-foreground"
          v-html="renderAnswer(result.answer)"
        />
        <div class="mt-1 text-xs text-muted-foreground">
          引用编号 [C1][C2]… 对应下方结果卡片顺序
        </div>
      </Card>

      <!-- 结果区 -->
      <template v-if="result">
        <div v-if="result.results.length === 0" class="py-10 text-center text-muted-foreground">
          未检索到已发布且可见的内容
        </div>
        <div v-else class="flex flex-col gap-3">
          <Card
            v-for="item in result.results"
            :key="item.chunkId"
            size="small"
            class="border-border"
          >
            <template #title>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm">#{{ item.chunkId }}</span>
                <span class="font-medium">{{ item.documentName || '-' }}</span>
                <Tag v-if="item.versionNo" color="default">
                  {{ item.versionNo }}
                </Tag>
                <span class="ml-auto text-sm text-muted-foreground">
                  重排分 {{ formatScore(item.rerankScore) }}
                </span>
              </div>
            </template>
            <div class="flex flex-col gap-2">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-html="highlightHtml(item.content, result.query)"
                class="whitespace-pre-wrap break-all text-sm leading-6"
              ></div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>RRF 融合分 {{ formatScore(item.rrfScore) }}</span>
                <span class="ml-auto flex items-center gap-1">
                  <Tag
                    v-for="channel in item.channels || []"
                    :key="channel"
                    :color="CHANNEL_COLOR[channel] || 'default'"
                  >
                    {{ channel }}
                  </Tag>
                </span>
              </div>
            </div>
          </Card>
        </div>
      </template>
    </div>
  </Page>
</template>
