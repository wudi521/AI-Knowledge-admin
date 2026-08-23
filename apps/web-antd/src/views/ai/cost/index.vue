<script lang="ts" setup>
import type { AiCostApi } from '#/api/ai/cost';

import { onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { Card, Col, Row, Segmented, Statistic, Table, Tag } from 'ant-design-vue';
import {
  getCostByModel,
  getCostByScenario,
  getCostByStatus,
  getCostSummary,
  getCostTrend,
} from '#/api/ai/cost';

const RANGES = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

const range = ref<number>(7);
const loading = ref(false);
const summary = ref<AiCostApi.Summary | null>(null);
const trend = ref<AiCostApi.TrendItem[]>([]);
const byScenario = ref<AiCostApi.GroupItem[]>([]);
const byModel = ref<AiCostApi.GroupItem[]>([]);
const byStatus = ref<AiCostApi.GroupItem[]>([]);

function fmt(n?: number | null): string {
  return n == null ? '-' : n.toLocaleString('zh-CN');
}
function fmtCost(n?: number | null): string {
  return n == null ? '-' : `¥${n.toFixed(4)}`;
}
function fmtMs(n?: number | null): string {
  if (n == null) return '-';
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  SUCCESS: { color: 'success', text: '成功' },
  FAILED: { color: 'error', text: '失败' },
  DEGRADED: { color: 'warning', text: '降级成功' },
};

const groupColumns = [
  { title: '分组', dataIndex: 'group', key: 'group', width: 180 },
  { title: '调用次数', dataIndex: 'calls', key: 'calls', width: 110 },
  { title: '成功次数', dataIndex: 'successCalls', key: 'successCalls', width: 110 },
  { title: '输入 Token', dataIndex: 'promptTokens', key: 'promptTokens', width: 120 },
  { title: '输出 Token', dataIndex: 'completionTokens', key: 'completionTokens', width: 120 },
  { title: '平均耗时', key: 'avgMs', width: 100 },
  { title: '估算成本', dataIndex: 'estimatedCost', key: 'estimatedCost', width: 110 },
];

async function load() {
  loading.value = true;
  try {
    const [s, t, sc, m, st] = await Promise.all([
      getCostSummary(range.value),
      getCostTrend(range.value),
      getCostByScenario(range.value),
      getCostByModel(range.value),
      getCostByStatus(range.value),
    ]);
    summary.value = s;
    trend.value = t;
    byScenario.value = sc;
    byModel.value = m;
    byStatus.value = st;
  } finally {
    loading.value = false;
  }
}

function onRangeChange(val: unknown) {
  range.value = Number(val);
  load();
}
function trendAvgMs(row: AiCostApi.TrendItem): number {
  return row.calls === 0 ? 0 : Math.round(row.elapsedMs / row.calls);
}
function statusText(status: string): string {
  return STATUS_TAG[status]?.text ?? status;
}

onMounted(load);
</script>

<template>
  <Page
    title="用量与成本"
    description="汇总模型网关的调用量、Token、延迟、成功率与估算成本。成本单价来自“模型网关”中的模型配置，业务代码无需维护价格。"
  >
    <div class="mb-4 flex items-center justify-between">
      <Segmented :options="RANGES" :value="range" @change="onRangeChange" />
      <Tag v-if="loading" color="processing">加载中…</Tag>
    </div>

    <Row :gutter="16" class="mb-4">
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="调用次数" :value="summary?.totalCalls ?? 0" /></Card></Col>
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="Token 总量" :value="summary?.totalTokens ?? 0" /></Card></Col>
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="成功率" :value="summary?.successRate ?? 0" :precision="1" suffix="%" /></Card></Col>
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="平均耗时" :value="summary?.avgElapsedMs ?? 0" suffix="ms" /></Card></Col>
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="估算成本" :value="summary?.estimatedCost ?? 0" :precision="4" prefix="¥" /></Card></Col>
      <Col :span="4"><Card :loading="loading" size="small"><Statistic title="输入 / 输出 Token" :value="summary?.promptTokens ?? 0" :suffix="`/ ${fmt(summary?.completionTokens)}`" /></Card></Col>
    </Row>

    <Card title="每日趋势" :loading="loading" size="small" class="mb-4">
      <Table :data-source="trend" :pagination="false" size="small" row-key="date" :scroll="{ x: 800 }">
        <Table.Column title="日期" data-index="date" :width="120" />
        <Table.Column title="调用次数" data-index="calls" :width="100" />
        <Table.Column title="成功次数" data-index="successCalls" :width="100" />
        <Table.Column title="输入 Token" data-index="promptTokens" :width="120" />
        <Table.Column title="输出 Token" data-index="completionTokens" :width="120" />
        <Table.Column title="平均耗时" :width="100"><template #default="{ record }">{{ fmtMs(trendAvgMs(record)) }}</template></Table.Column>
        <Table.Column title="估算成本" :width="110"><template #default="{ record }">{{ fmtCost(record.estimatedCost) }}</template></Table.Column>
      </Table>
    </Card>

    <Row :gutter="16">
      <Col :span="12">
        <Card title="业务场景用量" :loading="loading" size="small">
          <Table :data-source="byScenario" :columns="groupColumns" :pagination="false" size="small" row-key="group">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'avgMs'">{{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}</template>
              <template v-else-if="column.key === 'estimatedCost'">{{ fmtCost(record.estimatedCost) }}</template>
            </template>
          </Table>
        </Card>
      </Col>
      <Col :span="12">
        <Card title="模型用量" :loading="loading" size="small">
          <Table :data-source="byModel" :columns="groupColumns" :pagination="false" size="small" row-key="group">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'avgMs'">{{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}</template>
              <template v-else-if="column.key === 'estimatedCost'">{{ fmtCost(record.estimatedCost) }}</template>
            </template>
          </Table>
        </Card>
      </Col>
    </Row>

    <Card title="调用健康度" :loading="loading" size="small" class="mt-4">
      <Table :data-source="byStatus" :pagination="false" size="small" row-key="group">
        <Table.Column title="状态" :width="160"><template #default="{ record }"><Tag :color="STATUS_TAG[record.group]?.color ?? 'default'">{{ statusText(record.group) }}</Tag></template></Table.Column>
        <Table.Column title="调用次数" data-index="calls" :width="120" />
        <Table.Column title="输入 Token" data-index="promptTokens" :width="140" />
        <Table.Column title="输出 Token" data-index="completionTokens" :width="140" />
        <Table.Column title="平均耗时" :width="120"><template #default="{ record }">{{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}</template></Table.Column>
        <Table.Column title="说明">
          <template #default="{ record }">
            <span class="text-muted-foreground text-xs">
              {{ record.group === 'FAILED' ? '失败请求请结合“查询链路”和服务日志定位具体阶段' : record.group === 'DEGRADED' ? '首选模型失败后已由网关降级到备用模型' : '-' }}
            </span>
          </template>
        </Table.Column>
      </Table>
    </Card>
  </Page>
</template>
