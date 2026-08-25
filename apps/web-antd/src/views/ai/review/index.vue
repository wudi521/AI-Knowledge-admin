<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ActionItem } from '#/adapter/vxe-table';
import type { AiReviewApi } from '#/api/ai/review';
import type { KnowledgeDocument } from '#/api/ai/knowledge';

import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import { ACTION_ICON, TableAction, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getChunk } from '#/api/ai/chunk';
import type { AiChunkApi } from '#/api/ai/chunk';
import { getDocumentPage, getKnowledgeBasePage } from '#/api/ai/knowledge';
import {
  approveReviewItem,
  getReviewItemPage,
  rejectReviewItem,
} from '#/api/ai/review';
import { publishVersion, rejectVersion } from '#/api/ai/version';
import { docMetaField } from '../document/data';
import ChunkModal from '../document/chunk-modal.vue';
import {
  KNOWLEDGE_ROUTES,
  knowledgeConflictRoute,
  knowledgeEvaluationRoute,
  knowledgeVersionRoute,
} from '../knowledge-routes';

const route = useRoute();
const router = useRouter();

/** 待审核文档是审核发布的业务入口；PATENT 没有客服式 ReviewItem，必须以文档版本为审核对象。 */
const reviewDocs = ref<KnowledgeDocument[]>([]);
const docsLoading = ref(false);
const kbDomainMap = ref<Record<number, string>>({});
const selectedDoc = ref<KnowledgeDocument>();
const reviewContentOpen = ref(false);
const kbIdFilter = ref<number | undefined>(
  route.query.kbId ? Number(route.query.kbId) : undefined,
);
const docIdFilter = ref<number | undefined>(
  route.query.docId ? Number(route.query.docId) : undefined,
);

function domainOf(doc?: KnowledgeDocument): string {
  return doc?.kbId ? kbDomainMap.value[doc.kbId] || 'GENERAL' : 'GENERAL';
}

async function loadReviewDocuments() {
  docsLoading.value = true;
  try {
    const [docs, kbs] = await Promise.all([
      getDocumentPage({
        kbId: kbIdFilter.value,
        pageNo: 1,
        pageSize: 200,
        parseStatus: 'REVIEW',
      }),
      getKnowledgeBasePage({ pageNo: 1, pageSize: 200 }),
    ]);
    reviewDocs.value = docs.list || [];
    kbDomainMap.value = Object.fromEntries(
      (kbs.list || [])
        .filter((kb) => kb.id != null)
        .map((kb) => [kb.id!, kb.domainCode || 'GENERAL']),
    );
    if (docIdFilter.value) {
      const match = reviewDocs.value.find(
        (doc) => doc.id === docIdFilter.value,
      );
      if (match) selectDocument(match);
    }
  } catch {
    message.error('待审核文档加载失败');
  } finally {
    docsLoading.value = false;
  }
}

/** 选择文档：PATENT 走文档级确认；GENERAL 再进入条目级审核。 */
async function selectDocument(doc: KnowledgeDocument) {
  selectedDoc.value = doc;
  docIdFilter.value = doc.id;
  if (domainOf(doc) === 'PATENT') {
    reviewContentOpen.value = true;
    return;
  }
  currentTab.value = 'PENDING';
  await nextTick();
  gridApi.query();
}

function openDocumentTrace(doc: KnowledgeDocument) {
  router.push({
    path: KNOWLEDGE_ROUTES.documentTrace,
    query: { documentId: doc.id },
  });
}

function openQuality(doc: KnowledgeDocument) {
  router.push(knowledgeEvaluationRoute(doc.kbId));
}

function openVersions(doc: KnowledgeDocument) {
  if (doc.id) router.push(knowledgeVersionRoute(doc.id));
}

function openConflicts(doc: KnowledgeDocument) {
  if (doc.id) router.push(knowledgeConflictRoute(doc.id));
}

/** 文档级发布：所有领域最终都走同一 VersionService 门禁(审核/冲突/评测/索引)。 */
async function publishDocument(doc: KnowledgeDocument) {
  if (!doc.versionId) {
    message.warning('未找到当前待发布版本，请刷新后重试');
    return;
  }
  try {
    await publishVersion(doc.versionId);
    message.success(`「${doc.name}」发布成功`);
    if (selectedDoc.value?.id === doc.id) selectedDoc.value = undefined;
    await loadReviewDocuments();
    gridApi.query();
  } catch (e: any) {
    message.error(e?.message || '发布失败：请检查审核条目、冲突和质量闸门');
  }
}

