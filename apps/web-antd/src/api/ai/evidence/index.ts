import { requestClient } from '#/api/request';

export namespace AiEvidenceApi {
  export type EvaluateMode = 'AGENT_V1' | 'DEFAULT' | 'V3';

  export interface EvidenceItem {
    evidenceId?: null | number;
    chunkId?: null | number;
    content: string;
    documentName?: null | string;
    documentId?: null | number;
    versionNo?: null | string;
    score?: null | number;
    channels?: null | string[];
    evidenceType?: null | string;
    applicationNo?: null | string;
    publicationNo?: null | string;
    sectionType?: null | string;
    sectionTitle?: null | string;
    claimNo?: null | string;
    filters?: null | string;
    metric?: null | string;
    aggregateValue?: null | number;
  }
  export interface ConflictItem {
    evidenceIndexA: number;
    evidenceIndexB: number;
    reason: string;
  }
  export interface ClaimItem {
    text: string;
    verdict: 'SUPPORTED' | 'UNSUPPORTED';
    evidenceIndex: number;
  }
  export interface AnalysisInfo {
    intent?: null | string;
    entities?: string[];
    rewrites?: string[];
    route?: null | string;
    subQuestions?: string[];
    success?: boolean | null;
  }
  export interface ChannelStat {
    bm25?: null | number;
    vector?: null | number;
    fused?: null | number;
  }
  export interface StageTiming {
    elapsedMs?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    inputSummary?: null | string;
    outputSummary?: null | string;
    seq?: null | number;
    skipped?: boolean | null;
    stage?: null | string;
    status?: null | string;
  }
  export interface StructuredResult {
    entityIds?: null | number[];
    entityKeys?: null | string[];
    entityType?: null | string;
    metricCode?: null | string;
    fieldCode?: null | string;
    operation?: null | string;
    queryType?: null | string;
    scopeType?: null | string;
    truncated?: boolean | null;
    entityCount?: null | number;
  }
  export interface EvaluateResp {
    traceId: string;
    query: string;
    answerable: boolean;
    confidence: null | number;
    consultable: boolean | null;
    refusalReason: null | string;
    evidence: EvidenceItem[];
    conflicts: ConflictItem[];
    answer: null | string;
    claims: ClaimItem[] | null;
    claimFail: boolean | null;
    elapsedMs: null | number;
    analysis?: null | AnalysisInfo;
    channels?: null | ChannelStat;
    route?: null | string;
    executionMode?: null | string;
    intent?: null | string;
    reasonCode?: null | string;
    stages?: null | StageTiming[];
    structuredResult?: null | StructuredResult;
    clarifyQuestion?: null | string;
    timedOut?: boolean | null;
    verificationDegraded?: boolean | null;
  }

  export interface EvaluateReq {
    kbIds?: number[];
    query: string;
    topK?: number;
  }
}

const EVALUATE_TIMEOUT = 35_000;

/** 默认路由：按服务端 yudao.evidence.agent.mode 决定 Agent/V3/fallback。 */
export function evaluateEvidence(data: AiEvidenceApi.EvaluateReq) {
  return requestClient.post<AiEvidenceApi.EvaluateResp>(
    '/evidence/evaluate',
    data,
    { timeout: EVALUATE_TIMEOUT },
  );
}

/** 强制 Agentic RAG V1.1，用于回归/A-B，不受默认路由模式影响。 */
export function evaluateEvidenceAgentV1(data: AiEvidenceApi.EvaluateReq) {
  return requestClient.post<AiEvidenceApi.EvaluateResp>(
    '/evidence/evaluate-agent-v1',
    data,
    { timeout: EVALUATE_TIMEOUT },
  );
}

/** 强制旧 Query Engine V3，用于与 Agent V1.1 做同题基线对照。 */
export function evaluateEvidenceV3(data: AiEvidenceApi.EvaluateReq) {
  return requestClient.post<AiEvidenceApi.EvaluateResp>(
    '/evidence/evaluate-v3',
    data,
    { timeout: EVALUATE_TIMEOUT },
  );
}

/** 按 traceId 从持久化 ai_query_trace_stage 读取事后执行回放。 */
export function getAgentTrace(traceId: string) {
  return requestClient.get<AiEvidenceApi.StageTiming[]>(
    `/evidence/agent-trace/${encodeURIComponent(traceId)}`,
  );
}
