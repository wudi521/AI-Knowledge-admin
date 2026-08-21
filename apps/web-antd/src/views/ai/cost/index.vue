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

/** 近 N 天口径 */
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

/** 格式化 */
function fmt(n?: number | null): string {
  if (n == null) return '-';
  return n.toLocaleString('zh-CN');
}

function fmtCost(n?: number | null): string {
  if (n == null) return '-';
  return `¥${n.toFixed(4)}`;
}

function fmtMs(n?: number | null): string {
  if (n == null) return '-';
  if (n < 1000) return `${n} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  SUCCESS: { color: 'success', text: '成功' },
  FAILED: { color: 'error', text: '失败' },
  DEGRADED: { color: 'warning', text: '降级' },
};

/** 分组表格列 */
const groupColumns = [
  { title: '分组', dataIndex: 'group', key: 'group', width: 180 },
  { title: '调用次数', dataIndex: 'calls', key: 'calls', width: 110 },
  { title: '成功次数', dataIndex: 'successCalls', key: 'successCalls', width: 110 },
  { title: '输入 token', dataIndex: 'promptTokens', key: 'promptTokens', width: 120 },
  { title: '输出 token', dataIndex: 'completionTokens', key: 'completionTokens', width: 120 },
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

/** 趋势行: 平均耗时 */
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
    title="AI 成本管理"
    description="基于模型网关计量(ai_model_call_log)的调用量/token/成本聚合; 成本按 yaml 单价估算, 未配置单价模型仅统计 token"
  >
    <div class="mb-4 flex items-center justify-between">
      <Segmented
        :options="RANGES"
        :value="range"
        @change="onRangeChange"
      />
      <Tag v-if="loading" color="processing">加载中…</Tag>
    </div>

    <!-- 汇总卡片 -->
    <Row :gutter="16" class="mb-4">
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic title="总调用次数" :value="summary?.totalCalls ?? 0" />
        </Card>
      </Col>
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic title="总 token" :value="summary?.totalTokens ?? 0" />
        </Card>
      </Col>
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic
            title="成功率"
            :value="summary?.successRate ?? 0"
            :precision="1"
            suffix="%"
          />
        </Card>
      </Col>
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic
            title="平均耗时"
            :value="summary?.avgElapsedMs ?? 0"
            suffix="ms"
          />
        </Card>
      </Col>
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic
            title="估算成本"
            :value="summary?.estimatedCost ?? 0"
            :precision="4"
            prefix="¥"
          />
        </Card>
      </Col>
      <Col :span="4">
        <Card :loading="loading" size="small">
          <Statistic
            title="输入/输出 token"
            :value="summary?.promptTokens ?? 0"
            :suffix="`/ ${fmt(summary?.completionTokens)}`"
          />
        </Card>
      </Col>
    </Row>

    <!-- 每日趋势 -->
    <Card title="每日趋势" :loading="loading" size="small" class="mb-4">
      <Table
        :data-source="trend"
        :pagination="false"
        size="small"
        row-key="date"
        :scroll="{ x: 800 }"
      >
        <Table.Column title="日期" data-index="date" :width="120" />
        <Table.Column title="调用次数" data-index="calls" :width="100" />
        <Table.Column title="成功次数" data-index="successCalls" :width="100" />
        <Table.Column title="输入 token" data-index="promptTokens" :width="120" />
        <Table.Column title="输出 token" data-index="completionTokens" :width="120" />
        <Table.Column title="平均耗时" :width="100">
          <template #default="{ record }">
            {{ fmtMs(trendAvgMs(record)) }}
          </template>
        </Table.Column>
        <Table.Column title="估算成本" :width="110">
          <template #default="{ record }">
            {{ fmtCost(record.estimatedCost) }}
          </template>
        </Table.Column>
      </Table>
    </Card>

    <!-- 分摊 -->
    <Row :gutter="16">
      <Col :span="12">
        <Card title="场景分布" :loading="loading" size="small">
          <Table
            :data-source="byScenario"
            :columns="groupColumns"
            :pagination="false"
            size="small"
            row-key="group"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'avgMs'">
                {{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}
              </template>
              <template v-else-if="column.key === 'estimatedCost'">
                {{ fmtCost(record.estimatedCost) }}
              </template>
            </template>
          </Table>
        </Card>
      </Col>
      <Col :span="12">
        <Card title="模型分布" :loading="loading" size="small">
          <Table
            :data-source="byModel"
            :columns="groupColumns"
            :pagination="false"
            size="small"
            row-key="group"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'avgMs'">
                {{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}
              </template>
              <template v-else-if="column.key === 'estimatedCost'">
                {{ fmtCost(record.estimatedCost) }}
              </template>
            </template>
          </Table>
        </Card>
      </Col>
    </Row>

    <!-- 状态分布 -->
    <Card title="状态分布" :loading="loading" size="small" class="mt-4">
      <Table
        :data-source="byStatus"
        :pagination="false"
        size="small"
        row-key="group"
      >
        <Table.Column title="状态" :width="160">
          <template #default="{ record }">
            <Tag :color="STATUS_TAG[record.group]?.color ?? 'default'">
              {{ statusText(record.group) }}
            </Tag>
          </template>
        </Table.Column>
        <Table.Column title="调用次数" data-index="calls" :width="120" />
        <Table.Column title="输入 token" data-index="promptTokens" :width="140" />
        <Table.Column title="输出 token" data-index="completionTokens" :width="140" />
        <Table.Column title="平均耗时" :width="120">
          <template #default="{ record }">
            {{ fmtMs(record.calls ? Math.round(record.elapsedMs / record.calls) : 0) }}
          </template>
        </Table.Column>
        <Table.Column title="失败原因示例" key="errorSample">
          <template #default="{ record }">
            <span class="text-muted-foreground text-xs">
              {{ record.group === 'FAILED' ? '见 ai_model_call_log.error_msg' : '-' }}
            </span>
          </template>
        </Table.Column>
      </Table>
    </Card>
  </Page>
</template>
