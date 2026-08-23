<script lang="ts" setup>
import type { AiChatApi } from '#/api/ai/chat';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Input,
  List,
  message,
  Modal,
  Row,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import {
  getChatHistory,
  getMyChatConversations,
  getQueryTrace,
  sendChatMessage,
} from '#/api/ai/chat';
import { getKnowledgeBasePage } from '#/api/ai/knowledge';

const route = useRoute();
const router = useRouter();

defineOptions({ name: 'KnowledgeQaWorkbench' });

const conversations = ref<AiChatApi.Conversation[]>([]);
const currentConversationId = ref<number>();
const activeConversation = ref<AiChatApi.Conversation>();
const messages = ref<AiChatApi.Message[]>([]);
const draft = ref('');
const sending = ref(false);
const loadingConversations = ref(false);
const loadingHistory = ref(false);
const kbLoading = ref(false);
const selectedKbId = ref<number>();
const kbOptions = ref<
  { label: string; value: number; domainCode?: string }[]
>([]);
const lastResult = ref<AiChatApi.SendResp>();
const traceDrawerOpen = ref(false);
const currentTrace = ref<AiChatApi.QueryTrace>();
const chatBox = ref<HTMLElement>();
const inputRef = ref<{ focus?: () => void }>();

let localSequence = 0;
let historyRequestSequence = 0;
let conversationListRequestSequence = 0;
let sendRequestSequence = 0;
let workspaceVersion = 0;

function localId() {
  localSequence += 1;
  return -localSequence;
}

function invalidateWorkspace() {
  workspaceVersion += 1;
  historyRequestSequence += 1;
  sendRequestSequence += 1;
  loadingHistory.value = false;
  sending.value = false;
}

function invalidatePendingSend() {
  workspaceVersion += 1;
  sendRequestSequence += 1;
  sending.value = false;
}

const selectedKb = computed(() =>
  kbOptions.value.find((kb) => kb.value === selectedKbId.value),
);
const currentConversation = computed(() =>
  activeConversation.value?.id === currentConversationId.value
    ? activeConversation.value
    : conversations.value.find((c) => c.id === currentConversationId.value),
);
const currentKnowledgeContext = computed(() => {
  if (currentConversation.value) {
    return formatKnowledgeContext(
      currentConversation.value.kbId,
      currentConversation.value.domainCode,
    );
  }
  if (selectedKbId.value != null) {
    return formatKnowledgeContext(selectedKbId.value, selectedKb.value?.domainCode);
  }
  return '';
});
const currentDomainCode = computed(
  () => currentConversation.value?.domainCode ?? selectedKb.value?.domainCode,
);
const pageHeadContext = computed(() => {
  if (currentConversation.value) {
    return currentKnowledgeContext.value;
  }
  if (selectedKbId.value == null) {
    return '';
  }
  return currentDomainCode.value === 'PATENT'
    ? '专利知识问答'
    : '通用知识问答';
});

function formatKnowledgeContext(
  kbId?: number | null,
  domainCode?: string | null,
): string {
  const kbLabel =
    kbId != null
      ? kbOptions.value.find((kb) => kb.value === kbId)?.label || `知识库 #${kbId}`
      : '未绑定知识库';
  return domainCode ? `${kbLabel} · ${domainCode}` : kbLabel;
}

function conversationContextLabel(item: AiChatApi.Conversation): string {
  return formatKnowledgeContext(item.kbId, item.domainCode);
}

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
  return (ev as any)[key] ?? null;
}

function evidenceTitle(ev: AiChatApi.EvidenceSummary): string {
  const publicationNo = ev.publicationNo;
  const applicationNo = ev.applicationNo;
  const claimNo = ev.claimNo;
  const section = ev.sectionTitle || ev.sectionType;
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
    if (
      !currentConversationId.value &&
      selectedKbId.value == null &&
      Number.isFinite(routeKbId) &&
      kbOptions.value.some((kb) => kb.value === routeKbId)
    ) {
      selectedKbId.value = routeKbId;
    }
  } finally {
    kbLoading.value = false;
  }
}

