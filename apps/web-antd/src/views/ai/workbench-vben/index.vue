<script lang="ts" setup>
import type { AiChatApi } from '#/api/ai/chat';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  message,
  Row,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import {
  getChatConversations,
  getChatHistory,
  sendChatMessage,
} from '#/api/ai/chat';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';

const route = useRoute();
const router = useRouter();

defineOptions({ name: 'KnowledgeQaWorkbench' });

const conversations = ref<AiChatApi.Conversation[]>([]);
const currentConversationId = ref<number>();
const messages = ref<AiChatApi.Message[]>([]);
const draft = ref('');
const sending = ref(false);
const loadingConversations = ref(false);
const loadingHistory = ref(false);
const kbLoading = ref(false);
const selectedKbId = ref<number>();
const kbOptions = ref<{ label: string; value: number; domainCode?: string }[]>([]);
const lastResult = ref<AiChatApi.SendResp>();
const chatBox = ref<HTMLElement>();

let localSequence = 0;
function localId() {
  localSequence += 1;
  return -localSequence;
}

const selectedKb = computed(() => kbOptions.value.find((kb) => kb.value === selectedKbId.value));
const currentConversation = computed(() => conversations.value.find((c) => c.id === currentConversationId.value));

function formatTime(value?: number | string): string {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scrollBottom() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
}

function evidenceMeta(ev: AiChatApi.EvidenceSummary, key: string): any {
  if (!ev.chunkMetadata) return null;
  try {
    return JSON.parse(ev.chunkMetadata)[key] ?? null;
  } catch {
    return null;
  }
}

function evidenceTitle(ev: AiChatApi.EvidenceSummary): string {
  const publicationNo = evidenceMeta(ev, 'publicationNo');
  const applicationNo = evidenceMeta(ev, 'applicationNo');
  const claimNo = evidenceMeta(ev, 'claimNo');
  const section = evidenceMeta(ev, 'sectionTitle') || evidenceMeta(ev, 'sectionType');
  const identity = publicationNo || applicationNo || ev.documentName || '来源文档';
  if (claimNo) return `${identity} · 权利要求 ${claimNo}`;
  if (section) return `${identity} · ${section}`;
  return identity;
}

async function loadKnowledgeBases() {
  kbLoading.value = true;
  try {
    const page = await getKnowledgeBasePage({ pageNo: 1, pageSize: 200 });
    kbOptions.value = (page.list || [])
      .filter((kb) => kb.id != null && kb.status !== 0)
      .map((kb) => ({
        label: `${kb.name}${kb.domainCode === 'PATENT' ? ' · 专利' : ''}`,
        value: kb.id!,
        domainCode: kb.domainCode,
      }));
    const routeKbId = Number(route.query.kbId || 0);
    if (routeKbId && kbOptions.value.some((kb) => kb.value === routeKbId)) {
      selectedKbId.value = routeKbId;
    }
  } finally {
    kbLoading.value = false;
  }
}

async function loadConversations() {
  loadingConversations.value = true;
  try {
    const page = await getChatConversations({ pageNo: 1, pageSize: 50 });
    conversations.value = page.list || [];
  } catch {
    message.error('会话列表加载失败');
  } finally {
    loadingConversations.value = false;
  }
}

async function selectConversation(item: AiChatApi.Conversation) {
  currentConversationId.value = item.id;
  lastResult.value = undefined;
  loadingHistory.value = true;
  try {
    const data = await getChatHistory(item.id);
    messages.value = data.messages || [];
    scrollBottom();
  } catch {
    message.error('会话记录加载失败');
  } finally {
    loadingHistory.value = false;
  }
}

function newConversation() {
  currentConversationId.value = undefined;
  messages.value = [];
  lastResult.value = undefined;
  draft.value = '';
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  if (!selectedKbId.value) {
    message.warning('请先选择要查询的知识库');
    return;
  }

  sending.value = true;
  messages.value.push({
    id: localId(),
    role: 'USER',
    content: text,
    createTime: Date.now(),
  });
  draft.value = '';
  scrollBottom();

  try {
    const resp = await sendChatMessage({
      conversationId: currentConversationId.value,
      message: text,
      channel: 'WEB',
      kbIds: [selectedKbId.value],
    });
    lastResult.value = resp;
    currentConversationId.value = resp.conversationId;

    const reply = resp.reply || resp.transferReason || '当前证据不足，暂时无法基于知识库给出可靠回答。';
    messages.value.push({
      id: localId(),
      role: 'AI',
      content: reply,
      citations: (resp.citations || []).map(String),
      evidenceList: resp.evidenceList || undefined,
      confidence: resp.confidence ?? undefined,
      traceId: resp.traceId ?? undefined,
      createTime: Date.now(),
    });
    await loadConversations();
    scrollBottom();
  } catch {
    // 全局请求拦截器会提示错误；用户问题仍保留在会话区便于重试。
  } finally {
    sending.value = false;
  }
}

