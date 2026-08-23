<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Descriptions, message } from 'ant-design-vue';
import { getDocumentTrace, type OpsApi } from '#/api/ai/ops';

const route = useRoute();
const router = useRouter();
const documentId = ref<number | undefined>(
  route.query.documentId ? Number(route.query.documentId) : undefined,
);
const loading = ref(false);
const trace = ref<OpsApi.DocumentTrace | null>(null);

async function query() {
  if (!documentId.value) {
    message.warning('请选择文档或输入文档编号');
    return;
  }
  loading.value = true;
  try {
    trace.value = await getDocumentTrace(documentId.value);
    if (!trace.value?.document) message.warning('未找到该文档');
  } catch (e: any) {
    message.error(e?.message || '查询失败');
  } finally {
    loading.value = false;
  }
}

function metaField(meta: any, key: string): string {
  if (!meta) return '';
  const v = meta[key];
  return v === undefined || v === null ? '' : String(v);
}
function fmtTime(t?: string): string {
  return t ? String(t).replace('T', ' ').substring(0, 19) : '-';
}

onMounted(() => {
  if (documentId.value) query();
});
</script>

<template>
  <Page auto-content-height title="文档链路" description="用于定位文档从上传、解析、领域抽取、知识构建到发布过程中发生的问题。">
    <div class="ops-toolbar">
      <Button v-if="route.query.documentId" @click="router.back()">← 返回文档</Button>
      <InputNumber v-model:value="documentId" placeholder="文档编号" style="width: 180px" :min="1" />
      <Button type="primary" :loading="loading" @click="query">查看链路</Button>
    </div>

    <template v-if="trace?.document">
      <Descriptions title="文档信息" bordered size="small" class="ops-card">
        <Descriptions.Item label="名称">{{ trace.document.name }}</Descriptions.Item>
        <Descriptions.Item label="类型">{{ trace.document.type }}</Descriptions.Item>
        <Descriptions.Item label="业务状态">
          <Tag :color="trace.document.parseStatus === 'PUBLISHED' ? 'green' : trace.document.parseStatus === 'FAILED' ? 'red' : 'blue'">{{ trace.document.parseStatus }}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="知识单元">{{ trace.document.chunkCount }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.domainMetadata" label="申请号">{{ metaField(trace.document.domainMetadata, 'applicationNo') }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.domainMetadata" label="公布号">{{ metaField(trace.document.domainMetadata, 'publicationNo') }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.domainMetadata" label="发明名称">{{ metaField(trace.document.domainMetadata, 'title') }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.domainMetadata" label="申请人">{{ metaField(trace.document.domainMetadata, 'applicants') }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.domainMetadata" label="权利要求数">{{ metaField(trace.document.domainMetadata, 'claimCount') }}</Descriptions.Item>
        <Descriptions.Item v-if="trace.document.errorMsg" label="失败原因">{{ trace.document.errorMsg }}</Descriptions.Item>
      </Descriptions>

      <Card title="当前版本" size="small" class="ops-card">
        <template v-if="trace.version">
          {{ trace.version.versionNo }} · <Tag :color="trace.version.status === 'PUBLISHED' ? 'green' : 'orange'">{{ trace.version.status }}</Tag>
          <span v-if="trace.version.effectiveFrom"> · 生效 {{ fmtTime(trace.version.effectiveFrom) }}</span>
        </template>
        <span v-else>暂无版本</span>
      </Card>

      <Card title="处理阶段" size="small" class="ops-card">
        <template v-if="trace.jobTrace">
          <div class="ops-job-head">
            任务 #{{ trace.jobTrace.jobId }} ·
            <Tag :color="trace.jobTrace.status === 'SUCCEEDED' ? 'green' : trace.jobTrace.status === 'FAILED' ? 'red' : 'orange'">{{ trace.jobTrace.status }}</Tag>
            <span v-if="trace.jobTrace.stage"> · 当前阶段 {{ trace.jobTrace.stage }}</span>
            <span v-if="trace.jobTrace.errorMessage" class="ops-error"> · {{ trace.jobTrace.errorMessage }}</span>
          </div>
          <Timeline v-if="trace.jobTrace.tasks && trace.jobTrace.tasks.length">
            <TimelineItem v-for="(t, i) in trace.jobTrace.tasks" :key="i" :color="t.status === 'SUCCEEDED' ? 'green' : t.status === 'FAILED' ? 'red' : 'blue'">
              <div class="ops-stage">
                <b>{{ t.stageCode }}</b>
                <span class="ops-stage-meta">{{ t.handler || '' }} · {{ t.status }} · {{ fmtTime(t.startedAt) }} ~ {{ fmtTime(t.finishedAt) }}</span>
                <div v-if="t.metricsJson" class="ops-stage-meta">{{ t.metricsJson }}</div>
                <div v-if="t.errorMessage" class="ops-error">{{ t.errorMessage }}</div>
              </div>
            </TimelineItem>
          </Timeline>
          <span v-else>暂无阶段记录</span>
        </template>
        <span v-else>暂无处理任务记录</span>
      </Card>

      <Card title="生成的知识单元（诊断）" size="small" class="ops-card">
        <Table :data-source="trace.chunks || []" size="small" :pagination="false" row-key="id">
          <TableColumn title="ID" data-index="id" width="80" />
          <TableColumn title="类型" data-index="chunkType" width="130" />
          <TableColumn title="章节" width="130"><template #default="{ record }">{{ record.metadata?.sectionType || '-' }}</template></TableColumn>
          <TableColumn title="权利要求" width="100"><template #default="{ record }">{{ record.metadata?.claimNo ?? '-' }}</template></TableColumn>
          <TableColumn title="状态" data-index="status" width="100" />
          <TableColumn title="内容" data-index="content" ellipsis />
        </Table>
      </Card>
    </template>
  </Page>
</template>

<style scoped>
.ops-toolbar { margin-bottom: 12px; display: flex; gap: 8px; }
.ops-card { margin-bottom: 12px; }
.ops-job-head { margin-bottom: 8px; }
.ops-stage-meta { margin-left: 8px; color: #8a8a8e; font-size: 12px; }
.ops-error { color: #ef4444; font-size: 12px; }
</style>
