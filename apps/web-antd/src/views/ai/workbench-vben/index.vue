<script lang="ts" setup>
import { computed, nextTick, reactive, ref } from 'vue';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Space,
  Tag,
  message,
} from 'ant-design-vue';

// 会话列表
const conversations = reactive([
  { id: 1, name: '售后咨询 · 李女士', time: '09:12', type: '售后', color: 'orange' },
  { id: 2, name: '订单查询 · 王先生', time: '08:47', type: '订单', color: 'green' },
  { id: 3, name: '产品咨询 · 张小姐', time: '昨日', type: '产品', color: 'blue' },
  { id: 4, name: '价格咨询 · 陈先生', time: '昨日', type: '价格', color: 'purple' },
]);
const curId = ref(1);
const cur = computed(() => conversations.find((c) => c.id === curId.value) || conversations[0]);

interface Msg {
  role: 'user' | 'ai';
  text: string;
  time: string;
  cites?: string[];
}
const msgs = reactive<Msg[]>([
  {
    role: 'user',
    text: '我上周买的商品想退货，请问流程是怎样的？',
    time: '09:12:03',
  },
  {
    role: 'ai',
    text: '您好，李女士 😊 根据我们的退换货政策，您可以在签收后 7 天内申请无理由退货。流程如下：① 在订单详情页点击「申请售后」；② 选择「退货退款」并填写原因；③ 系统审核通过后，将为您推送上门取件码。',
    time: '09:12:06',
    cites: ['《产品手册·退换货政策》第 12 节', '《FAQ·运费说明》第 3 条'],
  },
  {
    role: 'user',
    text: '运费谁来承担？',
    time: '09:12:31',
  },
  {
    role: 'ai',
    text: '如果是因为商品质量问题退货，运费由我们承担；如果是无理由退货（7 天内），未满 99 元订单需您承担运费，已满 99 元订单由我们承担。您的订单实付金额为 128 元，属于满额包邮，运费无需您承担 ✔',
    time: '09:12:34',
    cites: ['《FAQ·运费说明》第 3 条'],
  },
]);

// 检索证据（卡片化，固定配色深浅适配）
const evidences = [
  {
    score: '0.94',
    name: '《产品手册·退换货政策》',
    section: '第 12 节 · 退货条款',
    desc: '签收后 7 天内可申请无理由退货，商品需保持完好…',
    tag: '政策',
    cls: 'green',
    src: 'docs/20260815/退换货政策.md',
  },
  {
    score: '0.87',
    name: '《FAQ·运费说明》',
    section: '第 3 条 · 包邮规则',
    desc: '单笔订单实付满 99 元包邮，超重商品按体积计费…',
    tag: 'FAQ',
    cls: 'orange',
    src: 'docs/20260815/运费说明.md',
  },
  {
    score: '0.71',
    name: '《产品手册·售后时效》',
    section: '第 5 节 · 响应承诺',
    desc: '售后申请提交后 48 小时内完成审核并给出处理方案…',
    tag: '时效',
    cls: 'blue',
    src: 'docs/20260815/售后时效.md',
  },
];

const draft = ref('');
const chatBox = ref<HTMLElement>();

function send() {
  const text = draft.value.trim();
  if (!text) return;
  msgs.push({ role: 'user', text, time: new Date().toTimeString().slice(0, 8) });
  draft.value = '';
  setTimeout(() => {
    msgs.push({
      role: 'ai',
      text: '已收到您的问题，正在为您检索知识库…（vben 风格样板页，暂未接入真实模型）',
      time: new Date().toTimeString().slice(0, 8),
      cites: ['《产品手册·FAQ》示例片段'],
    });
    scrollBottom();
  }, 600);
  scrollBottom();
}

function newChat() {
  conversations.unshift({
    id: Date.now(),
    name: '新会话',
    time: '刚刚',
    type: '咨询',
    color: 'cyan',
  });
  curId.value = conversations[0].id;
  message.success('已创建新会话');
}

function scrollBottom() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
}
</script>