function openTrace(traceId?: string | null) {
  if (!traceId) return;
  router.push({ path: '/kb/ops/query-trace', query: { traceId } });
}

onMounted(async () => {
  await Promise.all([loadKnowledgeBases(), loadConversations()]);
});
</script>

<template>
  <Page
    auto-content-height
    title="知识问答工作台"
    description="选择知识库后进行真实问答，查看引用证据和本次执行链路。具体模型由模型网关按场景自动选择。"
  >
    <div class="qa-workbench">
      <div class="workbench-toolbar">
        <div class="toolbar-main">
          <Select
            v-model:value="selectedKbId"
            :options="kbOptions"
            :loading="kbLoading"
            placeholder="选择知识库"
            class="kb-select"
            show-search
            option-filter-prop="label"
          />
          <Tag v-if="selectedKb?.domainCode === 'PATENT'" color="blue">专利知识问答</Tag>
          <Tag v-else-if="selectedKbId" color="default">通用知识问答</Tag>
          <span class="gateway-hint">模型由 AI 运行时自动路由</span>
        </div>
        <Button type="primary" @click="newConversation">新建会话</Button>
      </div>

      <Alert
        v-if="!selectedKbId"
        class="mb-4"
        type="info"
        show-icon
        message="先选择一个知识库。问答只使用该知识库已发布的内容，不会跨库检索。"
      />

      <Row :gutter="16" class="workbench-body">
        <Col :span="5">
          <Card title="历史会话" size="small" class="history-card h-full">
            <List :data-source="conversations" :loading="loadingConversations" size="small">
              <template #renderItem="{ item }">
                <List.Item
                  class="conversation-item cursor-pointer"
                  :class="{ 'conversation-active': item.id === currentConversationId }"
                  @click="selectConversation(item)"
                >
                  <div class="w-full">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate font-medium">会话 #{{ item.id }}</span>
                      <Tag :color="item.status === 'CLOSED' ? 'default' : 'blue'">
                        {{ item.status === 'CLOSED' ? '已结束' : '进行中' }}
                      </Tag>
                    </div>
                    <div class="mt-1 text-xs text-muted-foreground">{{ formatTime(item.createTime) }}</div>
                  </div>
                </List.Item>
              </template>
            </List>
          </Card>
        </Col>

        <Col :span="19">
          <Card size="small" class="chat-panel h-full">
            <template #title>
              <div class="chat-header">
                <Space>
                  <span class="chat-title">{{ currentConversation ? `会话 #${currentConversation.id}` : '新会话' }}</span>
                  <Tag v-if="selectedKb">{{ selectedKb.label }}</Tag>
                </Space>
                <span v-if="currentConversation" class="chat-subtitle">基于已发布知识回答</span>
              </div>
            </template>

            <div ref="chatBox" class="chat-box">
              <Empty
                v-if="messages.length === 0 && !loadingHistory"
                class="chat-empty"
                description="输入一个基于知识库的问题开始问答"
              />

              <div
                v-for="msg in messages"
                :key="msg.id"
                class="message-row"
                :class="`message-${msg.role.toLowerCase()}`"
              >
                <div class="message-role">
                  <span class="role-dot"></span>
                  {{ msg.role === 'USER' ? '你' : msg.role === 'AI' ? '知识助手' : '系统' }}
                </div>

                <div class="message-card">
                  <div class="message-content whitespace-pre-wrap">{{ msg.content }}</div>

                  <div
                    v-if="msg.role === 'AI' && msg.confidence != null"
                    class="answer-meta"
                  >
                    <span>证据置信度</span>
                    <strong>{{ Math.round(msg.confidence * 100) }}%</strong>
                  </div>

                  <div v-if="msg.evidenceList?.length" class="evidence-section">
                    <div class="evidence-heading">引用来源</div>
                    <div
                      v-for="(ev, index) in msg.evidenceList"
                      :key="ev.chunkId || index"
                      class="evidence-item"
                    >
                      <div class="evidence-topline">
                        <span class="citation-index">C{{ index + 1 }}</span>
                        <span class="evidence-title">{{ evidenceTitle(ev) }}</span>
                        <span
                          v-if="evidenceMeta(ev, 'pageStart')"
                          class="evidence-page"
                        >
                          第 {{ evidenceMeta(ev, 'pageStart') }} 页
                        </span>
                      </div>
                      <div class="evidence-content line-clamp-3">
                        {{ ev.content || '来源内容未返回' }}
                      </div>
                    </div>
                  </div>

                  <div v-if="msg.role === 'AI' && msg.traceId" class="trace-action">
                    <Button
                      type="link"
                      size="small"
                      class="!h-auto !p-0"
                      @click="openTrace(msg.traceId)"
                    >
                      查看本次执行链路 →
                    </Button>
                  </div>
                </div>
              </div>

              <div v-if="sending" class="thinking-row">
                <span class="thinking-dot"></span>
                正在检索知识并生成回答…
              </div>
            </div>

            <div class="composer">
              <Input.TextArea
                v-model:value="draft"
                :rows="3"
                :disabled="!selectedKbId || sending"
                placeholder="输入问题，例如：CN 122621758 A 一共有几项权利要求？"
                class="composer-input"
              />
              <div class="composer-footer">
                <span class="composer-hint">回答会附带可追溯证据，不满足证据门禁时不会猜测。</span>
                <Button
                  type="primary"
                  :loading="sending"
                  :disabled="!selectedKbId || !draft.trim()"
                  @click="send"
                >
                  发送
                </Button>
              </div>
            </div>

            <div
              v-if="lastResult && lastResult.answerable === false"
              class="answer-blocked-tip"
            >
              本次未满足可靠作答条件。系统不会为了“看起来有答案”而跳过证据门禁。
              <a v-if="lastResult.traceId" class="ml-1" @click="openTrace(lastResult.traceId)">查看原因</a>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  </Page>
