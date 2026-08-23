import { useAppConfig } from '@vben/hooks';
import { fetchEventSource } from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const accessStore = useAccessStore();

/**
 * AI 客服对话工作台 API
 *
 * 后端: yudao-module-chat (chat-server), 网关路由 /admin-api/chat/**
 * 权限: chat:chat:send / chat:conversation:transfer / chat:conversation:take-over / chat:conversation:query
 */
export namespace AiChatApi {
  /** 会话(客服工作台) */
  export interface Conversation {
    id: number;
    channel?: string; // 渠道, 默认 WEB
    customerId?: string; // 客户标识, 默认 anonymous
    kbId?: number | null; // 会话绑定的知识库
    domainCode?: string | null; // 会话绑定的领域
    userId?: number | null; // 会话所属用户
    status: 'ACTIVE' | 'CLOSED' | 'TRANSFERRED';
    intent?: string; // 会话意图
    summary?: string; // 会话摘要(转人工时记录)
    transferReason?: string; // 转人工原因
    operatorId?: number; // 接单客服编号(人工接单后记录)
    createTime?: number | string; // LocalDateTime 序列化为 epoch 毫秒时间戳
  }

  /** 会话消息 */
  export interface Message {
    id: number;
    role: 'AI' | 'SYSTEM' | 'USER'; // USER 客户 / AI 机器人 / SYSTEM 转人工交接摘要
    content: string;
    citations?: string[]; // 引用证据 chunkId 列表(为空返回空列表)
    intent?: string; // 意图(USER 消息识别结果)
    confidence?: number; // 置信度 0~1(AI 消息)
    traceId?: string; // 链路追踪号(AI 消息, q- 前缀)
    queryTraceId?: string; // 统一主追踪号(q- 前缀)
    route?: string; // 权威检索路由(RULE/EXACT_METADATA/EXACT_CLAIM/SCOPED_RAG/HYBRID_RAG/ABSTAIN)
    evidence?: EvidenceSummary[]; // 证据快照(历史会话刷新后仍存在)
    createTime?: number | string;
  }

  /** 统一证据 DTO(商用化: 结构化字段, 不含 vector/milvus/bm25 内部信息) */
  export interface EvidenceSummary {
    evidenceId?: number;
    chunkId?: number;
    documentId?: number;
    documentName?: string;
    versionId?: number;
    versionNo?: string;
    kbId?: number;
    domainCode?: string;
    sectionType?: string;
    sectionTitle?: string;
    claimNo?: string;
    pageStart?: number;
    pageEnd?: number;
    applicationNo?: string;
    publicationNo?: string;
    content?: string; // 引用原文
    score?: number; // 归一化置信度(0~1)
  }

  /** 发送消息响应 */
  export interface SendResp {
    conversationId: number; // 会话编号(新建会话时为新建会话 id)
    messageId?: number | null; // 本轮 AI 消息编号
    kbId?: number | null; // 实际使用的知识库
    domainCode?: string | null; // 实际使用的领域
    route?: string | null; // 路由结果(后端未提供时为空)
    intent?: string | null; // 本轮识别意图
    degraded?: boolean | null; // 是否降级(超时/验证降级)
    answer?: null | string; // AI 回答内容(answerable=true 时有值)
    answerable?: boolean; // 是否可作答
    confidence?: null | number; // 证据充分度融合置信度(0~1)
    citations?: null | number[]; // 引用证据 chunkId 列表
    evidence?: null | EvidenceSummary[]; // 证据列表(统一 Evidence DTO)
    traceId?: null | string; // 链路追踪号(q- 前缀)
    latencyMs?: null | number; // 本次请求整体耗时(ms)
    transferRequired?: boolean; // 是否需转人工
    transferReason?: null | string; // 转人工原因(transferRequired=true 时填充)
    summary?: null | string; // 会话摘要(转人工时填充, 已落库 SYSTEM 消息)
  }

  /** Query Trace 阶段(查看执行链路) */
  export interface TraceStage {
    seq?: number;
    stage?: string;
    status?: string;
    elapsedMs?: number;
    skipped?: boolean;
    errorCode?: string;
    errorMessage?: string;
    modelCallId?: string;
    inputSummary?: string;
    outputSummary?: string;
  }

  /** Query Trace 主记录 + 阶段 */
  export interface QueryTrace {
    traceId?: string;
    query?: string;
    route?: string;
    kbId?: number;
    domainCode?: string;
    conversationId?: number;
    totalMs?: number;
    status?: string;
    startedAt?: number | string;
    finishedAt?: number | string;
    stages?: TraceStage[];
  }

