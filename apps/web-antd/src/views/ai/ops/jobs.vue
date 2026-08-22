<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { getOpsJobs, getOpsJobDetail, type OpsApi } from '#/api/ai/ops';

const jobs = ref<OpsApi.Job[]>([]);
const total = ref(0);
const loading = ref(false);
const pageNo = ref(1);
const pageSize = ref(20);
const statusFilter = ref<string | undefined>(undefined);

const detailOpen = ref(false);
const detail = ref<OpsApi.JobTrace | null>(null);

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
    message.error(e?.message || '加载失败');
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

function fmtTime(t?: string): string {
  return t ? String(t).replace('T', ' ').substring(0, 19) : '-';
}

onMounted(load);
</script>

<template>
  <Page auto-content-height title="任务中心">
    <div class="ops-toolbar">
      <Select
        v-model:value="statusFilter"
        placeholder="按状态筛选"
        style="width: 160px"
        allow-clear
        :options="[
          { label: 'PENDING', value: 'PENDING' },
          { label: 'RUNNING', value: 'RUNNING' },
          { label: 'SUCCEEDED', value: 'SUCCEEDED' },
          { label: 'FAILED', value: 'FAILED' },
        ]"
        @change="load"
      />
      <Button type="primary" @click="load">刷新</Button>
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
      <TableColumn title="任务ID" data-index="id" width="90" />
      <TableColumn title="文档ID" data-index="documentId" width="90" />
      <TableColumn title="领域" data-index="domainCode" width="90" />
      <TableColumn title="阶段" data-index="stage" width="120" />
      <TableColumn title="状态" width="110">
        <template #default="{ record }">
          <Tag :color="record.status === 'SUCCEEDED' ? 'green' : record.status === 'FAILED' ? 'red' : 'orange'">
            {{ record.status }}
          </Tag>
        </template>
      </TableColumn>
      <TableColumn title="重试" data-index="retryCount" width="70" />
      <TableColumn title="错误" data-index="errorMessage" ellipsis />
      <TableColumn title="开始" width="160">
        <template #default="{ record }">{{ fmtTime(record.startedAt) }}</template>
      </TableColumn>
      <TableColumn title="操作" width="100" fixed="right">
        <template #default="{ record }">
          <a @click="showDetail(record.id)">阶段时间轴</a>
        </template>
      </TableColumn>
    </Table>

    <Modal v-model:open="detailOpen" title="任务阶段时间轴" :footer="null" :width="640" :z-index="1000" :destroy-on-close="true">
      <template v-if="detail">
        <div class="ops-detail-head">
          任务 #{{ detail.jobId }} · {{ detail.status }}
          <span v-if="detail.stage"> · 阶段 {{ detail.stage }}</span>
          <span v-if="detail.errorMessage" class="ops-error"> · {{ detail.errorMessage }}</span>
        </div>
        <Timeline v-if="detail.tasks && detail.tasks.length">
          <TimelineItem
            v-for="(t, i) in detail.tasks"
            :key="i"
            :color="t.status === 'SUCCEEDED' ? 'green' : t.status === 'FAILED' ? 'red' : 'blue'"
          >
            <div class="ops-stage">
              <b>{{ t.stageCode }}</b>
              <span class="ops-stage-meta">
                {{ t.handler || '' }} · {{ t.status }} · {{ fmtTime(t.startedAt) }} ~ {{ fmtTime(t.finishedAt) }}
              </span>
              <div v-if="t.metricsJson" class="ops-stage-meta">{{ t.metricsJson }}</div>
              <div v-if="t.errorMessage" class="ops-error">{{ t.errorMessage }}</div>
            </div>
          </TimelineItem>
        </Timeline>
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
  margin-bottom: 8px;
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
