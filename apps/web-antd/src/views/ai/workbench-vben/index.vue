<script lang="ts" setup>
import type { AiChatApi } from '#/api/ai/chat';

import { computed, nextTick, onMounted, ref } from 'vue';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  message,
  Progress,
  Row,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import {
  getChatConversations,
  getChatHistory,
  sendChatMessage,
  takeOverConversation,
  transferConversation,
} from '#/api/ai/chat';

// ===== 会话列表 =====
const conversations = ref<AiChatApi.Conversation[]>([]);
/** 知识库选择(专利 MVP: 必须选择一个; 单选) */
const kbOptions = ref<{ id: number; name: string; domainCode?: string }[]>([]);
const selectedKbId = ref<null | number>(null);
const kbLoading = ref(false);
const loadingList = ref(false);
const curId = ref<null | number>(null);
const curConv = computed(
  () => conversations.value.find((c) => c.id === curId.value) || null,
);

/** 状态展示映射 */
const STATUS_TEXT: Record<string, { color: string; text: string; }> = {
  ACTIVE: { text: '进行中', color: 'blue' },
  TRANSFERRED: { text: '待接管', color: 'orange' },
  CLOSED: { text: '已结束', color: 'default' },
};

/** 排序权重: TRANSFERRED 优先置顶 → ACTIVE → CLOSED */
const STATUS_ORDER: Record<string, number> = {
  TRANSFERRED: 0,
  ACTIVE: 1,
  CLOSED: 2,
};
const sortedConversations = computed(() =>
  [...conversations.value].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  ),
);

/** 会话列表 Badge(TRANSFERRED 橙色闪烁, ACTIVE 绿点, CLOSED 灰点) */
function convBadge(item: AiChatApi.Conversation): {
  color?: string;
  status: 'default' | 'processing' | 'success';
} {
  if (item.status === 'TRANSFERRED') {
    return { status: 'processing', color: 'orange' };
  }
  if (item.status === 'ACTIVE') {
    return { status: 'success' };
  }
  return { status: 'default' };
}

// ===== 消息流 =====
const msgs = ref<AiChatApi.Message[]>([]);
const loadingHistory = ref(false);

// ===== 发送 =====
const draft = ref('');
const sending = ref(false);
const lastSend = ref<AiChatApi.SendResp | null>(null);
const inputRef = ref<{ focus: () => void }>();
const chatBox = ref<HTMLElement>();

/** 本地临时消息 id 序列(避免 -Date.now() 同毫秒碰撞) */
let localSeq = 0;
function localId(): number {
  return -(++localSeq);
}

// ===== 转人工 / 接管 =====
const transferring = ref(false);
const takingOver = ref(false);

/** 交接摘要卡片是否展示(TRANSFERRED 或 summary 非空) */
const showSummaryCard = computed(
  () =>
    !!curConv.value &&
    (curConv.value.status === 'TRANSFERRED' || !!curConv.value.summary),
);

/** 证据面板是否展示(最近一次 send 有 answerable 判定) */
const evidenceVisible = computed(
  () => !!lastSend.value && lastSend.value.answerable != null,
);

// ===== 工具 =====
/** 时间格式化(后端 LocalDateTime 序列化为 epoch 毫秒, 兼容字符串) */
function formatTime(value?: number | string): string {
  if (value == null || value === '') return '';
  const date =
    typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function scrollBottom() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
}

/** HTML 转义(先转义再格式化, 防 XSS) */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** AI 内容渲染: 转义后把 [C{n}] 引用编号美化为角标(防 XSS) */
function renderAnswer(content?: string): string {
  const safe = escapeHtml(content || '');
  return safe.replace(
    /\[C(\d+)\]/g,
    (_m, num: string) => `<span class="wb-cite-inline">[C${num}]</span>`,
  );
}

// ===== 数据加载 =====
async function loadConversations() {
  loadingList.value = true;
  try {
    const data = await getChatConversations({ pageNo: 1, pageSize: 50 });
    conversations.value = data.list || [];
  } catch {
    message.error('会话列表加载失败');
  } finally {
    loadingList.value = false;
  }
}

