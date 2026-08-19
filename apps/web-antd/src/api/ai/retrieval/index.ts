import { requestClient } from '#/api/request';

export namespace AiRetrievalApi {
  export interface Analysis {
    intent?: string;
    entities?: string[];
    rewrites?: string[];
    subQuestions?: string[];
    success: boolean;
  }
  export interface ChannelStat {
    bm25?: number;
    vector?: number;
    fused?: number;
  }
  export interface ResultItem {
    chunkId: number;
    content?: string;
    documentId?: number;
    documentName?: string;
    versionNo?: string;
    rrfScore?: number;
    rerankScore?: number;
    channels?: string[];
  }
  export interface SearchResp {
    query: string;
    /** 知识库意图匹配结果: 动态意图名称, 或 OUT_OF_SCOPE=超出知识库范围 */
    intent?: string;
    analysis?: Analysis;
    channels?: ChannelStat;
    answer?: string;
    answerBlocked?: boolean;
    answerReason?: string;
    results: ResultItem[];
  }
}

/** 检索(混合检索 + 重排 + 权限过滤; 链路含 LLM 查询分析/重排/总结, CPU 推理可达 30~90s, 默认 30s 会超时) */
export function searchRetrieval(data: {
  kbIds?: number[];
  query: string;
  topK?: number;
}) {
  return requestClient.post<AiRetrievalApi.SearchResp>('/retrieval/search', data, {
    timeout: 180_000,
  });
}