async function loadConversations(isCurrent?: () => boolean) {
  const requestId = ++conversationListRequestSequence;
  loadingConversations.value = true;
  try {
    const page = await getMyChatConversations({ pageNo: 1, pageSize: 50 });
    if (
      requestId === conversationListRequestSequence &&
      (!isCurrent || isCurrent())
    ) {
      conversations.value = page.list || [];
    }
  } catch {
    if (
      requestId === conversationListRequestSequence &&
      (!isCurrent || isCurrent())
    ) {
      message.error('会话列表加载失败');
    }
  } finally {
    if (requestId === conversationListRequestSequence) {
      loadingConversations.value = false;
    }
  }
}

async function selectConversation(item: AiChatApi.Conversation) {
  invalidateWorkspace();
  const requestId = ++historyRequestSequence;
  const requestVersion = workspaceVersion;
  loadingHistory.value = true;
  try {
    const data = await getChatHistory(item.id);
    if (
      requestId !== historyRequestSequence ||
      requestVersion !== workspaceVersion
    ) {
      return;
    }
    const conversation = {
      ...item,
      ...(data.conversation || {}),
      id: data.conversation?.id ?? item.id,
    };
    const index = conversations.value.findIndex((c) => c.id === item.id);
    if (index >= 0) conversations.value[index] = conversation;
    activeConversation.value = conversation;
    currentConversationId.value = conversation.id;
    syncConversationUrl(conversation.id);
    selectedKbId.value = conversation.kbId ?? undefined;
    lastResult.value = undefined;
    messages.value = data.messages || [];
    scrollBottom();
    nextTick(() => inputRef.value?.focus?.());
  } catch {
    if (
      requestId === historyRequestSequence &&
      requestVersion === workspaceVersion
    ) {
      message.error('会话记录加载失败');
    }
  } finally {
    if (
      requestId === historyRequestSequence &&
      requestVersion === workspaceVersion
    ) {
      loadingHistory.value = false;
    }
  }
}

function clearCurrentConversation() {
  invalidateWorkspace();
  currentConversationId.value = undefined;
  activeConversation.value = undefined;
  messages.value = [];
  lastResult.value = undefined;
  syncConversationUrl(undefined);
}

/** 把当前会话写入 URL query(RF-04: 刷新后可从 conversationId 恢复) */
function syncConversationUrl(conversationId?: number) {
  const query = { ...route.query };
  if (conversationId != null) {
    query.conversationId = String(conversationId);
  } else {
    delete query.conversationId;
  }
  router.replace({ query });
}

function handleKbChange(nextKbId: number | undefined) {
  const normalizedKbId =
    nextKbId != null && Number.isFinite(nextKbId) ? nextKbId : undefined;
  const conversationKbId = currentConversation.value?.kbId;
  const hasCurrentConversation = currentConversationId.value != null;
  // P0-10: 切换知识库不能修改当前会话, 必须先确认开始新会话
  if (hasCurrentConversation && conversationKbId !== normalizedKbId) {
    const previousKbId = selectedKbId.value;
    Modal.confirm({
      title: '切换知识库将开始新会话',
      content: '当前会话绑定的知识库不会被修改，确认后开始一个新会话。',
      onOk: () => {
        selectedKbId.value = normalizedKbId;
        clearCurrentConversation();
        invalidatePendingSend();
      },
      onCancel: () => {
        selectedKbId.value = previousKbId;
      },
    });
    return;
  }
  const kbChanged = selectedKbId.value !== normalizedKbId;
  if (kbChanged && loadingHistory.value) {
    invalidateWorkspace();
  } else if (kbChanged) {
    invalidatePendingSend();
  }
  selectedKbId.value = normalizedKbId;
}