async function loadHistory(conversationId: number) {
  loadingHistory.value = true;
  try {
    const data = await getChatHistory(conversationId);
    msgs.value = data.messages || [];
    // 用最新会话信息刷新列表项(状态/摘要可能已变化)
    if (data.conversation) {
      const idx = conversations.value.findIndex(
        (c) => c.id === data.conversation.id,
      );
      if (idx >= 0) {
        conversations.value[idx] = data.conversation;
      } else {
        conversations.value.unshift(data.conversation);
      }
    }
    scrollBottom();
  } catch {
    message.error('会话记录加载失败');
  } finally {
    loadingHistory.value = false;
  }
}

async function selectConversation(conv: AiChatApi.Conversation) {
  curId.value = conv.id;
  lastSend.value = null;
  await loadHistory(conv.id);
}

/** 新建会话: 清空当前显示, conversationId=null 待发送时由后端创建 */
function newChat() {
  curId.value = null;
  msgs.value = [];
  lastSend.value = null;
  nextTick(() => inputRef.value?.focus());
}

// ===== 发送 =====
/** 加载知识库选项(单选; 仅启用中) */
async function loadKbOptions() {
  kbLoading.value = true;
  try {
    const { getKnowledgeBasePage } = await import('#/api/ai/knowledge');
    const page = await getKnowledgeBasePage({ pageNo: 1, pageSize: 100 });
    kbOptions.value = (page.list || []).map((kb: any) => ({
      id: kb.id,
      name: kb.name,
      domainCode: kb.domainCode,
    }));
  } catch {
    kbOptions.value = [];
  } finally {
    kbLoading.value = false;
  }
}

/** 解析片段元数据 JSON(来源卡片字段: applicationNo/publicationNo/sectionType/claimNo/pageStart) */
function evMeta(ev: any, key: string): any {
  if (!ev?.chunkMetadata) return null;
  try {
    const m = JSON.parse(ev.chunkMetadata);
    return m[key] ?? null;
  } catch {
    return null;
  }
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  // 专利 MVP: 必须选择知识库(未选禁止发送, 后端也会拒绝全库检索)
  if (!selectedKbId.value) {
    message.warning('请先选择要查询的知识库(专利 MVP 一次选择一个)');
    return;
  }
  sending.value = true;
  // 本地先展示客户消息(不等后端)
  msgs.value.push({
    id: localId(),
    role: 'USER',
    content: text,
    createTime: Date.now(),
  });
  draft.value = '';
  scrollBottom();
  try {
    const resp = await sendChatMessage({
      conversationId: curId.value || undefined,
      message: text,
      channel: 'WEB',
      kbIds: selectedKbId.value ? [selectedKbId.value] : undefined,
    });
    lastSend.value = resp;
    // 新建会话: 更新当前会话编号并让新会话进入列表
    if (resp.conversationId && resp.conversationId !== curId.value) {
      curId.value = resp.conversationId;
      await loadConversations();
    }
    if (resp.transferRequired) {
      // 后端已落库 SYSTEM 交接消息与 summary → 重新拉取历史
      if (resp.conversationId) {
        await loadHistory(resp.conversationId);
      } else {
        // 兜底: 本地构造 SYSTEM 交接消息
        msgs.value.push({
          id: localId(),
          role: 'SYSTEM',
          content: resp.summary || '该问题已转人工, 请人工坐席接单处理',
          createTime: Date.now(),
        });
      }
      message.warning(resp.transferReason || '该问题已转人工处理');
    } else if (resp.reply) {
      msgs.value.push({
        id: localId(),
        role: 'AI',
        content: resp.reply,
        citations: (resp.citations || []).map(String),
        evidenceList: resp.evidenceList || undefined,
        confidence: resp.confidence ?? undefined,
        traceId: resp.traceId ?? undefined,
        createTime: Date.now(),
      });
      scrollBottom();
    } else {
      msgs.value.push({
        id: localId(),
        role: 'AI',
        content: '(本次未返回回答, 请重试或转人工处理)',
        createTime: Date.now(),
      });
      scrollBottom();
    }
  } catch {
    // 请求拦截器已统一提示错误; 保留客户消息, 不阻塞输入
  } finally {
    sending.value = false;
  }
}