/** 文档级驳回。 */
const rejectVersionOpen = ref(false);
const rejectDoc = ref<KnowledgeDocument>();
const rejectVersionReason = ref('');
function openRejectVersion(doc: KnowledgeDocument) {
  rejectDoc.value = doc;
  rejectVersionReason.value = '';
  rejectVersionOpen.value = true;
}
async function confirmRejectVersion() {
  const doc = rejectDoc.value;
  if (!doc?.versionId || !rejectVersionReason.value.trim()) {
    message.warning('请填写驳回原因');
    return;
  }
  try {
    await rejectVersion(doc.versionId, rejectVersionReason.value.trim());
    message.success(`「${doc.name}」已驳回`);
    rejectVersionOpen.value = false;
    if (selectedDoc.value?.id === doc.id) selectedDoc.value = undefined;
    await loadReviewDocuments();
  } catch (e: any) {
    message.error(e?.message || '驳回失败');
  }
}

/** ===== 通用知识条目审核 ===== */
const ITEM_TYPE_TAG: Record<string, { color: string; text: string }> = {
  POLICY: { color: 'purple', text: '政策' },
  PRICE: { color: 'red', text: '价格' },
  LEGAL: { color: 'volcano', text: '法务' },
  FAQ: { color: 'green', text: '问答' },
  SOP: { color: 'cyan', text: '流程' },
};
const RISK_TAG: Record<string, { color: string; text: string }> = {
  HIGH: { color: 'error', text: '高风险' },
  MED: { color: 'warning', text: '中风险' },
  LOW: { color: 'success', text: '低风险' },
};
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: 'processing', text: '待审核' },
  APPROVED: { color: 'success', text: '已通过' },
  REJECTED: { color: 'error', text: '已驳回' },
};
const tabs = [
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
];
const currentTab = ref<string>('PENDING');

function handleTabChange(key: string) {
  currentTab.value = key;
  gridApi.query();
}

async function handleApprove(row: AiReviewApi.ReviewItem) {
  try {
    await approveReviewItem(row.id);
    message.success('条目已通过');
    gridApi.query();
  } catch {
    message.error('操作失败');
  }
}

const rejectOpen = ref(false);
const rejectRow = ref<AiReviewApi.ReviewItem>();
const rejectReason = ref('');
function openReject(row: AiReviewApi.ReviewItem) {
  rejectRow.value = row;
  rejectReason.value = '';
  rejectOpen.value = true;
}
async function confirmReject() {
  if (!rejectRow.value || !rejectReason.value.trim()) {
    message.warning('请填写驳回原因');
    return;
  }
  try {
    await rejectReviewItem(rejectRow.value.id, rejectReason.value.trim());
    message.success('条目已驳回');
    rejectOpen.value = false;
    gridApi.query();
  } catch {
    message.error('操作失败');
  }
}

const chunkCache = new Map<number, string>();
const chunkContents = reactive<Record<number, string>>({});
async function loadChunk(row: AiReviewApi.ReviewItem) {
  if (!row.chunkId || chunkContents[row.chunkId] !== undefined) return;
  chunkContents[row.chunkId] = '';
  if (chunkCache.has(row.chunkId)) {
    chunkContents[row.chunkId] = chunkCache.get(row.chunkId)!;
    return;
  }
  try {
    const chunk = await getChunk(row.chunkId);
    const content = chunk?.content || '(知识单元不存在)';
    chunkCache.set(row.chunkId, content);
    chunkContents[row.chunkId] = content;
  } catch {
    chunkContents[row.chunkId] = '(知识单元加载失败)';
  }
}

const chunkDetailOpen = ref(false);
const chunkDetail = ref<AiChunkApi.Chunk>();
async function openChunkDetail(chunkId?: number) {
  if (!chunkId) return;
  try {
    chunkDetail.value = await getChunk(chunkId);
    chunkDetailOpen.value = true;
  } catch {
    message.error('来源内容加载失败');
  }
}

const gridOptions: VxeTableGridOptions<AiReviewApi.ReviewItem> = {
  columns: [
    { type: 'expand', width: 40, slots: { content: 'expand_content' } },
    { field: 'title', title: '主题', minWidth: 180, showOverflow: true },
    {
      field: 'itemType',
      title: '类型',
      width: 90,
      slots: { default: 'itemType' },
    },
    {
      field: 'riskLevel',
      title: '风险',
      width: 90,
      slots: { default: 'riskLevel' },
    },
    { field: 'content', title: '知识内容', minWidth: 280, showOverflow: true },
    {
      field: 'aiConfidence',
      title: 'AI 置信度',
      width: 100,
      formatter: ({ row }: any) =>
        row.aiConfidence == null ? '-' : Number(row.aiConfidence).toFixed(2),
    },
    {
      field: 'chunkId',
      title: '来源证据',
      width: 110,
      slots: { default: 'chunkId' },
    },
    { field: 'reviewer', title: '审核人', width: 90 },
    { field: 'status', title: '状态', width: 90, slots: { default: 'status' } },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ],
  height: 420,
  keepSource: true,
  proxyConfig: {
    ajax: {
      query: async ({ page }) => {
        if (
          !selectedDoc.value?.id ||
          domainOf(selectedDoc.value) === 'PATENT'
        ) {
          return { list: [], total: 0 };
        }
        return await getReviewItemPage({
          pageNo: page.currentPage,
          pageSize: page.pageSize,
          status: currentTab.value,
          docId: selectedDoc.value.id,
        });
      },
    },
  },
  rowConfig: { keyField: 'id', isHover: true },
  toolbarConfig: { refresh: true, search: false },
};

