<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Button,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  message,
} from 'ant-design-vue';
import {
  getOpsJobs,
  getOpsJobDetail,
  retryOpsIngest,
  type OpsApi,
} from '#/api/ai/ops';
import { KNOWLEDGE_ROUTES } from '../knowledge-routes';

const router = useRouter();
const jobs = ref<OpsApi.Job[]>([]);
const total = ref(0);
const loading = ref(false);
const pageNo = ref(1);
const pageSize = ref(20);
const statusFilter = ref<string | undefined>(undefined);
const retryingDocumentId = ref<number>();

const detailOpen = ref(false);
const detail = ref<OpsApi.JobTrace | null>(null);

const STATUS_TEXT: Record<string, string> = {
  PENDING: '等待处理',
  RUNNING: '处理中',
  SUCCEEDED: '处理完成',
  FAILED: '处理失败',
};

const STAGE_TEXT: Record<string, string> = {
  FILE_RECEIVED: '接收文件',
  PARSE: '解析文档',
  DOMAIN_EXTRACT: '领域抽取',
  CHUNK: '知识切分',
  EMBED: '向量化',
  INDEX_ES: '全文索引',
  INDEX_VECTOR: '向量索引',
  VALIDATE: '结果校验',
  PUBLISH: '发布',
};

function statusText(status?: string) {
  return status ? STATUS_TEXT[status] || status : '-';
}
function stageText(stage?: string) {
  return stage ? STAGE_TEXT[stage] || stage : '-';
}

async function load() {
  loading.value = true;
  try {
    const res = await getOpsJobs({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: statusFilter.value,
    });
    jobs.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    message.error(e?.message || '任务加载失败');
  } finally {
    loading.value = false;
  }
}

async function showDetail(jobId: number) {
  try {
    detail.value = await getOpsJobDetail(jobId);
    detailOpen.value = true;
  } catch (e: any) {
    message.error(e?.message || '详情加载失败');
  }
}

function viewDocument(documentId?: number) {
  if (!documentId) return;
  router.push({
    path: KNOWLEDGE_ROUTES.documentTrace,
    query: { documentId },
  });
}

async function retryJob(record: OpsApi.Job) {
  if (!record.documentId) return;
  retryingDocumentId.value = record.documentId;
  try {
    await retryOpsIngest(record.documentId);
    message.success('已重新执行完整处理流程');
    await load();
  } catch (e: any) {
    message.error(e?.message || '重新执行失败');
  } finally {
    retryingDocumentId.value = undefined;
  }
}

function fmtTime(t?: string): string {
  return t ? String(t).replace('T', ' ').substring(0, 19) : '-';
}

onMounted(load);
</script>