// ===== 转人工 / 接管 =====
async function handleTransfer() {
  if (curId.value == null || transferring.value || !curConv.value) return;
  transferring.value = true;
  try {
    await transferConversation({
      conversationId: curId.value,
      reason: '坐席手动转人工',
    });
    message.success('已转人工, 等待人工坐席接单');
    await loadConversations();
    if (curId.value != null) await loadHistory(curId.value);
  } catch {
    // 拦截器已提示
  } finally {
    transferring.value = false;
  }
}

async function handleTakeOver() {
  if (curId.value == null || takingOver.value) return;
  takingOver.value = true;
  try {
    await takeOverConversation({ conversationId: curId.value });
    message.success('接管成功, 该会话由您人工处理');
    await loadConversations();
    if (curId.value != null) await loadHistory(curId.value);
  } catch {
    // 拦截器已提示
  } finally {
    takingOver.value = false;
  }
}

onMounted(async () => {
  await loadKbOptions(); // 专利 MVP: 知识库选择器
  await loadConversations();
  // 自动选中第一个会话(TRANSFERRED 优先置顶)
  const first = sortedConversations.value[0];
  if (first) {
    await selectConversation(first);
  }
});
</script>

<template>
  <div class="workbench-vben">
    <div class="wb-page-head">
      <div>
        <h2 class="wb-page-title">AI 客服工作台</h2>
        <p class="wb-page-desc">会话接待 / 知识引用 / 人工转接 · 已接入真实 API</p>
      </div>
      <Space>
        <Select
          v-model:value="selectedKbId"
          :options="kbOptions.map((kb) => ({ label: kb.name + (kb.domainCode === 'PATENT' ? ' [专利]' : ''), value: kb.id }))"
          placeholder="选择知识库(专利问答模式)"
          style="width: 260px"
          :loading="kbLoading"
          allow-clear
        />
        <Tag color="blue">Qwen2.5-72B</Tag>
        <Button type="primary" @click="newChat">＋ 新建会话</Button>
      </Space>
    </div>

    <Row :gutter="16" class="wb-body">
      <!-- 左: 会话列表 -->
      <Col :span="5">
        <Card title="会话列表" size="small" class="wb-card wb-side-card">
          <List
            :data-source="sortedConversations"
            :loading="loadingList"
            :pagination="false"
            size="small"
            class="wb-conv-list"
          >
            <template #renderItem="{ item }">
              <List.Item
                class="wb-conv-item"
                :class="{ 'wb-conv-active': item.id === curId }"
                @click="selectConversation(item)"
              >
                <Badge v-bind="convBadge(item)" />
                <span class="wb-conv-name">
                  <span>会话 #{{ item.id }}</span>
                  <span v-if="item.customerId" class="wb-conv-cust-inline">
                    · {{ item.customerId }}
                  </span>
                </span>
                <Tag
                  :color="STATUS_TEXT[item.status]?.color || 'default'"
                  class="wb-conv-status"
                >
                  {{ STATUS_TEXT[item.status]?.text || item.status }}
                </Tag>
                <span class="wb-conv-time">
                  {{ formatTime(item.createTime) }}
                </span>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>

      <!-- 中: 对话区 -->
      <Col :span="13">
        <Card size="small" class="wb-card wb-chat-card">
          <template #title>
            <Space>
              <Badge status="processing" color="green" />
              <span>{{ curConv ? `会话 #${curConv.id}` : '新会话' }}</span>
              <span v-if="curConv?.customerId" class="wb-chat-customer">
                {{ curConv.customerId }}
              </span>
            </Space>
          </template>

          <!-- 交接摘要卡片(TRANSFERRED 或 summary 非空) -->
          <div v-if="showSummaryCard" class="wb-summary-inline">
            <div class="wb-summary-head">
              <Badge status="warning" />
              <span class="wb-summary-title">交接摘要</span>
              <Tag
                v-if="curConv?.transferReason"
                color="red"
                class="wb-summary-tag"
              >
                {{ curConv.transferReason }}
              </Tag>
            </div>
            <div class="wb-summary-text">
              {{ curConv?.summary || '该会话已转人工, 请人工坐席接单处理' }}
            </div>
          </div>

          <div ref="chatBox" class="wb-msgs">
            <div
              v-for="(m, i) in msgs"
              :key="i"
              class="wb-msg"
              :class="m.role.toLowerCase()"
            >
              <!-- SYSTEM: 居中灰条交接消息 -->
              <div v-if="m.role === 'SYSTEM'" class="wb-msg-system">
                <Tag color="red" class="wb-system-tag">转人工交接</Tag>
                <span class="wb-system-text">{{ m.content }}</span>
                <span class="wb-system-time">
                  {{ formatTime(m.createTime) }}
                </span>
              </div>

              <!-- USER / AI 气泡 -->
              <template v-else>
                <div class="wb-avatar-wrap" :class="m.role.toLowerCase()">
                  <Avatar
                    :size="40"
                    class="wb-avatar" :class="[m.role.toLowerCase()]"
                  >
                    <template #icon>
                      <span class="wb-avatar-txt">
                        {{ m.role === 'AI' ? 'AI' : '客' }}
                      </span>
                    </template>
                  </Avatar>
                  <span
                    class="wb-avatar-dot"
                    :class="m.role.toLowerCase()"
                  ></span>
                </div>

                <div class="wb-msg-main">
                  <div class="wb-msg-head">
                    <span class="wb-msg-name">
                      {{ m.role === 'AI' ? '客服助手' : '访客' }}
                    </span>
                    <span class="wb-msg-time">
                      {{ formatTime(m.createTime) }}
                    </span>
                  </div>
                  <div
                    class="wb-msg-bubble"
                    :class="m.role.toLowerCase()"
                  >
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div v-if="m.role === 'AI'" v-html="renderAnswer(m.content)" class="wb-msg-text"></div>
                    <div v-else class="wb-msg-text">{{ m.content }}</div>
                    <div
                      v-if="
                        m.role === 'AI' &&
                        m.citations &&
                        m.citations.length
                      "
                      class="wb-msg-cites"
                    >
                      <div class="wb-cites-title">⌁ 引用证据</div>
                      <div class="wb-cites-list">
                        <span
                          v-for="(c, idx) in m.citations"
                          :key="idx"
                          class="wb-cite-tag"
                          :title="c"
                        >
                          [C{{ idx + 1 }}]
                        </span>
                      </div>
                    </div>
                    <!-- 专利来源卡片 -->
                    <div v-if="m.evidenceList && m.evidenceList.length" class="wb-ev-cards">
                      <div v-for="(ev, ei) in m.evidenceList" :key="ei" class="wb-ev-card">
                        <div class="wb-ev-card-title">
                          {{ ev.documentName || ('依据 ' + (ei + 1)) }}
                          <span v-if="ev.versionNo" class="wb-ev-card-ver">v{{ ev.versionNo }}</span>
                        </div>
                        <div class="wb-ev-card-meta">
                          <span v-if="evMeta(ev, 'publicationNo')">公布号：{{ evMeta(ev, 'publicationNo') }}</span>
                          <span v-if="evMeta(ev, 'applicationNo')">申请号：{{ evMeta(ev, 'applicationNo') }}</span>
                          <span v-if="evMeta(ev, 'sectionTitle')">章节：{{ evMeta(ev, 'sectionTitle') }}</span>
                          <span v-if="evMeta(ev, 'claimNo')">权利要求：{{ evMeta(ev, 'claimNo') }}</span>
                          <span v-if="evMeta(ev, 'pageStart') > 0">页码：第 {{ evMeta(ev, 'pageStart') }} 页</span>
                        </div>
                        <div v-if="ev.content" class="wb-ev-card-quote">“{{ ev.content }}”</div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- AI 思考中占位 -->
            <div v-if="sending" class="wb-msg">
              <div class="wb-avatar-wrap ai">
                <Avatar :size="40" class="wb-avatar ai">
                  <template #icon>
                    <span class="wb-avatar-txt">AI</span>
                  </template>
                </Avatar>
                <span class="wb-avatar-dot ai"></span>
              </div>
              <div class="wb-msg-main">
                <div class="wb-msg-head">
                  <span class="wb-msg-name">客服助手</span>
                </div>
                <div class="wb-msg-bubble ai wb-typing-bubble">
                  <span class="wb-typing-dot"></span>
                  <span class="wb-typing-dot"></span>
                  <span class="wb-typing-dot"></span>
                  <span class="wb-typing-text">AI 思考中(10~60 秒)…</span>
                </div>
              </div>
            </div>

            <Empty
              v-if="!msgs.length && !loadingHistory && !sending"
              description="暂无消息"
            />
          </div>

          <div class="wb-input-area">
            <Input.TextArea
              ref="inputRef"
              v-model:value="draft"
              :rows="3"
              placeholder="输入客户问题, Enter 发送…"
              @press-enter.prevent="send"
            />
            <div class="wb-input-foot">
              <span class="wb-kb-hint">
                {{
                  sending
                    ? 'AI 思考中(10~60 秒)…'
                    : 'Enter 发送 · 回复基于知识库检索'
                }}
              </span>
              <Space>
                <Button
                  v-if="curConv && curConv.status === 'TRANSFERRED'"
                  :loading="takingOver"
                  @click="handleTakeOver"
                  v-access:code="['chat:conversation:take-over']"
                >
                  接管会话
                </Button>
                <Button
                  :disabled="!curConv || curConv.status !== 'ACTIVE'"
                  :loading="transferring"
                  danger
                  @click="handleTransfer"
                  v-access:code="['chat:conversation:transfer']"
                >
                  转人工
                </Button>
                <Button
                  type="primary"
                  :loading="sending"
                  @click="send"
                  v-access:code="['chat:chat:send']"
                >
                  发送
                </Button>
              </Space>
            </div>
          </div>
        </Card>
      </Col>

      <!-- 右: 信息面板 -->
      <Col :span="6">
        <Card
          v-if="evidenceVisible"
          title="AI 建议 / 证据面板"
          size="small"
          class="wb-card"
          style="margin-bottom: 16px"
        >
          <div class="wb-evidence">
            <div class="wb-ev-row">
              <span class="wb-ev-label">充分性</span>
              <Tag :color="lastSend?.answerable ? 'green' : 'red'">
                {{ lastSend?.answerable ? '可作答' : '已转人工' }}
              </Tag>
              <Tag v-if="lastSend?.transferRequired" color="red">转人工</Tag>
            </div>
            <div v-if="lastSend?.confidence != null" class="wb-ev-row">
              <span class="wb-ev-label">置信度</span>
              <span class="wb-ev-conf">
                {{ Math.round(lastSend.confidence * 100) }}%
              </span>
              <Progress
                class="wb-ev-progress"
                :percent="
                  Math.min(
                    100,
                    Math.max(0, Math.round(lastSend.confidence * 100)),
                  )
                "
                size="small"
                :status="lastSend?.answerable ? 'normal' : 'exception'"
              />
            </div>
            <div v-if="lastSend?.transferReason" class="wb-ev-row">
              <span class="wb-ev-label">转人工原因</span>
              <span class="wb-ev-value">{{ lastSend.transferReason }}</span>
            </div>
            <div class="wb-ev-row">
              <span class="wb-ev-label">引用数量</span>
              <span class="wb-ev-value">
                {{ lastSend?.citations?.length ?? 0 }} 条
              </span>
            </div>
            <div v-if="lastSend?.traceId" class="wb-ev-row">
              <span class="wb-ev-label">追踪号</span>
              <span class="wb-ev-value mono">{{ lastSend.traceId }}</span>
            </div>
          </div>
        </Card>

        <Card title="会话信息" size="small" class="wb-card" style="margin-bottom: 16px">
          <div class="wb-kv">
            <div>
              <span>状态</span>
              <b>
                {{
                  curConv
                    ? STATUS_TEXT[curConv.status]?.text || curConv.status
                    : '-'
                }}
              </b>
            </div>
            <div><span>渠道</span><b>{{ curConv?.channel || '-' }}</b></div>
            <div><span>客户</span><b>{{ curConv?.customerId || '-' }}</b></div>
            <div>
              <span>意图</span><b class="kv-warn">{{ curConv?.intent || '-' }}</b>
            </div>
            <div>
              <span>客服</span><b>{{ curConv?.operatorId ?? '-' }}</b>
            </div>
            <div>
              <span>创建时间</span>
              <b class="mono">{{ formatTime(curConv?.createTime) || '-' }}</b>
            </div>
          </div>
        </Card>

        <Card title="快捷指令" size="small" class="wb-card">
          <div
            v-for="q in ['查询最新订单状态', '申请售后并说明流程', '查询退换货政策']"
            :key="q"
            class="wb-quick"
            @click="draft = q"
          >
            {{ q }}
          </div>
        </Card>
      </Col>
    </Row>
  </div>
