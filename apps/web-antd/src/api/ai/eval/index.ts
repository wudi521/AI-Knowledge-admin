import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

/**
 * 评测平台 API
 *
 * 后端: yudao-module-eval (eval-server), 网关路由 /admin-api/eval/**
 * 权限: eval:case:query/create/update/delete, eval:task:run/query
 */
export namespace AiEvalApi {
  /** 评测用例(考题) */
  export interface Case {
    id: number;
    question: string;
    goldAnswer?: string; // 标准答案
    goldChunks?: number[]; // 标准证据 chunk 编号列表
    kbId?: number; // 知识库编号(空 = 全部用例池)
    category?: string; // 分类: 检索/证据/综合
    sourceFeedback?: number; // 来源反馈编号(点踩闭环生成时有值)
    createTime?: string | number; // LocalDateTime 序列化为 epoch 毫秒时间戳
  }

  /** 任务级指标快照 */
  export interface TaskMetrics {
    caseCount: number;
    passedCount: number;
    passRate: number;
    recallAt5: number;
    mrr: number;
    ndcg: number;
    faithfulness: number;
    hallucinationRate: number;
    citationAccuracy: number;
  }

  /** 失败用例明细 */
  export interface FailCase {
    caseId: number;
    failReasons?: string;
  }

  /** 评测任务 */
  export interface Task {
    id: number;
    status: 'RUNNING' | 'DONE' | 'FAILED';
    kbId?: number; // 评测知识库(空 = 全部用例)
    caseCount: number;
    model?: string;
    startTime?: string | number;
    endTime?: string | number;
    gatePass?: 0 | 1 | null; // 闸门是否通过(DONE 且全题达标为 1)
    metrics?: TaskMetrics | null; // 指标快照(DONE 且有逐题结果时有值)
    failCases?: FailCase[] | null; // 失败用例明细(全达标为空)
    createTime?: string | number;
  }

  /** 逐题结果 */
  export interface TaskResult {
    caseId: number;
    question?: string;
    answerable?: boolean;
    confidence?: number;
    recallAt5?: number;
    mrr?: number;
    ndcg?: number;
    faithfulness?: number;
    hallucinationRate?: number;
    citationAccuracy?: number;
    passed?: boolean;
    failReasons?: string;
    answer?: string;
    traceId?: string;
  }
}

/** 查询评测用例分页 */
export function getEvalCases(
  params: PageParam & { question?: string; kbId?: number; category?: string },
) {
  return requestClient.get<PageResult<AiEvalApi.Case>>('/eval/case/page', {
    params,
  });
}

/** 创建评测用例 */
export function createEvalCase(data: {
  question: string;
  goldAnswer?: string;
  goldChunks?: number[];
  kbId?: number;
  category?: string;
}) {
  return requestClient.post<number>('/eval/case/create', data);
}

/** 更新评测用例 */
export function updateEvalCase(data: {
  id: number;
  question?: string;
  goldAnswer?: string;
  goldChunks?: number[];
  kbId?: number;
  category?: string;
}) {
  return requestClient.post<boolean>('/eval/case/update', data);
}

/** 删除评测用例 */
export function deleteEvalCase(id: number) {
  return requestClient.delete<boolean>(`/eval/case/delete?id=${id}`);
}

/** 发起评测任务(异步执行, 立即返回任务编号) */
export function runEvalTask(data: { caseIds?: number[]; kbId?: number }) {
  return requestClient.post<number>('/eval/task/run', data);
}

/** 查询评测任务分页 */
export function getEvalTasks(
  params: PageParam & { status?: string; kbId?: number },
) {
  return requestClient.get<PageResult<AiEvalApi.Task>>('/eval/task/page', {
    params,
  });
}

/** 获得评测任务详情 */
export function getEvalTask(id: number) {
  return requestClient.get<AiEvalApi.Task>(`/eval/task/get?id=${id}`);
}

/** 获得评测任务逐题结果 */
export function getEvalTaskResults(taskId: number) {
  return requestClient.get<AiEvalApi.TaskResult[]>(
    `/eval/task/results?taskId=${taskId}`,
  );
}