function newConversation() {
  clearCurrentConversation();
  draft.value = '';
  nextTick(() => inputRef.value?.focus?.());
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value || loadingHistory.value) return;
  if (!currentConversationId.value && !selectedKbId.value) {
    message.warning('请先选择要查询的知识库');
    return;
  }

  const existingConversationId = currentConversationId.value;
  const previousConversation = activeConversation.value;
  const requestId = ++sendRequestSequence;
  const requestVersion = workspaceVersion;
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
    const resp = existingConversationId
      ? await sendChatMessage({
          conversationId: existingConversationId,
          message: text,
          channel: 'WEB',
        })
      : await sendChatMessage({
          kbId: selectedKbId.value!,
          message: text,
          channel: 'WEB',
        });
    if (
      requestId !== sendRequestSequence ||
      requestVersion !== workspaceVersion
    ) {
      return;
    }
    lastResult.value = resp;
    currentConversationId.value = resp.conversationId;
    syncConversationUrl(resp.conversationId);
    selectedKbId.value = resp.kbId ?? selectedKbId.value;
    activeConversation.value = {
      ...(previousConversation || {}),
      id: resp.conversationId,
      status: previousConversation?.status || 'ACTIVE',
      kbId: resp.kbId ?? previousConversation?.kbId ?? selectedKbId.value,
      domainCode:
        resp.domainCode ??
        previousConversation?.domainCode ??
        selectedKb.value?.domainCode,
    };

    const reply =
      resp.answer ||
      resp.transferReason ||
      '当前证据不足，暂时无法基于知识库给出可靠回答。';
    messages.value.push({
      id: resp.messageId ?? localId(),
      role: 'AI',
      content: reply,
      citations: (resp.citations || []).map(String),
      evidence: resp.evidence || undefined,
      confidence: resp.confidence ?? undefined,
      traceId: resp.traceId ?? undefined,
      createTime: Date.now(),
    });
    await loadConversations(() =>
      requestId === sendRequestSequence && requestVersion === workspaceVersion,
    );
    scrollBottom();
  } catch {
    // 全局请求拦截器负责提示；保留用户问题方便重试。
  } finally {
    if (
      requestId === sendRequestSequence &&
      requestVersion === workspaceVersion
    ) {
      sending.value = false;
      nextTick(() => inputRef.value?.focus?.());
    }
  }
}

async function openTrace(traceId?: string | null) {
  if (!traceId) return;
  currentTrace.value = undefined;
  traceDrawerOpen.value = true;
  try {
    currentTrace.value = await getQueryTrace(traceId);
  } catch {
    message.error('执行链路查询失败');
  }
}

onMounted(async () => {
  await Promise.all([loadKnowledgeBases(), loadConversations()]);
  // RF-04: 刷新/深链从 URL conversationId 自动恢复会话(kbId/domain/消息)
  const deepLinkId = Number(route.query.conversationId || 0);
  if (Number.isFinite(deepLinkId) && deepLinkId > 0) {
    const target = conversations.value.find((c) => c.id === deepLinkId);
    await selectConversation(target ?? ({ id: deepLinkId } as AiChatApi.Conversation));
  }
});
</script>