</template>

<style scoped>
/* ===== 基础 ===== */
.workbench-vben {
  padding: 8px 2px;
  color: #1f2937;
}
html.dark .workbench-vben {
  color: #e5e7eb;
}
.mono {
  font-family: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
}
.wb-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.wb-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: #111827;
}
html.dark .wb-page-title {
  color: #f3f4f6;
}
.wb-page-desc {
  color: #8a94a6;
  font-size: 12.5px;
  margin: 4px 0 0;
}
html.dark .wb-page-desc {
  color: #6b7280;
}
.wb-body {
  min-height: calc(100vh - 180px);
}
.wb-card {
  height: 100%;
}
.wb-side-card {
  height: calc(100vh - 170px);
  overflow: hidden;
}

/* ===== 左侧会话列表 ===== */
.wb-conv-list {
  max-height: calc(100vh - 230px);
  overflow-y: auto;
}
.wb-conv-item {
  cursor: pointer;
  padding: 8px 10px !important;
  border-radius: 6px;
  transition: background 0.2s;
  gap: 8px;
}
.wb-conv-item:hover {
  background: #eff6ff;
}
html.dark .wb-conv-item:hover {
  background: #1e293b;
}
.wb-conv-active {
  background: #dbeafe !important;
}
html.dark .wb-conv-active {
  background: #1e3a8a !important;
}
.wb-conv-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: #334155;
}
html.dark .wb-conv-name {
  color: #e5e7eb;
}
.wb-conv-cust-inline {
  font-size: 10.5px;
  color: #94a3b8;
}
html.dark .wb-conv-cust-inline {
  color: #64748b;
}
.wb-conv-status {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
  flex: none;
}
.wb-conv-time {
  font-size: 11px;
  color: #94a3b8;
  flex: none;
}
html.dark .wb-conv-time {
  color: #64748b;
}

