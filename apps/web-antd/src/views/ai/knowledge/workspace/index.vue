<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Descriptions, message, Statistic, Table, Tag } from 'ant-design-vue';
import { getDocumentPage, type KnowledgeDocument } from '#/api/ai/knowledge';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';
import { docMetaField } from '../document/data';

defineOptions({ name: 'KnowledgeWorkspace' });

const route = useRoute();
const router = useRouter();
const kbId = ref<number>(Number(route.query.kbId || 0));

const kb = ref<any>(null);
const docs = ref<KnowledgeDocument[]>([]);
const docsLoading = ref(false);
const activeTab = ref('overview');

async function loadKb() {
  try {
    const page = await getKnowledgeBasePage({ pageNo: 1, pageSize: 50 });
    kb.value = (page.list || []).find((k: any) => k.id === kbId.value) || null;
  } catch {
    // 忽略
  }
}

async function loadDocs() {
  docsLoading.value = true;
  try {
    const page = await getDocumentPage({ kbId: kbId.value, pageNo: 1, pageSize: 100 });
    docs.value = page.list || [];
  } finally {
    docsLoading.value = false;
  }
}

const publishedCount = () => docs.value.filter((d) => d.parseStatus === 'PUBLISHED').length;
const failedCount = () => docs.value.filter((d) => d.parseStatus === 'FAILED').length;
const withMetadata = () => docs.value.filter((d) => d.domainMetadata).length;

function fmtTime(t?: string | number): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function uploadDoc() {
  router.push({ path: '/kb/documents', query: { kbId: kbId.value } });
}
function startChat() {
  router.push({ path: '/wb/workbench-vben', query: { kbId: kbId.value } });
}
function viewTrace(documentId: number) {
  router.push({ path: '/kb/ops/document-trace', query: { documentId } });
}
function openChunks(doc: KnowledgeDocument) {
  router.push({ path: '/kb/documents', query: { docId: doc.id } });
}
function editKb() {
  router.push({ path: '/kb/knowledge-base' });
}
</script>

<template>
  <Page auto-content-height>
    <div class="ws-head">
      <div>
        <h2 class="ws-title">{{ kb?.name || '知识库工作空间' }}</h2>
        <p class="ws-desc">
          <Tag v-if="kb?.domainCode === 'PATENT'" color="blue">专利领域</Tag>
          <Tag v-else color="default">通用领域</Tag>
          {{ docs.length }} 份文档 · {{ publishedCount() }} 已发布 · {{ failedCount() }} 异常
        </p>
      </div>
      <div class="ws-actions">
        <Button type="primary" @click="uploadDoc">上传资料</Button>
        <Button type="primary" ghost @click="startChat">开始问答</Button>
        <Button @click="editKb">设置</Button>
      </div>
    </div>

    <Tabs v-model:active-key="activeTab">
      <!-- 概览 -->
      <TabPane key="overview" tab="概览">
        <Row :gutter="16">
          <Col :span="6"><Card><Statistic title="文档" :value="docs.length" /></Card></Col>
          <Col :span="6"><Card><Statistic title="已发布" :value="publishedCount()" value-style="color:#16a34a" /></Card></Col>
          <Col :span="6"><Card><Statistic title="异常" :value="failedCount()" value-style="color:#ef4444" /></Card></Col>
          <Col :span="6"><Card><Statistic title="含专利元数据" :value="withMetadata()" /></Card></Col>
        </Row>
        <Card title="快捷操作" size="small" style="margin-top: 12px">
          <Space>
            <Button type="primary" @click="uploadDoc">上传资料</Button>
            <Button @click="startChat">开始问答</Button>
            <Button @click="activeTab = 'quality'">检查知识</Button>
          </Space>
        </Card>
      </TabPane>

      <!-- 资料 -->
      <TabPane key="docs" tab="资料">
        <Table :data-source="docs" :loading="docsLoading" size="small" row-key="id" :pagination="false">
          <TableColumn title="文档名称" data-index="name" min-width="220" ellipsis />
          <TableColumn title="申请号" width="150">
            <template #default="{ record }">{{ docMetaField(record.domainMetadata, 'applicationNo') || '-' }}</template>
          </TableColumn>
          <TableColumn title="公布号" width="150">
            <template #default="{ record }">{{ docMetaField(record.domainMetadata, 'publicationNo') || '-' }}</template>
          </TableColumn>
          <TableColumn title="解析状态" width="110">
            <template #default="{ record }">
              <Tag :color="record.parseStatus === 'PUBLISHED' ? 'green' : record.parseStatus === 'FAILED' ? 'red' : 'blue'">
                {{ record.parseStatus }}
              </Tag>
            </template>
          </TableColumn>
          <TableColumn title="更新时间" width="160">
            <template #default="{ record }">{{ fmtTime(record.createTime) }}</template>
          </TableColumn>
          <TableColumn title="操作" width="220" fixed="right">
            <template #default="{ record }">
              <Space>
                <a @click="viewTrace(record.id)">查看链路</a>
                <a @click="openChunks(record)">知识片段</a>
              </Space>
            </template>
          </TableColumn>
        </Table>
      </TabPane>

      <!-- 知识内容 -->
      <TabPane key="content" tab="知识内容">
        <Card size="small" title="知识片段(按文档查看)">
          <Table :data-source="docs" :loading="docsLoading" size="small" row-key="id" :pagination="false">
            <TableColumn title="文档名称" data-index="name" min-width="240" ellipsis />
            <TableColumn title="片段数" data-index="chunkCount" width="100" />
            <TableColumn title="操作" width="140" fixed="right">
              <template #default="{ record }">
                <a @click="openChunks(record)">查看知识片段</a>
              </template>
            </TableColumn>
          </Table>
        </Card>
      </TabPane>

      <!-- 质量 -->
      <TabPane key="quality" tab="质量">
        <Descriptions title="解析质量" bordered size="small">
          <Descriptions.Item label="文档总数">{{ docs.length }}</Descriptions.Item>
          <Descriptions.Item label="已发布">{{ publishedCount() }}</Descriptions.Item>
          <Descriptions.Item label="异常">{{ failedCount() }}</Descriptions.Item>
          <Descriptions.Item label="专利元数据完整">{{ withMetadata() }}/{{ docs.length }}</Descriptions.Item>
        </Descriptions>
        <Card title="待处理异常" size="small" style="margin-top: 12px">
          <div v-if="failedCount() === 0">无待处理异常 ✅</div>
          <ul v-else>
            <li v-for="d in docs.filter((x) => x.parseStatus === 'FAILED')" :key="d.id">
              {{ d.name }}：{{ d.errorMsg || '解析失败' }}
              <a @click="viewTrace(d.id)">查看链路</a>
            </li>
          </ul>
        </Card>
      </TabPane>

      <!-- 设置 -->
      <TabPane key="settings" tab="设置">
        <Descriptions v-if="kb" title="知识库设置" bordered size="small">
          <Descriptions.Item label="名称">{{ kb.name }}</Descriptions.Item>
          <Descriptions.Item label="领域">{{ kb.domainCode }}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag :color="kb.status === 1 ? 'green' : 'default'">{{ kb.status === 1 ? '启用' : '停用' }}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="备注">{{ kb.remark || '-' }}</Descriptions.Item>
        </Descriptions>
      </TabPane>
    </Tabs>
  </Page>
</template>

<style scoped>
.ws-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.ws-title {
  margin: 0;
  font-size: 20px;
}
.ws-desc {
  color: #8a8a8e;
  margin-top: 4px;
}
</style>