<template>
  <Page
    auto-content-height
    title="知识问答工作台"
    description="选择知识库后进行真实问答，查看引用证据和本次执行链路。具体模型由模型网关按场景自动选择。"
  >
    <div class="workbench-vben">
      <div class="wb-page-head">
        <div class="wb-page-head-main">
          <Select
            :value="selectedKbId"
            :options="kbOptions"
            :loading="kbLoading"
            placeholder="选择知识库"
            class="wb-kb-select"
            show-search
            option-filter-prop="label"
            @update:value="
              (value) => handleKbChange(typeof value === 'number' ? value : undefined)
            "
          />
          <Tag
            v-if="pageHeadContext"
            :color="currentDomainCode === 'PATENT' ? 'blue' : 'default'"
          >
            {{ pageHeadContext }}
          </Tag>
          <span class="wb-page-desc">模型由 AI 运行时自动路由</span>
        </div>
        <Button type="primary" @click="newConversation">＋ 新建会话</Button>
      </div>

      <Alert
        v-if="!selectedKbId && !currentConversationId"
        class="mb-4"
        type="info"
        show-icon
        message="请选择知识库后发送问题。你仍可以先输入内容，发送时系统会再次校验知识库。"
      />

      <Row :gutter="16" class="wb-body">
        <Col :span="5">
          <Card title="历史会话" size="small" class="wb-card wb-side-card">
            <List
              :data-source="conversations"
              :loading="loadingConversations"
              :pagination="false"
              size="small"
              class="wb-conv-list"
            >
              <template #renderItem="{ item }">
                <List.Item
                  class="wb-conv-item"
                  :class="{ 'wb-conv-active': item.id === currentConversationId }"
                  @click="selectConversation(item)"
                >
                  <div class="wb-conv-main">
                    <div class="wb-conv-head">
                      <span class="wb-conv-name">会话 #{{ item.id }}</span>
                      <Tag
                        :color="item.status === 'CLOSED' ? 'default' : 'blue'"
                        class="wb-conv-status"
                      >
                        {{ item.status === 'CLOSED' ? '已结束' : '进行中' }}
                      </Tag>
                    </div>
                    <span class="wb-conv-time">
                      {{ conversationContextLabel(item) }}
                    </span>
                    <span class="wb-conv-time">{{ formatTime(item.createTime) }}</span>
                  </div>
                </List.Item>
              </template>
            </List>
          </Card>
        </Col>

        <Col :span="19">
          <Card size="small" class="wb-card wb-chat-card">
            <template #title>
              <Space>
                <span class="wb-chat-title">
                  {{ currentConversation ? `会话 #${currentConversation.id}` : '新会话' }}
                </span>
                <Tag v-if="currentKnowledgeContext">{{ currentKnowledgeContext }}</Tag>
              </Space>
            </template>

            <div ref="chatBox" class="wb-msgs">
              <Empty
                v-if="messages.length === 0 && !loadingHistory && !sending"
                description="输入一个基于知识库的问题开始问答"
              />

              <div
                v-for="msg in messages"
                :key="msg.id"
                class="wb-msg"
                :class="msg.role.toLowerCase()"
              >
                <template v-if="msg.role === 'SYSTEM'">
                  <div class="wb-msg-system">{{ msg.content }}</div>
                </template>

                <template v-else>
                  <div class="wb-avatar-wrap">
                    <Avatar
                      :size="38"
                      class="wb-avatar"
                      :class="msg.role.toLowerCase()"
                    >
                      {{ msg.role === 'AI' ? 'AI' : '你' }}
                    </Avatar>
                  </div>

                  <div class="wb-msg-main">
                    <div class="wb-msg-head">
                      <span class="wb-msg-name">
                        {{ msg.role === 'AI' ? '知识助手' : '你' }}
                      </span>
                      <span class="wb-msg-time">{{ formatTime(msg.createTime) }}</span>
                    </div>

                    <div class="wb-msg-bubble" :class="msg.role.toLowerCase()">
                      <div class="wb-msg-text">{{ msg.content }}</div>

                      <div
                        v-if="msg.role === 'AI' && msg.confidence != null"
                        class="wb-answer-meta"
                      >
                        证据置信度 {{ Math.round(msg.confidence * 100) }}%
                      </div>

                      <div
                        v-if="msg.evidence?.length"
                        class="wb-ev-cards"
                      >
                        <div class="wb-ev-heading">引用来源</div>
                        <div
                          v-for="(ev, index) in msg.evidence"
                          :key="ev.chunkId || index"
                          class="wb-ev-card"
                        >
                          <div class="wb-ev-card-title">
                            <span class="wb-cite-tag">C{{ index + 1 }}</span>
                            <span class="wb-ev-title-text">{{ evidenceTitle(ev) }}</span>
                            <span
                              v-if="evidenceMeta(ev, 'pageStart')"
                              class="wb-ev-page"
                            >
                              第 {{ evidenceMeta(ev, 'pageStart') }} 页
                            </span>
                          </div>
                          <div v-if="ev.content" class="wb-ev-card-quote">
                            {{ ev.content }}
                          </div>
                        </div>
                      </div>

                      <div
                        v-if="msg.role === 'AI' && msg.traceId"
                        class="wb-trace-action"
                      >
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
                </template>
              </div>

              <div v-if="sending" class="wb-msg ai">
                <div class="wb-avatar-wrap">
                  <Avatar :size="38" class="wb-avatar ai">AI</Avatar>
                </div>
                <div class="wb-msg-main">
                  <div class="wb-msg-head">
                    <span class="wb-msg-name">知识助手</span>
                  </div>
                  <div class="wb-msg-bubble ai wb-typing-bubble">
                    <span class="wb-typing-dot"></span>
                    <span class="wb-typing-dot"></span>
                    <span class="wb-typing-dot"></span>
                    <span class="wb-typing-text">正在检索知识并生成回答…</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="wb-input-area">
              <Input.TextArea
                ref="inputRef"
                v-model:value="draft"
                :rows="3"
                :disabled="loadingHistory"
                placeholder="输入问题，例如：CN 122621758 A 一共有几项权利要求？"
                class="wb-input"
                @press-enter.prevent="send"
              />
              <div class="wb-input-foot">
                <span class="wb-kb-hint">
                  {{
                    selectedKbId
                      ? 'Enter 发送 · 回答基于当前知识库已发布内容'
                      : '可先输入问题 · 发送前请选择知识库'
                  }}
                </span>
                <Button
                  type="primary"
                  :loading="sending"
                  :disabled="
                    loadingHistory ||
                    sending ||
                    !draft.trim() ||
                    (!currentConversationId && !selectedKbId)
                  "
                  @click="send"
                >
                  发送
                </Button>
              </div>
            </div>

            <div
              v-if="lastResult && lastResult.answerable === false"
              class="wb-answer-blocked"
            >
              <template v-if="lastResult.degraded">
                本次查询超时或未能完成可靠回答，请稍后重试或调整问题。
              </template>
              <template v-else-if="lastResult.transferReason">
                {{ lastResult.transferReason }}
              </template>
              <template v-else>
                当前知识库中没有足够证据支持可靠回答。
              </template>
              <a v-if="lastResult.traceId" @click="openTrace(lastResult.traceId)">
                查看本次执行链路
              </a>
            </div>

            <Drawer
              v-model:open="traceDrawerOpen"
              title="本次执行链路"
              width="640"
            >
              <div v-if="currentTrace" class="wb-trace-detail">
                <div class="wb-trace-meta">
                  <div><b>问题：</b>{{ currentTrace.query }}</div>
                  <div>
                    <b>路由：</b>
                    <Tag>{{ currentTrace.route || '-' }}</Tag>
                    <b>状态：</b>
                    <Tag :color="currentTrace.status === 'SUCCEEDED' ? 'green' : 'orange'">
                      {{ currentTrace.status || '-' }}
                    </Tag>
                    <b>总耗时：</b>{{ currentTrace.totalMs ?? '-' }} ms
                  </div>
                </div>
                <div
                  v-for="stage in currentTrace.stages || []"
                  :key="stage.seq"
                  class="wb-trace-stage"
                >
                  <div class="wb-trace-stage-head">
                    <span class="wb-trace-stage-name">
                      {{ stage.seq }}. {{ stage.stage }}
                    </span>
                    <Tag
                      :color="
                        stage.status === 'SUCCEEDED'
                          ? 'green'
                          : stage.status === 'FAILED'
                            ? 'red'
                            : 'default'
                      "
                    >
                      {{ stage.status || '-' }}
                    </Tag>
                    <span class="wb-trace-stage-ms">
                      {{ stage.elapsedMs ?? 0 }} ms
                    </span>
                  </div>
                  <div v-if="stage.errorMessage" class="wb-trace-stage-err">
                    {{ stage.errorMessage }}
                  </div>
                </div>
              </div>
              <Empty v-else description="暂无执行链路数据" />
            </Drawer>
          </Card>
        </Col>
      </Row>
    </div>
  </Page>
