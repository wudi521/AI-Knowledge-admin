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
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Select
        v-model:value="selectedKbId"
        :options="kbOptions"
        :loading="kbLoading"
        placeholder="选择知识库"
        style="width: 320px"
        show-search
        option-filter-prop="label"
      />
      <Tag v-if="selectedKb?.domainCode === 'PATENT'" color="blue">专利知识问答</Tag>
      <Tag v-else-if="selectedKbId" color="default">通用知识问答</Tag>
      <span class="text-xs text-muted-foreground">运行模型由 AI 运行时 / 模型网关决定</span>
      <Button class="ml-auto" type="primary" @click="newConversation">新建会话</Button>
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
        <Card title="历史会话" size="small" class="h-full">
          <List :data-source="conversations" :loading="loadingConversations" size="small">
            <template #renderItem="{ item }">
              <List.Item
                class="cursor-pointer"
                :class="{ 'conversation-active': item.id === currentConversationId }"
                @click="selectConversation(item)"
              >
                <div class="w-full">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">会话 #{{ item.id }}</span>
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
        <Card size="small" class="h-full">
          <template #title>
            <Space>
              <span>{{ currentConversation ? `会话 #${currentConversation.id}` : '新会话' }}</span>
              <Tag v-if="selectedKb">{{ selectedKb.label }}</Tag>
            </Space>
          </template>

          <div ref="chatBox" class="chat-box">
            <Empty v-if="messages.length === 0 && !loadingHistory" description="输入一个基于知识库的问题开始问答" />
            <div v-for="msg in messages" :key="msg.id" class="message-row" :class="`message-${msg.role.toLowerCase()}`">
              <div class="message-role">{{ msg.role === 'USER' ? '你' : msg.role === 'AI' ? '知识助手' : '系统' }}</div>
              <div class="message-card">
                <div class="whitespace-pre-wrap leading-7">{{ msg.content }}</div>
                <div v-if="msg.role === 'AI' && msg.confidence != null" class="mt-2 text-xs text-muted-foreground">
                  证据置信度 {{ Math.round(msg.confidence * 100) }}%
                </div>
                <div v-if="msg.evidenceList?.length" class="mt-3 flex flex-col gap-2">
                  <div class="text-xs font-medium text-muted-foreground">引用来源</div>
                  <Card v-for="(ev, index) in msg.evidenceList" :key="ev.chunkId || index" size="small">
                    <div class="mb-1 flex items-center gap-2">
                      <Tag color="blue">C{{ index + 1 }}</Tag>
                      <span class="font-medium">{{ evidenceTitle(ev) }}</span>
                      <span v-if="evidenceMeta(ev, 'pageStart')" class="text-xs text-muted-foreground">第 {{ evidenceMeta(ev, 'pageStart') }} 页</span>
                    </div>
                    <div class="line-clamp-3 text-sm text-muted-foreground">{{ ev.content || '来源内容未返回' }}</div>
                  </Card>
                </div>
                <div v-if="msg.role === 'AI' && msg.traceId" class="mt-3">
                  <Button type="link" size="small" class="p-0" @click="openTrace(msg.traceId)">查看本次执行链路 →</Button>
                </div>
              </div>
            </div>
            <div v-if="sending" class="text-sm text-muted-foreground">正在检索知识并生成回答…</div>
          </div>

          <div class="mt-3 flex gap-2">
            <Input.TextArea
              v-model:value="draft"
              :rows="3"
              :disabled="!selectedKbId || sending"
              placeholder="输入问题。Enter 换行，点击发送提交。"
            />
            <Button type="primary" :loading="sending" :disabled="!selectedKbId || !draft.trim()" @click="send">发送</Button>
          </div>

          <div v-if="lastResult && lastResult.answerable === false" class="mt-2 text-xs text-muted-foreground">
            本次未满足可靠作答条件。系统不会为了“看起来有答案”而跳过证据门禁。
            <a v-if="lastResult.traceId" class="ml-1" @click="openTrace(lastResult.traceId)">查看原因</a>
          </div>
        </Card>
      </Col>
    </Row>
  </Page>
</template>

<style scoped>
.workbench-body { min-height: 620px; }
.chat-box { min-height: 500px; max-height: 62vh; overflow-y: auto; padding: 8px; }
.message-row { margin-bottom: 16px; }
.message-role { margin-bottom: 4px; font-size: 12px; color: #8a8a8e; }
.message-card { border: 1px solid var(--ant-color-border, #e5e7eb); border-radius: 10px; padding: 12px 14px; background: var(--ant-color-bg-container, #fff); }
.message-user .message-card { margin-left: 16%; }
.message-ai .message-card { margin-right: 10%; }
.conversation-active { background: rgba(59, 130, 246, 0.08); border-radius: 6px; }
</style>
