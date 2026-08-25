<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Tag,
  Timeline,
  message,
} from 'ant-design-vue';
import { getQueryTrace, type OpsApi } from '#/api/ai/ops';

const route = useRoute();
const traceId = ref<string>(String(route.query.traceId || ''));
const loading = ref(false);
const trace = ref<OpsApi.QueryTrace | null>(null);
const queried = ref(false);

const STAGE_TEXT: Record<string, string> = {
  ANALYZE: '理解问题',
  REWRITE: '查询改写',
  SCOPE_FILTER: '范围过滤',
  BM25: '关键词检索',
  VECTOR: '语义检索',
  FUSION: '结果融合',
  RERANK: '相关性重排',
  EVIDENCE: '证据构建',
  GENERATE: '生成回答',
  VERIFY: '答案验证',
};

const ROUTE_TEXT: Record<string, string> = {
  EXACT_METADATA: '结构化信息直查',
  EXACT_CLAIM: '精确权利要求查询',
  SCOPED_RAG: '指定文档检索问答',
  HYBRID_RAG: '混合检索问答',
  SCOPE_FILTER_HYBRID_RAG: '范围过滤后混合检索',
  ABSTAIN: '拒绝作答',
};

function stageText(stage?: string) {
  return stage ? STAGE_TEXT[stage] || stage : '-';
}
function routeText(value?: string) {
  return value ? ROUTE_TEXT[value] || value : '-';
}

async function query() {
  if (!traceId.value.trim()) {
    message.warning('请从一次问答/调试结果进入，或输入 Trace ID');
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
    queried.value = true;
  }
}

function fmtTime(t?: string): string {
  return t ? String(t).replace('T', ' ').substring(0, 19) : '-';
}

onMounted(() => {
  if (traceId.value) query();
});
</script>

<template>
  <Page
    auto-content-height
    title="查询链路"
    description="查看一次问答实际走过的路由、检索和证据阶段。优先从问答调试或知识问答工作台直接进入。"
  >
    <div class="ops-toolbar">
      <Input
        v-model:value="traceId"
        placeholder="Trace ID（高级排障时手动输入）"
        style="width: 360px"
        @press-enter="query"
      />
      <Button type="primary" :loading="loading" @click="query"
        >查看执行详情</Button
      >
    </div>

    <template v-if="trace?.traceId">
      <Descriptions
        title="本次问答"
        bordered
        size="small"
        class="ops-card"
        :column="3"
      >
        <Descriptions.Item label="问题" :span="3">{{
          trace.query
        }}</Descriptions.Item>
        <Descriptions.Item label="执行策略">{{
          routeText(trace.route)
        }}</Descriptions.Item>
        <Descriptions.Item label="意图">{{
          trace.intent || '-'
        }}</Descriptions.Item>
        <Descriptions.Item label="领域">{{
          trace.domainCode === 'PATENT' ? '专利' : trace.domainCode || '通用'
        }}</Descriptions.Item>
        <Descriptions.Item label="关键词召回">{{
          trace.bm25Hits ?? 0
        }}</Descriptions.Item>
        <Descriptions.Item label="语义召回">{{
          trace.vectorHits ?? 0
        }}</Descriptions.Item>
        <Descriptions.Item label="最终证据">{{
          trace.resultCount ?? 0
        }}</Descriptions.Item>
        <Descriptions.Item label="总耗时">{{
          trace.elapsedMs != null ? `${trace.elapsedMs} ms` : '-'
        }}</Descriptions.Item>
        <Descriptions.Item label="是否阻断">
          <Tag :color="trace.blocked ? 'red' : 'green'">{{
            trace.blocked ? '已阻断' : '正常'
          }}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Trace ID"
          ><span class="font-mono text-xs">{{
            trace.traceId
          }}</span></Descriptions.Item
        >
      </Descriptions>

      <Card title="执行过程" size="small" class="ops-card">
        <Timeline v-if="trace.stages && trace.stages.length">
          <Timeline.Item
            v-for="(s, i) in trace.stages"
            :key="i"
            :color="
              s.status === 'SUCCEEDED'
                ? 'green'
                : s.status === 'FAILED'
                  ? 'red'
                  : 'blue'
            "
          >
            <div class="ops-stage">
              <b>{{ stageText(s.stageCode) }}</b>
              <span class="ops-stage-meta">
                {{ s.status || '' }} · {{ fmtTime(s.startedAt) }} ~
                {{ fmtTime(s.finishedAt) }}
              </span>
              <div v-if="s.errorMessage" class="ops-error">
                {{ s.errorMessage }}
              </div>
              <details v-if="s.metricsJson" class="ops-stage-meta mt-1">
                <summary>技术指标</summary>
                {{ s.metricsJson }}
              </details>
            </div>
          </Timeline.Item>
        </Timeline>
        <span v-else>暂无阶段记录</span>
      </Card>
    </template>
    <Empty v-else-if="queried && !loading" description="未找到该查询链路" />
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