</template>

<style scoped>
/*
 * 视觉层沿用该页面改版前已验证过的深浅主题策略：
 * 直接使用 html.dark 显式覆盖，不自行依赖 Ant 内部 CSS 变量。
 */
.workbench-vben {
  padding: 4px 2px 8px;
  color: #1f2937;
}
html.dark .workbench-vben {
  color: #e5e7eb;
}

.wb-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.wb-page-head-main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
}
.wb-kb-select {
  width: min(360px, 42vw);
}
.wb-page-desc {
  color: #8a94a6;
  font-size: 12px;
}
html.dark .wb-page-desc {
  color: #6b7280;
}

.wb-body {
  min-height: 640px;
}
.wb-card {
  height: 100%;
}
.wb-side-card {
  height: calc(100vh - 210px);
  overflow: hidden;
}

/* 历史会话 */
.wb-conv-list {
  max-height: calc(100vh - 270px);
  overflow-y: auto;
}
.wb-conv-item {
  cursor: pointer;
  margin: 2px 0;
  padding: 9px 10px !important;
  border-radius: 6px;
  transition: background 0.2s;
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
.wb-conv-main {
  width: 100%;
}
.wb-conv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wb-conv-name {
  overflow: hidden;
  color: #334155;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html.dark .wb-conv-name {
  color: #e5e7eb;
}
.wb-conv-status {
  flex: none;
  margin: 0;
  font-size: 10px;
}
.wb-conv-time {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 11px;
}
html.dark .wb-conv-time {
  color: #64748b;
}

/* 对话区 */
.wb-chat-card :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 270px);
  min-height: 590px;
  padding: 12px;
}
.wb-chat-title {
  font-weight: 600;
}
.wb-msgs {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 8px;
}
.wb-msg {
  display: flex;
  gap: 11px;
  margin-bottom: 20px;
}
.wb-msg.user {
  flex-direction: row-reverse;
}
.wb-msg.system {
  justify-content: center;
}
.wb-msg-system {
  max-width: 90%;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 6px 14px;
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
}
html.dark .wb-msg-system {
  border-color: #374151;
  background: #1f2937;
  color: #9ca3af;
}

