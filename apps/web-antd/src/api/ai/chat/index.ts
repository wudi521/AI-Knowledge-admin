import { requestClient } from '#/api/request';

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
    traceId?: string; // 证据链路追踪号(AI 消息)
    createTime?: number | string;
  }

  /** 发送消息响应 */
  export interface SendResp {
    conversationId: number; // 会话编号(新建会话时为新建会话 id)
    reply?: null | string; // AI 回复内容(answerable=true 时有值)
    answerable?: boolean; // 是否可作答
    confidence?: null | number; // 证据充分度融合置信度(0~1)
    citations?: null | number[]; // 引用证据 chunkId 列表
    traceId?: null | string; // 证据评估链路追踪号(ev- 前缀)
    transferRequired?: boolean; // 是否需转人工
    transferReason?: null | string; // 转人工原因(transferRequired=true 时填充)
    summary?: null | string; // 会话摘要(转人工时填充, 已落库 SYSTEM 消息)
  }
}

/** 发送对话消息(LLM 链路 10~60s, 超时放宽到 180s) */
export function sendChatMessage(data: {
  channel?: string;
  conversationId?: number;
  customerId?: string;
  message: string;
}) {
  return requestClient.post<AiChatApi.SendResp>('/chat/chat/send', data, {
    // LLM 检索+回答链路实测 10~60s, 默认 30s 会超时
    timeout: 180_000,
  });
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

/** 会话分页列表 */
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

/**
 * 创建反馈(点赞/点踩; 点踩自动生成评测考题闭环)
 * 权限: chat:chat:send
 */
export function createFeedback(data: {
  messageId: number;
  type: 'THUMB_UP' | 'THUMB_DOWN';
  note?: string;
}) {
  return requestClient.post<number>('/chat/feedback/create', data);
}
