import { requestClient } from '#/api/request';

/** AI 成本管理 API(基于 ai_model_call_log 计量聚合) */
export namespace AiCostApi {
  /** 汇总 */
  export interface Summary {
    totalCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    successRate: number;
    avgElapsedMs: number;
    estimatedCost: number;
  }

  /** 趋势项 */
  export interface TrendItem {
    date: string;
    calls: number;
    successCalls: number;
    promptTokens: number;
    completionTokens: number;
    elapsedMs: number;
    estimatedCost: number;
  }

  /** 分组项 */
  export interface GroupItem {
    group: string;
    calls: number;
    successCalls: number;
    promptTokens: number;
    completionTokens: number;
    elapsedMs: number;
    estimatedCost: number;
  }
}

/** 成本汇总 */
export function getCostSummary(recentDays?: number) {
  return requestClient.get<AiCostApi.Summary>('/model/cost/summary', {
    params: { recentDays },
  });
}

/** 成本趋势(近 N 天) */
export function getCostTrend(days?: number) {
  return requestClient.get<AiCostApi.TrendItem[]>('/model/cost/trend', {
    params: { days },
  });
}

/** 场景分布 */
export function getCostByScenario(recentDays?: number) {
  return requestClient.get<AiCostApi.GroupItem[]>('/model/cost/by-scenario', {
    params: { recentDays },
  });
}

/** 模型分布 */
export function getCostByModel(recentDays?: number) {
  return requestClient.get<AiCostApi.GroupItem[]>('/model/cost/by-model', {
    params: { recentDays },
  });
}

/** 状态分布 */
export function getCostByStatus(recentDays?: number) {
  return requestClient.get<AiCostApi.GroupItem[]>('/model/cost/by-status', {
    params: { recentDays },
  });
}

/** 租户分摊 */
export function getCostByTenant(recentDays?: number) {
  return requestClient.get<AiCostApi.GroupItem[]>('/model/cost/by-tenant', {
    params: { recentDays },
  });
}