/* ===== 对话区 ===== */
.wb-chat-card :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 230px);
  padding: 12px;
}
.wb-msgs {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.wb-msg {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.wb-msg.user {
  flex-direction: row-reverse;
}

/* 交接摘要卡片(聊天区顶部) */
.wb-summary-inline {
  flex: none;
  border: 1px solid #fde68a;
  background: #fffbeb;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
}
html.dark .wb-summary-inline {
  background: #451a03;
  border-color: #92400e;
}
.wb-summary-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.wb-summary-title {
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
}
html.dark .wb-summary-title {
  color: #fbbf24;
}
.wb-summary-tag {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
}
.wb-summary-text {
  font-size: 12.5px;
  color: #78350f;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
html.dark .wb-summary-text {
  color: #fde68a;
}

/* SYSTEM 交接消息(居中灰条) */
.wb-msg.system {
  justify-content: center;
}
.wb-msg-system {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 90%;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: #475569;
}
html.dark .wb-msg-system {
  background: #1f2937;
  border-color: #374151;
  color: #9ca3af;
}
.wb-system-tag {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
  flex: none;
}
.wb-system-text {
  line-height: 1.6;
  word-break: break-word;
}
.wb-system-time {
  font-size: 10px;
  color: #94a3b8;
  flex: none;
}
html.dark .wb-system-time {
  color: #64748b;
}

/* 头像 */
.wb-avatar-wrap {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-avatar {
  border: 2px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}
.wb-avatar.ai {
  background: linear-gradient(135deg, #7c3aed, #6d28d9) !important;
  border-color: #6d28d9;
}
.wb-avatar.user {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  border-color: #ef4444;
}
.wb-avatar-txt {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}
.wb-avatar-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid #fff;
}
.wb-avatar-dot.ai {
  background: #22c55e;
}
.wb-avatar-dot.user {
  background: #f59e0b;
}

/* 消息主体 */
.wb-msg-main {
  max-width: 78%;
  display: flex;
  flex-direction: column;
}
.wb-msg.user .wb-msg-main {
  align-items: flex-end;
}
.wb-msg-head {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 4px 5px;
  display: flex;
  gap: 8px;
}
.wb-msg.user .wb-msg-head {
  flex-direction: row-reverse;
}
.wb-msg-name {
  font-weight: 600;
  color: #64748b;
}
html.dark .wb-msg-name {
  color: #94a3b8;
}
.wb-msg-time {
  font-size: 10px;
}

/* 气泡(固定色, 深浅适配) */
.wb-msg-bubble {
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.wb-msg-bubble.ai {
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  border-top-left-radius: 6px;
  color: #1f2937;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
html.dark .wb-msg-bubble.ai {
  background: #374151;
  border-color: #4b5563;
  color: #e5e7eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.wb-msg-bubble.user {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1.5px solid #1e40af;
  border-top-right-radius: 6px;
  color: #fff;
  box-shadow: 0 5px 18px rgba(37, 99, 235, 0.35);
}
html.dark .wb-msg-bubble.user {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border-color: #1e40af;
  color: #fff;
  box-shadow: 0 5px 18px rgba(37, 99, 235, 0.5);
}
.wb-msg-text {
  white-space: pre-wrap;
}

/* 内联引用角标(v-html 内容, 需 :deep) */
.wb-msg-bubble :deep(.wb-cite-inline) {
  display: inline-block;
  margin: 0 2px;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}
html.dark .wb-msg-bubble :deep(.wb-cite-inline) {
  background: rgba(96, 165, 250, 0.18);
  color: #93c5fd;
}

/* 气泡内引用 */
.wb-msg-cites {
  margin-top: 12px;
  border-top: 1px solid #d1d5db;
  padding-top: 10px;
}
html.dark .wb-msg-cites {
  border-top-color: #6b7280;
}
.wb-cites-title {
  font-size: 10px;
  color: #8a94a6;
  margin-bottom: 6px;
  letter-spacing: 1px;
}
.wb-cites-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wb-cite-tag {
  font-size: 11px;
  color: #2563eb;
  background: #dbeafe;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  padding: 3px 8px;
}
html.dark .wb-cite-tag {
  color: #93c5fd;
  background: #1e3a5f;
  border-color: #2563eb;
}

/* AI 思考中 */
.wb-typing-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  animation: wb-blink 1.2s infinite ease-in-out;
}
.wb-typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.wb-typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes wb-blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
.wb-typing-text {
  font-size: 12px;
  color: #64748b;
}
html.dark .wb-typing-text {
  color: #94a3b8;
}

/* 输入区 */
.wb-input-area {
  border-top: 1px solid #e2e8f0;
  padding-top: 10px;
}
html.dark .wb-input-area {
  border-top-color: #374151;
}
.wb-input-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.wb-kb-hint {
  font-size: 11px;
  color: #94a3b8;
}
html.dark .wb-kb-hint {
  color: #6b7280;
}

/* ===== 证据面板 ===== */
.wb-evidence {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wb-ev-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.wb-ev-label {
  flex: none;
  width: 68px;
  color: #94a3b8;
}
html.dark .wb-ev-label {
  color: #6b7280;
}
.wb-ev-conf {
  font-weight: 700;
  color: #2563eb;
  flex: none;
}
html.dark .wb-ev-conf {
  color: #60a5fa;
}
.wb-ev-progress {
  flex: 1;
  min-width: 0;
}
.wb-ev-value {
  color: #1f2937;
  line-height: 1.6;
  word-break: break-word;
}
html.dark .wb-ev-value {
  color: #e5e7eb;
}

/* ===== 会话信息 / 快捷指令 ===== */
.wb-kv {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12.5px;
}
.wb-kv div {
  display: flex;
  justify-content: space-between;
}
.wb-kv span {
  color: #94a3b8;
}
html.dark .wb-kv span {
  color: #6b7280;
}
.wb-kv b {
  color: #1f2937;
}
html.dark .wb-kv b {
  color: #e5e7eb;
}
.kv-warn {
  color: #ea580c !important;
}
.wb-chat-customer {
  font-size: 11px;
  color: #94a3b8;
}
html.dark .wb-chat-customer {
  color: #6b7280;
}
.wb-quick {
  font-size: 12.5px;
  color: #2563eb;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
html.dark .wb-quick {
  color: #60a5fa;
  border-color: #4b5563;
}
.wb-quick:hover {
  background: #eff6ff;
  border-color: #2563eb;
  border-style: solid;
}
html.dark .wb-quick:hover {
  background: #1e293b;
  border-color: #60a5fa;
}
</style>
