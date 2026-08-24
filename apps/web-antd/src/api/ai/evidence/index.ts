import { requestClient } from '#/api/request';

export namespace AiEvidenceApi {
  export interface EvidenceItem {
    chunkId: number;
    content: string;
    documentName: string;
    versionNo?: string;
    score: number;
    channels: string[];
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
    /** 对外兼容主路由：STRUCTURED_QUERY/SCOPED_RAG/HYBRID_RAG/RULE/CLARIFY/ABSTAIN 等 */
    route?: null | string;
    /** 内部真实执行模式：STRUCTURED/EXACT_TEXT_SEARCH/PER_ENTITY_SEMANTIC/CROSS_ENTITY_COMPARE/... */
    executionMode?: null | string;
    intent?: null | string;
    reasonCode?: null | string;
    stages?: null | StageTiming[];
  }
}

/**
 * 知识搜索/证据评估统一入口。
 * 与聊天共用服务端 Query Planner → Structured/Exact/RAG/Compare → Evidence 执行内核；
 * 本接口为单轮搜索，不携带 conversation history/context。
 */
export function evaluateEvidence(data: {
  kbIds?: number[];
  query: string;
  topK?: number;
}) {
  return requestClient.post<AiEvidenceApi.EvaluateResp>(
    '/evidence/evaluate',
    data,
    {
      // 服务端 QueryPlan 默认 20s、生成管线默认 20s；给网关/序列化留出余量，禁止沿用 180s 慢请求容忍。
      timeout: 35_000,
    },
  );
}