.wb-avatar-wrap {
  flex: none;
  width: 40px;
}
.wb-avatar {
  border: 2px solid #fff;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.16);
}
.wb-avatar.ai {
  border-color: #6d28d9;
  background: linear-gradient(135deg, #7c3aed, #6d28d9) !important;
}
.wb-avatar.user {
  border-color: #1e40af;
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
}

.wb-msg-main {
  display: flex;
  max-width: 80%;
  flex-direction: column;
}
.wb-msg.user .wb-msg-main {
  align-items: flex-end;
}
.wb-msg-head {
  display: flex;
  gap: 8px;
  margin: 0 4px 5px;
  color: #94a3b8;
  font-size: 11px;
}
.wb-msg.user .wb-msg-head {
  flex-direction: row-reverse;
}
.wb-msg-name {
  color: #64748b;
  font-weight: 600;
}
html.dark .wb-msg-name {
  color: #94a3b8;
}
.wb-msg-time {
  font-size: 10px;
}

/* 使用改版前已验证的气泡配色 */
.wb-msg-bubble {
  padding: 11px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.75;
  word-break: break-word;
}
.wb-msg-bubble.ai {
  border: 1.5px solid #cbd5e1;
  border-top-left-radius: 6px;
  background: #f8fafc;
  color: #1f2937;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
html.dark .wb-msg-bubble.ai {
  border-color: #4b5563;
  background: #374151;
  color: #e5e7eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.wb-msg-bubble.user {
  border: 1.5px solid #1e40af;
  border-top-right-radius: 6px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 5px 18px rgba(37, 99, 235, 0.28);
}
html.dark .wb-msg-bubble.user {
  border-color: #1e40af;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 5px 18px rgba(37, 99, 235, 0.42);
}
.wb-msg-text {
  white-space: pre-wrap;
}

.wb-answer-meta {
  display: inline-block;
  margin-top: 10px;
  border-radius: 5px;
  padding: 2px 7px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  font-size: 11px;
}
html.dark .wb-answer-meta {
  background: rgba(96, 165, 250, 0.16);
  color: #93c5fd;
}

/* 引用证据 */
.wb-ev-cards {
  margin-top: 12px;
  border-top: 1px solid #d1d5db;
  padding-top: 10px;
}
html.dark .wb-ev-cards {
  border-top-color: #6b7280;
}
.wb-ev-heading {
  margin-bottom: 7px;
  color: #8a94a6;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.wb-ev-card {
  margin-top: 7px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  padding: 9px 10px;
  background: #fff;
}
html.dark .wb-ev-card {
  border-color: #4b5563;
  background: #1f2937;
}
.wb-ev-card-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}
.wb-cite-tag {
  flex: none;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  padding: 1px 6px;
  background: #dbeafe;
  color: #2563eb;
  font-size: 10px;
  font-weight: 700;
}
html.dark .wb-cite-tag {
  border-color: #2563eb;
  background: #1e3a5f;
  color: #93c5fd;
}
.wb-ev-title-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-ev-page {
  flex: none;
  color: #94a3b8;
  font-size: 10px;
}
.wb-ev-card-quote {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  color: #64748b;
  font-size: 11.5px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
html.dark .wb-ev-card-quote {
  color: #aeb6c2;
}
.wb-trace-action {
  margin-top: 10px;
}

/* 思考中 */
.wb-typing-bubble {
  display: flex;
  align-items: center;
  gap: 7px;
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
.wb-typing-text {
  color: #64748b;
  font-size: 12px;
}
html.dark .wb-typing-text {
  color: #cbd5e1;
}
@keyframes wb-blink {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* 输入区：恢复改版前的简单稳定结构；输入框永远可编辑，发送时才校验知识库。 */
.wb-input-area {
  flex: none;
  border-top: 1px solid #e2e8f0;
  padding: 10px 2px 0;
}
html.dark .wb-input-area {
  border-top-color: #374151;
}
.wb-input-area :deep(textarea.ant-input),
.wb-input-area :deep(.ant-input) {
  border-color: #d9d9d9 !important;
  background: #fff !important;
  color: #1f2937 !important;
  resize: none;
}
html.dark .wb-input-area :deep(textarea.ant-input),
html.dark .wb-input-area :deep(.ant-input) {
  border-color: #4b5563 !important;
  background: #1f2937 !important;
  color: #e5e7eb !important;
}
html.dark .wb-input-area :deep(textarea.ant-input::placeholder),
html.dark .wb-input-area :deep(.ant-input::placeholder) {
  color: #6b7280 !important;
}
.wb-input-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}
.wb-kb-hint,
.wb-answer-blocked {
  color: #8a94a6;
  font-size: 11.5px;
}
html.dark .wb-kb-hint,
html.dark .wb-answer-blocked {
  color: #6b7280;
}
.wb-answer-blocked {
  margin-top: 8px;
}

@media (max-width: 1100px) {
  .wb-page-desc {
    display: none;
  }
  .wb-msg-main {
    max-width: 90%;
  }
}

/* P0-09: 查看本次执行链路抽屉 */
.wb-trace-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wb-trace-meta {
  padding: 12px;
  border-radius: 8px;
  background: #f6f7f9;
  line-height: 1.9;
}
html.dark .wb-trace-meta {
  background: #1c1f26;
}
.wb-trace-stage {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
html.dark .wb-trace-stage {
  border-color: #2a2e37;
}
.wb-trace-stage-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-trace-stage-name {
  font-weight: 600;
  flex: 1;
}
.wb-trace-stage-ms {
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.wb-trace-stage-err {
  margin-top: 6px;
  color: #dc2626;
  font-size: 12px;
}
html.dark .wb-trace-stage-err {
  color: #f87171;
}
</style>