  /** SSE 流式对话事件(与后端 ChatStreamEvent 对齐) */
  export interface ChatStreamEvent {
    type: 'conversation' | 'stage' | 'evidence' | 'delta' | 'verification' | 'done' | 'error';
    // conversation / done
    conversationId?: number;
    queryId?: string;
    traceId?: string;
    kbId?: number;
    domainCode?: string;
    // stage
    stage?: string;
    status?: string;
    label?: string;
    elapsedMs?: number;
    inputSummary?: string;
    outputSummary?: string;
    errorCode?: string;
    modelCallId?: string;
    // evidence
    count?: number;
    items?: EvidenceSummary[];
    // delta
    content?: string;
    // verification
    verifyStatus?: string;
    repairCount?: number;
    // done
    messageId?: number;
    route?: string;
    answerable?: boolean;
    answer?: string;
    citations?: number[];
    evidence?: EvidenceSummary[];
    confidence?: number;
    latencyMs?: number;
    degraded?: boolean;
    transferRequired?: boolean;
    transferReason?: string;
    // error
    code?: string;
    message?: string;
    retryable?: boolean;
  }

  /** 回答反馈(有用/无用) */
  export interface Feedback {
    id?: number;
    messageId: number;
    conversationId?: number;
    queryTraceId?: string;
    kbId?: number;
    domainCode?: string;
    rating: 'HELPFUL' | 'NOT_HELPFUL';
    reasonCode?: string;
    comment?: string;
    route?: string;
    intent?: string;
    confidence?: number;
    latencyMs?: number;
    primaryDocumentId?: number;
    createTime?: number | string;
    updateTime?: number | string;
  }
}

/** 发送对话消息(LLM 链路 10~60s, 超时放宽到 180s) */
export function sendChatMessage(data: {
  channel?: string;
  conversationId?: number;
  customerId?: string;
  message: string;
  kbId?: number;
}) {
  return requestClient.post<AiChatApi.SendResp>('/chat/chat/send', data, {
    // LLM 检索+回答链路实测 10~60s, 默认 30s 会超时
    timeout: 180_000,
  });
}

/** 查看本次执行链路(Query Trace; P0-09, 无需用户复制 traceId) */
export function getQueryTrace(traceId: string) {
  return requestClient.get<AiChatApi.QueryTrace>(
    `/chat/ops/query-trace?traceId=${encodeURIComponent(traceId)}`,
  );
}

/** 转人工(返回会话摘要) */
export function transferConversation(data: {
  conversationId: number;
  reason?: string;
}) {
  return requestClient.post<string>('/chat/conversation/transfer', data);
}

/** 人工接管会话 */
export function takeOverConversation(data: { conversationId: number }) {
  return requestClient.post<boolean>('/chat/conversation/take-over', data);
}

/** 会话历史记录 */
export function getChatHistory(conversationId: number) {
  return requestClient.get<{
    conversation: AiChatApi.Conversation;
    messages: AiChatApi.Message[];
  }>(`/chat/conversation/history?conversationId=${conversationId}`);
}

/** 会话分页列表(全租户, 供管理端) */
export function getChatConversations(params: {
  pageNo: number;
  pageSize: number;
  status?: string;
}) {
  return requestClient.get<{ list: AiChatApi.Conversation[]; total: number }>(
    '/chat/conversation/page',
    { params },
  );
}

/** 当前用户的会话分页(用户范围隔离, 工作台使用) */
export function getMyChatConversations(params: {
  pageNo: number;
  pageSize: number;
  status?: string;
}) {
  return requestClient.get<{ list: AiChatApi.Conversation[]; total: number }>(
    '/chat/conversation/my-page',
    { params },
  );
}

/** 流式发送对话消息(SSE: conversation/stage/evidence/delta/verification/done/error) */
export function sendChatMessageStream(
  data: {
    channel?: string;
    conversationId?: number;
    customerId?: string;
    message: string;
    kbId?: number;
  },
  handlers: {
    onEvent: (event: AiChatApi.ChatStreamEvent) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
    signal?: AbortSignal;
  },
) {
  const token = accessStore.accessToken;
  return fetchEventSource(`${apiURL}/chat/chat/stream`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    openWhenHidden: true,
    body: JSON.stringify(data),
    signal: handlers.signal,
    onmessage(msg) {
      if (!msg.data) return;
      try {
        const event = JSON.parse(msg.data) as AiChatApi.ChatStreamEvent;
        handlers.onEvent(event);
      } catch {
        // 忽略无法解析的 SSE 事件
      }
    },
    onerror: (err) => {
      handlers.onError?.(err as Error);
    },
    onclose: () => {
      handlers.onClose?.();
    },
  });
}

/** 提交/更新回答反馈(Upsert; 点踩自动生成评测考题闭环) */
export function upsertFeedback(data: {
  messageId: number;
  rating: 'HELPFUL' | 'NOT_HELPFUL';
  reasonCode?: string;
  comment?: string;
}) {
  return requestClient.post<number>('/chat/feedback', data);
}

/** 查询消息的当前反馈(恢复已反馈状态) */
export function getFeedbackByMessage(messageId: number) {
  return requestClient.get<AiChatApi.Feedback | null>(`/chat/feedback/${messageId}`);
}
