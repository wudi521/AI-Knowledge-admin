<script setup lang="ts">
import { ref } from 'vue';
import { Descriptions, message } from 'ant-design-vue';
import { getQueryTrace, type OpsApi } from '#/api/ai/ops';

const traceId = ref<string>('');
const loading = ref(false);
const trace = ref<OpsApi.QueryTrace | null>(null);

async function query() {
  if (!traceId.value.trim()) {
    message.warning('请输入 Trace ID');
    return;
  }
  loading.value = true;
  try {
    trace.value = await getQueryTrace(traceId.value.trim());
    if (!trace.value?.traceId) {
      message.warning('未找到该查询链路');
    }
  } catch (e: any) {
    message.error(e?.message || '查询失败');
  } finally {
    loading.value = false;
  }
}

function fmtTime(t?: string): string {
  return t ? String(t).replace('T', ' ').substring(0, 19) : '-';
}
</script>

<template>
  <Page auto-content-height title="查询链路 · Query Trace">
    <div class="ops-toolbar">
      <Input v-model:value="traceId" placeholder="输入 Trace ID(如 ev-xxx / 检索测试页 traceId)" style="width: 320px" />
      <Button type="primary" :loading="loading" @click="query">查询链路</Button>
    </div>

    <template v-if="trace?.traceId">
      <Descriptions title="检索轨迹" bordered size="small" class="ops-card">
        <Descriptions.Item label="问题">{{ trace.query }}</Descriptions.Item>
        <Descriptions.Item label="路由">{{ trace.route }}</Descriptions.Item>
        <Descriptions.Item label="意图">{{ trace.intent }}</Descriptions.Item>
        <Descriptions.Item label="领域">{{ trace.domainCode }}</Descriptions.Item>
        <Descriptions.Item label="变体数">{{ trace.variantCount }}</Descriptions.Item>
        <Descriptions.Item label="BM25 命中">{{ trace.bm25Hits }}</Descriptions.Item>
        <Descriptions.Item label="向量命中">{{ trace.vectorHits }}</Descriptions.Item>
        <Descriptions.Item label="融合候选">{{ trace.fused }}</Descriptions.Item>
        <Descriptions.Item label="返回结果">{{ trace.resultCount }}</Descriptions.Item>
        <Descriptions.Item label="耗时(ms)">{{ trace.elapsedMs }}</Descriptions.Item>
        <Descriptions.Item label="阻断">
          <Tag :color="trace.blocked ? 'red' : 'green'">{{ trace.blocked ? '是' : '否' }}</Tag>
        </Descriptions.Item>
      </Descriptions>

      <Card title="阶段时间轴" size="small" class="ops-card">
        <Timeline v-if="trace.stages && trace.stages.length">
          <TimelineItem
            v-for="(s, i) in trace.stages"
            :key="i"
            :color="s.status === 'SUCCEEDED' ? 'green' : s.status === 'FAILED' ? 'red' : 'blue'"
          >
            <div class="ops-stage">
              <b>{{ s.stageCode }}</b>
              <span class="ops-stage-meta">
                {{ s.handler || '' }} · {{ s.status }} · {{ fmtTime(s.startedAt) }} ~ {{ fmtTime(s.finishedAt) }}
              </span>
              <div v-if="s.metricsJson" class="ops-stage-meta">{{ s.metricsJson }}</div>
              <div v-if="s.errorMessage" class="ops-error">{{ s.errorMessage }}</div>
            </div>
          </TimelineItem>
        </Timeline>
        <span v-else>暂无阶段记录</span>
      </Card>
    </template>
  </Page>
</template>

<style scoped>
.ops-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
.ops-card {
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