<template>
  <div class="workbench-vben">
    <div class="wb-page-head">
      <div>
        <h2 class="wb-page-title">AI 客服工作台</h2>
        <p class="wb-page-desc">vben 原生风格样板页 · 会话接待 / 知识引用 / 人工转接</p>
      </div>
      <Space>
        <Tag color="blue">Qwen2.5-72B</Tag>
        <Button type="primary" @click="newChat">＋ 新建会话</Button>
      </Space>
    </div>

    <Row :gutter="16" class="wb-body">
      <!-- 左: 会话列表 -->
      <Col :span="5">
        <Card title="会话列表" size="small" class="wb-card wb-side-card">
          <List :data-source="conversations" :pagination="false" size="small" class="wb-conv-list">
            <template #renderItem="{ item }">
              <List.Item
                class="wb-conv-item"
                :class="{ 'wb-conv-active': item.id === curId }"
                @click="curId = item.id"
              >
                <Badge :color="item.color" />
                <span class="wb-conv-name">{{ item.name }}</span>
                <span class="wb-conv-time">{{ item.time }}</span>
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
              <span>{{ cur.name }}</span>
            </Space>
          </template>
          <template #extra>
            <Space>
              <Button size="small">清空</Button>
              <Button size="small" danger>转人工</Button>
            </Space>
          </template>

          <div ref="chatBox" class="wb-msgs">
            <div v-for="(m, i) in msgs" :key="i" class="wb-msg" :class="m.role">
              <div class="wb-avatar-wrap" :class="m.role">
                <Avatar :size="40" :class="['wb-avatar', m.role]">
                  <template #icon>
                    <span class="wb-avatar-txt">{{ m.role === 'ai' ? 'AI' : '客' }}</span>
                  </template>
                </Avatar>
                <span class="wb-avatar-dot" :class="m.role"></span>
              </div>

              <div class="wb-msg-main">
                <div class="wb-msg-head">
                  <span class="wb-msg-name">{{ m.role === 'ai' ? '客服助手' : '访客' }}</span>
                  <span class="wb-msg-time">{{ m.time }}</span>
                </div>
                <div class="wb-msg-bubble" :class="m.role">
                  <div class="wb-msg-text">{{ m.text }}</div>
                  <div v-if="m.cites && m.cites.length" class="wb-msg-cites">
                    <div class="wb-cites-title">⌁ 引用证据</div>
                    <div class="wb-cites-list">
                      <span v-for="c in m.cites" :key="c" class="wb-cite-tag">{{ c }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Empty v-if="!msgs.length" description="暂无消息" />
          </div>

          <div class="wb-input-area">
            <Input.TextArea
              v-model:value="draft"
              :rows="3"
              placeholder="输入你的问题，Enter 发送…"
              @press-enter.prevent="send"
            />
            <div class="wb-input-foot">
              <span class="wb-kb-hint">⌁ 知识库：产品手册 · v2.3</span>
              <Button type="primary" @click="send">发送</Button>
            </div>
          </div>
        </Card>
      </Col>

      <!-- 右: 信息面板 -->
      <Col :span="6">
        <Card title="当前检索证据" size="small" class="wb-card" style="margin-bottom: 16px">
          <div class="wb-evidence">
            <div v-for="e in evidences" :key="e.name" class="wb-ev-card" :class="e.cls">
              <div class="wb-ev-top">
                <span class="wb-ev-score" :class="e.cls">{{ e.score }}</span>
                <span class="wb-ev-name">{{ e.name }}</span>
              </div>
              <div class="wb-ev-section">{{ e.section }}</div>
              <div class="wb-ev-desc">{{ e.desc }}</div>
              <div class="wb-ev-foot">
                <Tag :color="e.cls === 'green' ? 'green' : e.cls === 'orange' ? 'orange' : 'blue'" class="wb-ev-tag">{{ e.tag }}</Tag>
                <span class="wb-ev-actions">
                  <span class="wb-ev-src mono">{{ e.src }}</span>
                  <a class="wb-ev-link">详情 ›</a>
                </span>
              </div>
            </div>
          </div>
        </Card>
        <Card title="会话信息" size="small" class="wb-card" style="margin-bottom: 16px">
          <div class="wb-kv">
            <div><span>渠道</span><b>Web 客服</b></div>
            <div><span>意图</span><b class="kv-warn">售后退款</b></div>
            <div><span>轮次</span><b>{{ msgs.length }}</b></div>
            <div><span>模型</span><b class="mono">qwen2.5-72b</b></div>
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

/* ===== 检索证据(卡片化) ===== */
.wb-evidence {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wb-ev-card {
  background: #ffffff;
  border: 1.5px solid #d7dde6;
  border-left: 4px solid #64748b;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
}
html.dark .wb-ev-card {
  background: #1f2937;
  border-color: #4b5563;
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.35);
}
.wb-ev-card.green {
  border-left-color: #16a34a;
}
.wb-ev-card.orange {
  border-left-color: #d97706;
}
.wb-ev-card.blue {
  border-left-color: #2563eb;
}
.wb-ev-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
}
html.dark .wb-ev-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
}
.wb-ev-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-ev-score {
  font-family: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  flex: none;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.wb-ev-score.green {
  background: #16a34a;
}
.wb-ev-score.orange {
  background: #d97706;
}
.wb-ev-score.blue {
  background: #2563eb;
}
.wb-ev-name {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html.dark .wb-ev-name {
  color: #f3f4f6;
}
.wb-ev-section {
  font-size: 11px;
  color: #2563eb;
  margin: 4px 0 0 40px;
  font-weight: 600;
}
html.dark .wb-ev-section {
  color: #93c5fd;
}
.wb-ev-desc {
  font-size: 11.5px;
  color: #4b5563;
  line-height: 1.55;
  margin: 6px 0 0 40px;
}
html.dark .wb-ev-desc {
  color: #9ca3af;
}
.wb-ev-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 0 40px;
  gap: 6px;
}
.wb-ev-tag {
  margin: 0;
  font-size: 10px;
  line-height: 1.4;
}
.wb-ev-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.wb-ev-src {
  font-size: 9.5px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}
html.dark .wb-ev-src {
  color: #6b7280;
}
.wb-ev-link {
  font-size: 11px;
  color: #2563eb;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.wb-ev-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
html.dark .wb-ev-link {
  color: #60a5fa;
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
