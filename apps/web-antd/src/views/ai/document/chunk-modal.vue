<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { AiChunkApi } from '#/api/ai/chunk';

import { computed, nextTick, watch } from 'vue';
import { Alert, Modal, Tag } from 'ant-design-vue';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getChunkPage } from '#/api/ai/chunk';

defineOptions({ name: 'AiDocumentChunkModal' });

const props = withDefaults(
  defineProps<{ open?: boolean; documentId?: number }>(),
  { open: false, documentId: undefined },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  success: [];
}>();

const openComputed = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val),
});

function metaField(meta: string | undefined, key: string): string {
  if (!meta) return '';
  try {
    const m = JSON.parse(meta);
    const v = m[key];
    return v === undefined || v === null ? '' : String(v);
  } catch {
    return '';
  }
}

const CHUNK_TYPE_TAG: Record<string, { color: string; text: string }> = {
  SEMANTIC: { color: 'blue', text: '语义' },
  TABLE: { color: 'orange', text: '表格' },
  FAQ: { color: 'green', text: '问答' },
  POLICY: { color: 'purple', text: '政策' },
  PATENT_CLAIM: { color: 'geekblue', text: '权利要求' },
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'id', title: 'Chunk ID', width: 90 },
      { field: 'chunkType', title: '类型', width: 110, slots: { default: 'chunkType' } },
      {
        field: 'patentSection', title: '章节', width: 130,
        formatter: ({ row }: any) => metaField(row.metadata, 'sectionTitle') || metaField(row.metadata, 'sectionType') || '-',
      },
      {
        field: 'patentClaim', title: '权利要求', width: 110,
        formatter: ({ row }: any) => metaField(row.metadata, 'claimNo') ? `Claim ${metaField(row.metadata, 'claimNo')}` : '-',
      },
      { type: 'expand', width: 40, slots: { content: 'expand_content' } },
      { field: 'content', title: '内容', minWidth: 360, showOverflow: true },
      { field: 'parentId', title: '父块', width: 90, align: 'center' },
      { field: 'status', title: '索引状态', width: 100 },
    ],
    height: 420,
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          if (!props.documentId) return { list: [], total: 0 };
          return await getChunkPage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            documentId: props.documentId,
            ...formValues,
          });
        },
      },
    },
    rowConfig: { keyField: 'id', isHover: true },
    toolbarConfig: { refresh: true },
  } as VxeTableGridOptions<AiChunkApi.Chunk>,
});

function handleAfterOpenChange(isOpen: boolean) {
  if (isOpen) nextTick(() => gridApi.query());
}

watch(
  () => props.documentId,
  () => {
    if (props.open) gridApi.query();
  },
);
</script>

<template>
  <Modal
    v-model:open="openComputed"
    :title="`高级信息 · 知识单元${props.documentId ? ` · 文档 #${props.documentId}` : ''}`"
    width="90%"
    :footer="null"
    :z-index="1000"
    :destroy-on-close="true"
    @after-open-change="handleAfterOpenChange"
  >
    <Alert
      class="mb-3"
      type="info"
      show-icon
      message="知识单元由解析、领域抽取和索引流程自动生成，此处仅用于诊断。需要修正文档内容时请更新源文档并重新处理，避免直接修改 Chunk 造成版本与索引不一致。"
    />
    <Grid>
      <template #chunkType="{ row }">
        <Tag :color="(row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.color) || 'default'">
          {{ (row.chunkType && CHUNK_TYPE_TAG[row.chunkType]?.text) || row.chunkType }}
        </Tag>
      </template>
      <template #expand_content="{ row }">
        <div class="whitespace-pre-wrap border-l-4 border-blue-500 px-2.5 py-5 leading-5">
          <div class="mb-2 text-sm font-bold text-muted-foreground">完整内容</div>
          {{ row.content }}
          <div v-if="row.metadata" class="mt-3 text-xs text-muted-foreground">metadata: {{ row.metadata }}</div>
        </div>
      </template>
    </Grid>
  </Modal>
</template>