</template>

<style scoped>
.qa-workbench {
  --qa-surface: #ffffff;
  --qa-surface-soft: #f8fafc;
  --qa-surface-raised: #ffffff;
  --qa-border: #e5e7eb;
  --qa-border-soft: #edf0f3;
  --qa-text: #111827;
  --qa-text-secondary: #667085;
  --qa-user-bg: #eef5ff;
  --qa-user-border: #d7e6ff;
  --qa-ai-bg: #ffffff;
  --qa-evidence-bg: #f8fafc;
  --qa-primary-soft: rgba(22, 119, 255, 0.08);

  color: var(--qa-text);
}

.workbench-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.toolbar-main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
}

.kb-select {
  width: min(360px, 42vw);
}

.gateway-hint,
.chat-subtitle,
.composer-hint {
  color: var(--qa-text-secondary);
  font-size: 12px;
}

.workbench-body {
  min-height: 640px;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.chat-title {
  font-weight: 600;
}

.chat-box {
  min-height: 500px;
  max-height: 61vh;
  overflow-y: auto;
  padding: 22px 18px 8px;
  scroll-behavior: smooth;
}

.chat-box::-webkit-scrollbar {
  width: 6px;
}

.chat-box::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(120, 126, 138, 0.35);
}

.chat-empty {
  padding-top: 130px;
}

.message-row {
  margin-bottom: 22px;
}

.message-role {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: var(--qa-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.role-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #94a3b8;
}

.message-ai .role-dot {
  background: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.11);
}

.message-user .message-role {
  justify-content: flex-end;
}

.message-user .role-dot {
  order: 2;
}

.message-card {
  max-width: 88%;
  border: 1px solid var(--qa-border-soft);
  border-radius: 14px;
  padding: 15px 17px;
  background: var(--qa-ai-bg);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}

.message-content {
  color: var(--qa-text);
  font-size: 14px;
  line-height: 1.8;
}

.message-user .message-card {
  margin-left: auto;
  border-color: var(--qa-user-border);
  background: var(--qa-user-bg);
}

.message-ai .message-card {
  margin-right: auto;
}

.answer-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  border-radius: 999px;
  padding: 4px 9px;
  background: var(--qa-primary-soft);
  color: var(--qa-text-secondary);
  font-size: 12px;
}

.answer-meta strong {
  color: #1677ff;
  font-weight: 600;
}

.evidence-section {
  margin-top: 15px;
  border-top: 1px solid var(--qa-border-soft);
  padding-top: 13px;
}

