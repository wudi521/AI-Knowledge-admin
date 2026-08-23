import { requestClient } from '#/api/request';

/**
 * 运行观测 API
 */
export namespace OpsApi {
  /** 任务(分页行) */
  export interface Job {
    id?: number;
    documentId?: number;
    kbId?: number;
    domainCode?: string;
    jobType?: string;
    stage?: string;
    status?: string;
    retryCount?: number;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
  }

  /** 任务阶段 */
  export interface Task {
    stageCode?: string;
    handler?: string;
    status?: string;
    outputSummaryJson?: string;
    metricsJson?: string;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
  }

  /** 任务 Trace */
  export interface JobTrace {
    jobId?: number;
    documentId?: number;
    kbId?: number;
    domainCode?: string;
    status?: string;
    stage?: string;
    errorMessage?: string;
    retryCount?: number;
    startedAt?: string;
    finishedAt?: string;
    tasks?: Task[];
  }

  /** 文档链路 Trace */
  export interface DocumentTrace {
    document?: Record<string, any>;
    version?: Record<string, any>;
    jobTrace?: JobTrace | null;
    chunks?: { id?: number; chunkType?: string; chunkRole?: string; status?: string; metadata?: any; content?: string }[];
  }

  /** 查询 Trace */
  export interface QueryTrace {
    traceId?: string;
    query?: string;
    route?: string;
    intent?: string;
    domainCode?: string;
    variantCount?: number;
    bm25Hits?: number;
    vectorHits?: number;
    fused?: number;
    resultCount?: number;
    elapsedMs?: number;
    blocked?: boolean;
    stages?: Task[];
  }
}

/** 文档链路 Trace */
export function getDocumentTrace(documentId: number) {
  return requestClient.get<OpsApi.DocumentTrace>('/knowledge/ops/document-trace', { params: { documentId } });
}

/** 查询链路 Trace */
export function getQueryTrace(traceId: string) {
  return requestClient.get<OpsApi.QueryTrace>('/retrieval/ops/query-trace', { params: { traceId } });
}

/** 任务中心分页 */
export function getOpsJobs(params: { status?: string; stage?: string; pageNo: number; pageSize: number }) {
  return requestClient.get<{ list: OpsApi.Job[]; total: number }>('/ingestion/ops/jobs', { params });
}

/** 任务详情(阶段时间轴) */
export function getOpsJobDetail(jobId: number) {
  return requestClient.get<OpsApi.JobTrace>('/ingestion/ops/job-detail', { params: { jobId } });
}

/** 失败文档重新执行完整入库流程(解析/切分/向量化/后续审核)。 */
export function retryOpsIngest(documentId: number) {
  return requestClient.post<boolean>('/ingestion/ops/retry-ingest', undefined, {
    params: { documentId },
  });
}