function buildActions(row: AiReviewApi.ReviewItem): ActionItem[] {
  if (row.status !== 'PENDING') return [];
  return [
    {
      label: '通过',
      type: 'link',
      icon: ACTION_ICON.AUDIT,
      onClick: () => handleApprove(row),
    },
    {
      label: '驳回',
      type: 'link',
      danger: true,
      icon: ACTION_ICON.CLOSE,
      onClick: () => openReject(row),
    },
  ];
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions,
  gridEvents: {
    expandChange: ({ row, expanded }: any) => {
      if (expanded) loadChunk(row);
    },
  } as any,
});

const isPatentSelected = computed(
  () => domainOf(selectedDoc.value) === 'PATENT',
);

onMounted(loadReviewDocuments);
</script>

<template>
  <Page
    auto-content-height
    title="审核发布"
    description="文档完成解析和知识构建后在此确认。专利按文档版本审核；通用知识按知识条目审核。最终发布统一经过冲突、质量闸门和索引门禁。"
  >
    <Alert
      class="mb-4"
      type="info"
      show-icon
      message="审核不是独立终点：通过后仍需发布，发布成功后内容才进入正式检索服务。"
    />

    <Card title="待审核文档" size="small" class="mb-4">
      <Table
        :data-source="reviewDocs"
        :loading="docsLoading"
        row-key="id"
        size="small"
        :pagination="false"
      >
        <Table.Column title="文档" data-index="name" :width="260" ellipsis />
        <Table.Column title="知识库" data-index="kbName" :width="160" />
        <Table.Column title="领域" :width="90">
          <template #default="{ record }">
            <Tag :color="domainOf(record) === 'PATENT' ? 'blue' : 'default'">
              {{ domainOf(record) === 'PATENT' ? '专利' : '通用' }}
            </Tag>
          </template>
        </Table.Column>
        <Table.Column title="版本" data-index="versionNo" :width="90" />
        <Table.Column title="领域信息" :width="260">
          <template #default="{ record }">
            <template v-if="domainOf(record) === 'PATENT'">
              {{
                docMetaField(record.domainMetadata, 'publicationNo') ||
                docMetaField(record.domainMetadata, 'applicationNo') ||
                '-'
              }}
              <span class="text-muted-foreground">
                ·
                {{
                  docMetaField(record.domainMetadata, 'title') ||
                  '未识别发明名称'
                }}
              </span>
            </template>
            <template v-else>知识条目审核</template>
          </template>
        </Table.Column>
        <Table.Column title="操作" :width="500" fixed="right">
          <template #default="{ record }">
            <Space>
              <Button size="small" @click="selectDocument(record)">
                {{ domainOf(record) === 'PATENT' ? '审核内容' : '审核条目' }}
              </Button>
              <Button size="small" @click="openVersions(record)">版本</Button>
              <Button size="small" @click="openConflicts(record)">冲突</Button>
              <Button size="small" @click="openDocumentTrace(record)"
                >处理链路</Button
              >
              <Button
                type="primary"
                size="small"
                @click="publishDocument(record)"
                >发布</Button
              >
              <Button danger size="small" @click="openRejectVersion(record)"
                >驳回</Button
              >
            </Space>
          </template>
        </Table.Column>
      </Table>
      <Empty
        v-if="!docsLoading && reviewDocs.length === 0"
        description="当前没有待审核文档"
      />
    </Card>

    <Card v-if="selectedDoc" size="small" class="mb-4">
      <template #title>
        <Space>
          <span>{{ selectedDoc.name }}</span>
          <Tag>{{ selectedDoc.versionNo || '-' }}</Tag>
          <Tag :color="isPatentSelected ? 'blue' : 'default'">
            {{ isPatentSelected ? '专利文档审核' : '知识条目审核' }}
          </Tag>
        </Space>
      </template>

      <template v-if="isPatentSelected">
        <Descriptions bordered size="small" :column="3">
          <Descriptions.Item label="申请号">{{
            docMetaField(selectedDoc.domainMetadata, 'applicationNo') || '-'
          }}</Descriptions.Item>
          <Descriptions.Item label="公布号">{{
            docMetaField(selectedDoc.domainMetadata, 'publicationNo') || '-'
          }}</Descriptions.Item>
          <Descriptions.Item label="发明名称">{{
            docMetaField(selectedDoc.domainMetadata, 'title') || '-'
          }}</Descriptions.Item>
          <Descriptions.Item label="申请人">{{
            docMetaField(selectedDoc.domainMetadata, 'applicants') || '-'
          }}</Descriptions.Item>
          <Descriptions.Item label="权利要求数">{{
            docMetaField(selectedDoc.domainMetadata, 'claimCount') || '-'
          }}</Descriptions.Item>
          <Descriptions.Item label="知识单元">{{
            selectedDoc.chunkCount ?? '-'
          }}</Descriptions.Item>
        </Descriptions>
        <div class="mt-3 flex gap-2">
          <Button @click="reviewContentOpen = true">审核内容</Button>
          <Button @click="openVersions(selectedDoc)">版本记录</Button>
          <Button @click="openConflicts(selectedDoc)">冲突裁决</Button>
          <Button @click="openDocumentTrace(selectedDoc)">处理链路</Button>
          <Button @click="openQuality(selectedDoc)">质量评测</Button>
          <Button type="primary" @click="publishDocument(selectedDoc)"
            >确认并发布</Button
          >
          <Button danger @click="openRejectVersion(selectedDoc)"
            >驳回版本</Button
          >
        </div>
      </template>

      <template v-else>
        <div class="mb-3 flex items-center justify-between">
          <Space>
            <Button
              v-for="tab in tabs"
              :key="tab.key"
              :type="currentTab === tab.key ? 'primary' : 'default'"
              size="small"
              @click="handleTabChange(tab.key)"
            >
              {{ tab.label }}
            </Button>
          </Space>
          <Space>
            <Button @click="openConflicts(selectedDoc)"> 冲突处理 </Button>
            <Button @click="openVersions(selectedDoc)">版本记录</Button>
            <Button @click="openQuality(selectedDoc)">质量评测</Button>
            <Button type="primary" @click="publishDocument(selectedDoc)"
              >发布当前版本</Button
            >
          </Space>
        </div>
        <Grid>
          <template #itemType="{ row }">
            <Tag :color="ITEM_TYPE_TAG[row.itemType]?.color || 'default'">{{
              ITEM_TYPE_TAG[row.itemType]?.text || row.itemType
            }}</Tag>
          </template>
          <template #riskLevel="{ row }">
            <Tag :color="RISK_TAG[row.riskLevel]?.color || 'default'">{{
              RISK_TAG[row.riskLevel]?.text || row.riskLevel
            }}</Tag>
          </template>
          <template #status="{ row }">
            <Tag :color="STATUS_TAG[row.status]?.color || 'default'">{{
              STATUS_TAG[row.status]?.text || row.status
            }}</Tag>
          </template>
          <template #chunkId="{ row }">
            <a v-if="row.chunkId" @click="openChunkDetail(row.chunkId)"
              >查看来源</a
            >
            <span v-else class="text-muted-foreground">-</span>
          </template>
          <template #expand_content="{ row }">
            <div
              class="whitespace-pre-wrap border-l-4 border-blue-500 px-3 py-4 leading-6"
            >
              {{
                chunkContents[row.chunkId ?? -1] ??
                (row.chunkId ? '来源内容加载中…' : '无匹配来源')
              }}
            </div>
          </template>
          <template #actions="{ row }"
            ><TableAction :actions="buildActions(row)"
          /></template>
        </Grid>
      </template>
    </Card>

    <Modal v-model:open="rejectOpen" title="驳回知识条目" @ok="confirmReject">
      <p class="mb-2 text-muted-foreground">{{ rejectRow?.title }}</p>
      <a-textarea
        v-model:value="rejectReason"
        :rows="3"
        placeholder="请填写驳回原因"
      />
    </Modal>

    <Modal
      v-model:open="rejectVersionOpen"
      title="驳回文档版本"
      @ok="confirmRejectVersion"
    >
      <p class="mb-2">{{ rejectDoc?.name }} · {{ rejectDoc?.versionNo }}</p>
      <a-textarea
        v-model:value="rejectVersionReason"
        :rows="3"
        placeholder="请填写驳回原因；驳回后版本回到草稿态"
      />
    </Modal>

    <Modal
      v-model:open="chunkDetailOpen"
      title="来源内容"
      width="720px"
      :footer="null"
    >
      <template v-if="chunkDetail">
        <div
          class="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 leading-6"
        >
          {{ chunkDetail.content }}
        </div>
      </template>
    </Modal>

    <ChunkModal
      v-model:open="reviewContentOpen"
      context="review"
      :document-id="selectedDoc?.id"
    />
  </Page>
</template>
