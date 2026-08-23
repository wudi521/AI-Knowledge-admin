<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';
import { Page } from '@vben/common-ui';

import {
  getDocumentPage,
  getKnowledgeBasePage,
  type KnowledgeDocument,
} from '#/api/ai/knowledge';
import { docMetaField } from '../../document/data';

defineOptions({ name: 'KnowledgeWorkspace' });

const route = useRoute();
const router = useRouter();
const kbId = ref<number>(Number(route.query.kbId || 0));
const kb = ref<any>(null);
const docs = ref<KnowledgeDocument[]>([]);
const docsLoading = ref(false);
const activeTab = ref('overview');

async function loadKb() {
  if (!kbId.value) return;
  try {
    const page = await getKnowledgeBasePage({ pageNo: 1, pageSize: 100 });
    kb.value = (page.list || []).find((item: any) => item.id === kbId.value) || null;
  } catch {
    kb.value = null;
  }
}

async function loadDocs() {
  if (!kbId.value) return;
  docsLoading.value = true;
  try {
    const page = await getDocumentPage({ kbId: kbId.value, pageNo: 1, pageSize: 100 });
    docs.value = page.list || [];
  } finally {
    docsLoading.value = false;
  }
}

const publishedCount = () => docs.value.filter((d) => d.parseStatus === 'PUBLISHED').length;
const reviewCount = () => docs.value.filter((d) => d.parseStatus === 'REVIEW').length;
const failedCount = () => docs.value.filter((d) => d.parseStatus === 'FAILED').length;
const withMetadata = () => docs.value.filter((d) => d.domainMetadata).length;

function fmtTime(t?: string | number): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}
function goDocuments() {
  router.push({ path: '/kb/documents', query: { kbId: kbId.value } });
}
function startChat() {
  router.push({ path: '/wb/workbench-vben', query: { kbId: kbId.value } });
}
function openQaDebug() {
  router.push({ path: '/ai/retrieval', query: { kbId: kbId.value } });
}
function openEvaluation() {
  router.push({ path: '/ai/eval', query: { kbId: kbId.value } });
}
function openReview(documentId?: number) {
  router.push({ path: '/ai/review', query: documentId ? { docId: documentId, status: 'PENDING' } : {} });
}
function viewTrace(documentId: number) {
  router.push({ path: '/kb/ops/document-trace', query: { documentId } });
}
function openAdvanced(doc: KnowledgeDocument) {
  router.push({ path: '/kb/documents', query: { kbId: kbId.value, docId: doc.id } });
}
function editKb() {
  router.push({ path: '/kb/knowledge-base', query: { editId: kbId.value } });
}

onMounted(() => {
  loadKb();
  loadDocs();
});
</script>

