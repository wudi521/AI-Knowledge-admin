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
    analysis?: Analysis;
    channels?: ChannelStat;
    results: ResultItem[];
  }
}

/** 检索(混合检索 + 重排 + 权限过滤) */
export function searchRetrieval(data: {
  query: string;
  kbIds?: number[];
  topK?: number;
}) {
  return requestClient.post<AiRetrievalApi.SearchResp>('/retrieval/search', data);
}