<template>
  <Page
    auto-content-height
    title="任务中心"
    description="查看资料处理任务的当前阶段和失败原因；失败任务可直接重新执行，不需要重新上传文件。"
  >
    <div class="ops-toolbar">
      <Select
        v-model:value="statusFilter"
        placeholder="全部状态"
        style="width: 160px"
        allow-clear
        :options="[
          { label: '等待处理', value: 'PENDING' },
          { label: '处理中', value: 'RUNNING' },
          { label: '处理完成', value: 'SUCCEEDED' },
          { label: '处理失败', value: 'FAILED' },
        ]"
        @change="load"
      />
      <Button @click="load">刷新</Button>
    </div>

    <Table
      :data-source="jobs"
      :loading="loading"
      size="small"
      row-key="id"
      :pagination="{
        current: pageNo,
        pageSize,
        total,
        showSizeChanger: true,
        onChange: (p: number, s: number) => {
          pageNo = p;
          pageSize = s;
          load();
        },
      }"
    >
      <Table.Column title="任务" width="100">
        <template #default="{ record }">#{{ record.id }}</template>
      </Table.Column>
      <Table.Column title="文档" width="110">
        <template #default="{ record }">
          <a v-if="record.documentId" @click="viewDocument(record.documentId)"
            >#{{ record.documentId }}</a
          >
          <span v-else>-</span>
        </template>
      </Table.Column>
      <Table.Column title="领域" width="90">
        <template #default="{ record }">{{
          record.domainCode === 'PATENT' ? '专利' : record.domainCode || '通用'
        }}</template>
      </Table.Column>
      <Table.Column title="当前阶段" width="130">
        <template #default="{ record }">{{ stageText(record.stage) }}</template>
      </Table.Column>
      <Table.Column title="状态" width="110">
        <template #default="{ record }">
          <Tag
            :color="
              record.status === 'SUCCEEDED'
                ? 'green'
                : record.status === 'FAILED'
                  ? 'red'
                  : record.status === 'RUNNING'
                    ? 'blue'
                    : 'default'
            "
          >
            {{ statusText(record.status) }}
          </Tag>
        </template>
      </Table.Column>
      <Table.Column title="已重试" data-index="retryCount" width="80" />
      <Table.Column title="失败原因" data-index="errorMessage" ellipsis>
        <template #default="{ record }">
          <span :class="record.status === 'FAILED' ? 'ops-error' : ''">{{
            record.errorMessage || '-'
          }}</span>
        </template>
      </Table.Column>
      <Table.Column title="开始时间" width="170">
        <template #default="{ record }">{{
          fmtTime(record.startedAt)
        }}</template>
      </Table.Column>
      <Table.Column title="操作" width="220" fixed="right">
        <template #default="{ record }">
          <Space>
            <a @click="showDetail(record.id)">执行详情</a>
            <a v-if="record.documentId" @click="viewDocument(record.documentId)"
              >文档链路</a
            >
            <Button
              v-if="record.status === 'FAILED' && record.documentId"
              type="link"
              danger
              size="small"
              :loading="retryingDocumentId === record.documentId"
              @click="retryJob(record)"
            >
              重新执行
            </Button>
          </Space>
        </template>
      </Table.Column>
    </Table>

    <Modal
      v-model:open="detailOpen"
      title="任务执行详情"
      :footer="null"
      :width="720"
      :destroy-on-close="true"
    >
      <template v-if="detail">
        <div class="ops-detail-head">
          任务 #{{ detail.jobId }} · {{ statusText(detail.status) }}
          <span v-if="detail.stage"> · {{ stageText(detail.stage) }}</span>
          <span v-if="detail.errorMessage" class="ops-error">
            · {{ detail.errorMessage }}</span
          >
        </div>
        <Timeline v-if="detail.tasks && detail.tasks.length">
          <Timeline.Item
            v-for="(t, i) in detail.tasks"
            :key="i"
            :color="
              t.status === 'SUCCEEDED'
                ? 'green'
                : t.status === 'FAILED'
                  ? 'red'
                  : 'blue'
            "
          >
            <div class="ops-stage">
              <b>{{ stageText(t.stageCode) }}</b>
              <span class="ops-stage-meta">
                {{ statusText(t.status) }} · {{ fmtTime(t.startedAt) }} ~
                {{ fmtTime(t.finishedAt) }}
              </span>
              <div v-if="t.errorMessage" class="ops-error">
                {{ t.errorMessage }}
              </div>
              <details
                v-if="t.metricsJson || t.outputSummaryJson"
                class="ops-stage-meta mt-1"
              >
                <summary>技术详情</summary>
                <div v-if="t.metricsJson">{{ t.metricsJson }}</div>
                <div v-if="t.outputSummaryJson">{{ t.outputSummaryJson }}</div>
              </details>
            </div>
          </Timeline.Item>
        </Timeline>
        <Empty v-else description="暂无阶段记录" />
      </template>
    </Modal>
  </Page>
</template>

<style scoped>
.ops-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
.ops-detail-head {
  margin-bottom: 12px;
}
.ops-stage-meta {
  margin-left: 8px;
  color: #8a8a8e;
  font-size: 12px;
}
.ops-error {
  color: #ef4444;
  font-size: 12px;
}
</style>