<template>
  <Page auto-content-height>
    <div class="ws-head">
      <div>
        <Button type="link" class="!p-0" @click="router.push('/kb/knowledge-base')">← 返回知识库</Button>
        <h2 class="ws-title">{{ kb?.name || '知识库工作空间' }}</h2>
        <p class="ws-desc">
          <Tag v-if="kb?.domainCode === 'PATENT'" color="blue">专利知识库</Tag>
          <Tag v-else>通用知识库</Tag>
          {{ docs.length }} 份资料 · {{ publishedCount() }} 已发布 · {{ reviewCount() }} 待审核 · {{ failedCount() }} 异常
        </p>
      </div>
      <Space>
        <Button type="primary" @click="goDocuments">上传资料</Button>
        <Button type="primary" ghost @click="startChat">开始问答</Button>
        <Button @click="editKb">知识库设置</Button>
      </Space>
    </div>

    <Tabs v-model:active-key="activeTab">
      <Tabs.TabPane key="overview" tab="概览">
        <Row :gutter="16">
          <Col :span="6"><Card><Statistic title="资料总数" :value="docs.length" /></Card></Col>
          <Col :span="6"><Card><Statistic title="已发布" :value="publishedCount()" /></Card></Col>
          <Col :span="6"><Card><Statistic title="待审核" :value="reviewCount()" /></Card></Col>
          <Col :span="6"><Card><Statistic title="异常" :value="failedCount()" /></Card></Col>
        </Row>
        <Alert v-if="reviewCount() > 0" class="mt-4" type="warning" show-icon :message="`有 ${reviewCount()} 份资料等待审核，发布后才参与正式问答。`">
          <template #action><Button size="small" @click="openReview()">去审核</Button></template>
        </Alert>
        <Alert v-if="failedCount() > 0" class="mt-3" type="error" show-icon :message="`有 ${failedCount()} 份资料处理失败，请查看失败原因并重试。`">
          <template #action><Button size="small" @click="goDocuments">处理异常</Button></template>
        </Alert>
        <Card title="业务流程" size="small" class="mt-4">
          <Space wrap>
            <Button type="primary" @click="goDocuments">1. 上传 / 管理资料</Button>
            <Button @click="openReview()">2. 审核并发布</Button>
            <Button @click="openQaDebug">3. 问答调试</Button>
            <Button @click="openEvaluation">4. 质量评测</Button>
          </Space>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="documents" tab="文档">
        <div class="mb-3 flex justify-end"><Button type="primary" @click="goDocuments">上传资料</Button></div>
        <Table :data-source="docs" :loading="docsLoading" size="small" row-key="id" :pagination="false">
          <Table.Column title="文档名称" data-index="name" />
          <Table.Column v-if="kb?.domainCode === 'PATENT'" title="申请号" width="150">
            <template #default="{ record }">{{ docMetaField(record.domainMetadata, 'applicationNo') || '-' }}</template>
          </Table.Column>
          <Table.Column v-if="kb?.domainCode === 'PATENT'" title="公布号" width="150">
            <template #default="{ record }">{{ docMetaField(record.domainMetadata, 'publicationNo') || '-' }}</template>
          </Table.Column>
          <Table.Column title="业务状态" width="110">
            <template #default="{ record }">
              <Tag :color="record.parseStatus === 'PUBLISHED' ? 'green' : record.parseStatus === 'FAILED' ? 'red' : record.parseStatus === 'REVIEW' ? 'orange' : 'blue'">
                {{ record.parseStatus === 'PUBLISHED' ? '已发布' : record.parseStatus === 'FAILED' ? '处理失败' : record.parseStatus === 'REVIEW' ? '待审核' : '处理中' }}
              </Tag>
            </template>
          </Table.Column>
          <Table.Column title="更新时间" width="170"><template #default="{ record }">{{ fmtTime(record.createTime) }}</template></Table.Column>
          <Table.Column title="操作" width="250" fixed="right">
            <template #default="{ record }">
              <Space>
                <a v-if="record.parseStatus === 'REVIEW'" @click="openReview(record.id)">去审核</a>
                <a @click="viewTrace(record.id!)">处理链路</a>
                <a @click="openAdvanced(record)">高级信息</a>
              </Space>
            </template>
          </Table.Column>
        </Table>
      </Tabs.TabPane>

      <Tabs.TabPane key="qa" tab="问答调试">
        <Card title="验证这个知识库能否正确回答" size="small">
          <p class="text-muted-foreground">使用与正式对话一致的检索、证据和回答链路；调试页额外展示 Query Planner 路由、证据、引用和模型执行信息。</p>
          <Space class="mt-3">
            <Button type="primary" @click="openQaDebug">打开问答调试</Button>
            <Button @click="startChat">进入正式问答</Button>
          </Space>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="quality" tab="质量">
        <Row :gutter="16">
          <Col :span="8"><Card><Statistic title="待审核资料" :value="reviewCount()" /></Card></Col>
          <Col :span="8"><Card><Statistic title="处理异常" :value="failedCount()" /></Card></Col>
          <Col :span="8"><Card><Statistic title="结构化元数据完整" :value="`${withMetadata()}/${docs.length}`" /></Card></Col>
        </Row>
        <Card title="质量闭环" size="small" class="mt-4">
          <p class="text-muted-foreground">文档内容问题在“审核发布”处理；回答质量通过评测用例持续回归。运行链路用于定位异常，不等同于知识质量。</p>
          <Space class="mt-3">
            <Button @click="openReview()">审核发布</Button>
            <Button type="primary" @click="openEvaluation">运行质量评测</Button>
          </Space>
        </Card>
      </Tabs.TabPane>

      <Tabs.TabPane key="settings" tab="设置">
        <Descriptions v-if="kb" title="知识库设置" bordered size="small">
          <Descriptions.Item label="名称">{{ kb.name }}</Descriptions.Item>
          <Descriptions.Item label="领域">{{ kb.domainCode === 'PATENT' ? '专利' : '通用' }}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag :color="kb.status === 1 ? 'green' : 'default'">{{ kb.status === 1 ? '启用' : '停用' }}</Tag></Descriptions.Item>
          <Descriptions.Item label="说明">{{ kb.remark || '-' }}</Descriptions.Item>
        </Descriptions>
        <Button class="mt-3" @click="editKb">编辑设置</Button>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>

<style scoped>
.ws-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.ws-title { margin: 4px 0 0; font-size: 20px; }
.ws-desc { color: #8a8a8e; margin-top: 6px; }
</style>