.evidence-heading {
  margin-bottom: 8px;
  color: var(--qa-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.evidence-item {
  margin-top: 8px;
  border: 1px solid var(--qa-border-soft);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--qa-evidence-bg);
}

.evidence-topline {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.citation-index {
  flex: none;
  border-radius: 5px;
  padding: 2px 6px;
  background: #1677ff;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
}

.evidence-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--qa-text);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-page {
  flex: none;
  color: var(--qa-text-secondary);
  font-size: 11px;
}

.evidence-content {
  margin-top: 6px;
  color: var(--qa-text-secondary);
  font-size: 12px;
  line-height: 1.65;
}

.trace-action {
  margin-top: 12px;
}

.thinking-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 20px;
  color: var(--qa-text-secondary);
  font-size: 13px;
}

.thinking-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #1677ff;
  animation: qa-pulse 1.3s ease-in-out infinite;
}

.composer {
  margin: 10px 18px 6px;
  border: 1px solid var(--qa-border);
  border-radius: 14px;
  padding: 9px;
  background: var(--qa-surface-raised);
  box-shadow: 0 4px 18px rgba(16, 24, 40, 0.05);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 3px 1px 7px;
}

.answer-blocked-tip {
  margin: 8px 18px 14px;
  color: var(--qa-text-secondary);
  font-size: 12px;
}

.conversation-item {
  margin: 2px 0;
  border-radius: 8px;
  padding: 10px !important;
  transition: background 0.15s ease;
}

.conversation-item:hover {
  background: var(--qa-surface-soft);
}

.conversation-active {
  background: var(--qa-primary-soft) !important;
}

@keyframes qa-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

/* Ant Design 内部输入框在某些主题组合下没有跟随暗色，这里只约束本工作台。 */
.qa-workbench :deep(.composer-input.ant-input) {
  border: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  color: var(--qa-text) !important;
  resize: none;
}

.qa-workbench :deep(.composer-input.ant-input::placeholder) {
  color: var(--qa-text-secondary) !important;
  opacity: 0.72;
}

/* 暗色模式：不再依赖 --ant-color-bg-container fallback，避免白色大卡片。 */
:global(.dark) .qa-workbench {
  --qa-surface: #15171a;
  --qa-surface-soft: #1d2025;
  --qa-surface-raised: #191c20;
  --qa-border: #343841;
  --qa-border-soft: #2a2e35;
  --qa-text: #e7e9ee;
  --qa-text-secondary: #9299a6;
  --qa-user-bg: #202b3c;
  --qa-user-border: #2d4160;
  --qa-ai-bg: #1a1d21;
  --qa-evidence-bg: #16191d;
  --qa-primary-soft: rgba(64, 150, 255, 0.12);
}

:global(.dark) .qa-workbench :deep(.ant-card) {
  border-color: var(--qa-border-soft);
  background: var(--qa-surface);
}

:global(.dark) .qa-workbench :deep(.ant-card-head) {
  border-bottom-color: var(--qa-border-soft);
  color: var(--qa-text);
}

:global(.dark) .qa-workbench :deep(.ant-list-item) {
  border-block-end-color: var(--qa-border-soft);
  color: var(--qa-text);
}

:global(.dark) .qa-workbench :deep(.ant-empty-description) {
  color: var(--qa-text-secondary);
}

:global(.dark) .qa-workbench :deep(.ant-select-selector),
:global(.dark) .qa-workbench :deep(.ant-input),
:global(.dark) .qa-workbench :deep(textarea.ant-input) {
  border-color: var(--qa-border) !important;
  background: var(--qa-surface-raised) !important;
  color: var(--qa-text) !important;
}

:global(.dark) .qa-workbench :deep(.composer-input.ant-input) {
  background: transparent !important;
}

:global(.dark) .qa-workbench :deep(.ant-select-selection-placeholder),
:global(.dark) .qa-workbench :deep(.ant-select-selection-item) {
  color: var(--qa-text-secondary);
}

:global(.dark) .qa-workbench :deep(.ant-btn-default) {
  border-color: var(--qa-border);
  background: var(--qa-surface-raised);
  color: var(--qa-text);
}

:global(.dark) .qa-workbench .message-card {
  box-shadow: none;
}

:global(.dark) .qa-workbench .composer {
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}

@media (max-width: 1100px) {
  .gateway-hint,
  .chat-subtitle,
  .composer-hint {
    display: none;
  }

  .message-card {
    max-width: 96%;
  }
}
</style>
