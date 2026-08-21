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
  /** 语义分析详情(检索透传, 供检索诊断) */
  export interface AnalysisInfo {
    intent?: null | string;
    entities?: string[];
    rewrites?: string[];
    subQuestions?: string[];
    success?: boolean | null;
  }
  /** 通道召回统计(检索透传) */
  export interface ChannelStat {
    bm25?: null | number;
    vector?: null | number;
    fused?: null | number;
  }
  export interface EvaluateResp {
    traceId: string;
    query: string;
    answerable: boolean;
    confidence: null | number; // 0~1
    consultable: boolean | null;
    refusalReason: null | string; // answerable=false 时必填
    evidence: EvidenceItem[]; // 去重后, 按得分降序
    conflicts: ConflictItem[]; // 索引 = evidence 列表位置
    answer: null | string; // 含 [C1] 引用; claimFail=true 时恒 null
    claims: ClaimItem[] | null;
    claimFail: boolean | null;
    elapsedMs: null | number;
    analysis?: null | AnalysisInfo; // 语义分析详情(意图/实体/改写/子问题)
    channels?: null | ChannelStat; // 通道召回统计(BM25/向量/融合)
  }
}

/** 证据评估(充分性判定 + 冲突检测 + Claim 验证 + 回答生成) */
export function evaluateEvidence(data: {
  kbIds?: number[];
  query: string;
  topK?: number;
}) {
  return requestClient.post<AiEvidenceApi.EvaluateResp>(
    '/evidence/evaluate',
    data,
    {
      // 评估链路含多次 LLM 调用(qwen3-8b CPU 推理, 实测 12~60s), 默认 30s 会超时
      timeout: 180_000,
    },
  );
}
