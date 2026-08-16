<template>
  <div class="ai-wb">
    <!-- 侧边栏: 会话列表 -->
    <aside class="wb-side">
      <div class="wb-side-brand">
        <div class="wb-mark">AI</div>
        <div class="wb-brand-txt">
          <b>智能客服中枢</b>
          <small>AI&nbsp;SERVICE&nbsp;CONSOLE</small>
        </div>
      </div>
      <div class="wb-new">
        <button class="wb-btn wb-btn-primary" @click="newChat">＋ 新建会话</button>
      </div>
      <div class="wb-conv-title">最近会话</div>
      <div class="wb-conv-list">
        <div v-for="c in conversations" :key="c.id" class="wb-conv" :class="{ on: c.id === curId }" @click="curId = c.id">
          <span class="wb-conv-dot" :style="{ background: c.dot }"></span>
          <span class="wb-conv-name">{{ c.name }}</span>
          <span class="wb-conv-time mono">{{ c.time }}</span>
        </div>
      </div>
      <div class="wb-side-foot mono">KB·v1.0 &nbsp;·&nbsp; 模型在线</div>
    </aside>

    <!-- 主区: 对话 -->
    <section class="wb-main">
      <header class="wb-top">
        <div class="wb-top-title">
          <h2>{{ cur.name }}</h2>
          <p class="mono">{{ cur.channel }} · 会话 #{{ cur.id }}</p>
        </div>
        <div class="wb-top-actions">
          <span class="wb-model mono">Qwen2.5-72B</span>
          <button class="wb-btn wb-btn-ghost">清空</button>
          <button class="wb-btn wb-btn-warn">转人工</button>
        </div>
      </header>

      <div class="wb-chat" ref="chatBox">
        <div v-for="(m, i) in msgs" :key="i" class="wb-msg" :class="m.role">
          <div class="wb-avatar mono">{{ m.role === 'ai' ? 'AI' : '客' }}</div>
          <div class="wb-bubble">
            <div class="wb-bubble-head mono">{{ m.role === 'ai' ? '客服助手 · answered' : '访客 · visitor' }}</div>
            <div class="wb-bubble-txt">{{ m.text }}</div>
            <div v-if="m.cites && m.cites.length" class="wb-cites">
              <div class="wb-cite-title mono">⌁ 引用证据</div>
              <div v-for="ct in m.cites" :key="ct" class="wb-cite mono">{{ ct }}</div>
            </div>
          </div>
          <div class="wb-time mono">{{ m.time }}</div>
        </div>
      </div>

      <footer class="wb-inputbar">
        <div class="wb-inputbox">
          <input v-model="draft" class="wb-input" placeholder="输入你的问题，Shift+Enter 换行…" @keydown.enter.exact.prevent="send" />
          <div class="wb-input-tools">
            <span class="mono">⌁ 知识库: 产品手册·v2.3</span>
            <button class="wb-btn wb-btn-primary" @click="send">发送 ↵</button>
          </div>
        </div>
      </footer>
    </section>

    <!-- 右栏: 证据 / 信息 -->
    <aside class="wb-panel">
      <div class="wb-panel-block">
        <div class="wb-panel-title mono">⌁ 当前检索证据</div>
        <div class="wb-evidence">
          <div class="wb-ev-item">
            <div class="wb-ev-score mono">0.94</div>
            <div class="wb-ev-txt">《产品手册·退换货政策》第 12 节 —— 7 天无理由退货条款说明…</div>
          </div>
          <div class="wb-ev-item">
            <div class="wb-ev-score mono amber">0.87</div>
            <div class="wb-ev-txt">《FAQ·运费说明》第 3 条 —— 满 99 元包邮规则…</div>
          </div>
          <div class="wb-ev-item">
            <div class="wb-ev-score mono violet">0.71</div>
            <div class="wb-ev-txt">《产品手册·售后时效》第 5 节 —— 48 小时响应承诺…</div>
          </div>
        </div>
      </div>
      <div class="wb-panel-block">
        <div class="wb-panel-title mono">◈ 会话信息</div>
        <div class="wb-kv mono">
          <div><span>渠道</span><b>{{ cur.channel }}</b></div>
          <div><span>意图</span><b class="amber">售后退款</b></div>
          <div><span>轮次</span><b>{{ msgs.length }}</b></div>
          <div><span>模型</span><b>qwen2.5-72b</b></div>
        </div>
      </div>
      <div class="wb-panel-block">
        <div class="wb-panel-title mono">⚡ 快捷指令</div>
        <div class="wb-quick" @click="draft = '查询最新订单状态'">查询最新订单状态</div>
        <div class="wb-quick" @click="draft = '申请售后并说明流程'">申请售后并说明流程</div>
        <div class="wb-quick" @click="draft = '查询退换货政策'">查询退换货政策</div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue';

const conversations = reactive([
  { id: 1, name: '售后咨询 · 李女士', time: '09:12', dot: '#FFB020' },
  { id: 2, name: '订单查询 · 王先生', time: '08:47', dot: '#2FD6A3' },
  { id: 3, name: '产品咨询 · 张小姐', time: '昨日', dot: '#4D9FFF' },
]);
const curId = ref(1);
const cur = conversations[0] as any;
const draft = ref('');
const chatBox = ref<HTMLElement>();

const msgs = reactive([
  {
    role: 'user',
    text: '我上周买的商品想退货，请问流程是怎样的？',
    time: '09:12:03',
    cites: [],
  },
  {
    role: 'ai',
    text: '您好，李女士 😊 根据我们的退换货政策，您可以在签收后 7 天内申请无理由退货。流程如下：\n① 在订单详情页点击「申请售后」；\n② 选择「退货退款」并填写原因；\n③ 系统审核通过后，将为您推送上门取件码。',
    time: '09:12:06',
    cites: ['《产品手册·退换货政策》第 12 节', '《FAQ·运费说明》第 3 条'],
  },
  {
    role: 'user',
    text: '运费谁来承担？',
    time: '09:12:31',
    cites: [],
  },
  {
    role: 'ai',
    text: '如果是因为商品质量问题退货，运费由我们承担；如果是无理由退货（7 天内），未满 99 元订单需您承担运费，已满 99 元订单由我们承担。您的订单实付金额为 128 元，属于满额包邮，运费无需您承担 ✔',
    time: '09:12:34',
    cites: ['《FAQ·运费说明》第 3 条', '《产品手册·退换货政策》第 12 节'],
  },
]);

function send() {
  const text = draft.value.trim();
  if (!text) return;
  msgs.push({ role: 'user', text, time: new Date().toTimeString().slice(0, 8), cites: [] });
  draft.value = '';
  setTimeout(() => {
    msgs.push({
      role: 'ai',
      text: '已收到您的问题，正在为您检索知识库…（样板页演示，暂未接入真实模型）',
      time: new Date().toTimeString().slice(0, 8),
      cites: ['《产品手册·FAQ》示例片段'],
    });
    scrollBottom();
  }, 600);
  scrollBottom();
}
function newChat() {
  conversations.unshift({ id: Date.now(), name: '新会话', time: '刚刚', dot: '#A78BFA' });
  curId.value = conversations[0].id as number;
}
function scrollBottom() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
}
</script>

<style scoped>
.ai-wb {
  --bg: #0a0d12;
  --bg2: #0d1118;
  --panel: #121821;
  --panel2: #161e29;
  --line: #202a37;
  --line2: #2c3a4b;
  --txt: #e7ecf3;
  --txt2: #9aa6b6;
  --txt3: #5d6b7e;
  --amber: #ffb020;
  --amber2: #ffd27f;
  --amberDim: rgba(255, 176, 32, 0.12);
  --mint: #2fd6a3;
  --blue: #4d9fff;
  --violet: #a78bfa;
  --mono: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
  display: flex;
  height: calc(100vh - 0px);
  min-height: 560px;
  background: var(--bg);
  color: var(--txt);
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
}
.mono { font-family: var(--mono); }
.amber { color: var(--amber); }
.violet { color: var(--violet); }

/* ===== 侧栏 ===== */
.wb-side {
  width: 236px;
  min-width: 236px;
  background: var(--bg2);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.wb-side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.wb-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--amber), #ff7a1a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-family: var(--mono);
  font-size: 13px;
  color: #0a0d12;
  box-shadow: 0 6px 20px rgba(255, 176, 32, 0.35);
}
.wb-brand-txt b { font-size: 14px; display: block; }
.wb-brand-txt small { font-size: 9px; color: var(--txt3); letter-spacing: 2px; }
.wb-new { padding: 14px 14px 6px; }
.wb-conv-title {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 2px;
  color: var(--txt3);
  padding: 10px 16px 6px;
}
.wb-conv-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
.wb-conv {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--txt2);
  cursor: pointer;
  font-size: 12.5px;
  margin-bottom: 2px;
  transition: 0.18s;
}
.wb-conv:hover { background: rgba(255, 255, 255, 0.04); color: var(--txt); }
.wb-conv.on { background: var(--amberDim); color: var(--amber2); }
.wb-conv-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.wb-conv-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-conv-time { font-size: 9px; color: var(--txt3); }
.wb-side-foot {
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  font-size: 9.5px;
  color: var(--txt3);
  letter-spacing: 1px;
}

/* ===== 主区 ===== */
.wb-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.wb-top {
  height: 58px;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  background: rgba(13, 17, 24, 0.85);
  backdrop-filter: blur(10px);
}
.wb-top-title h2 { font-size: 15px; font-weight: 700; }
.wb-top-title p { font-family: var(--mono); font-size: 9px; color: var(--txt3); letter-spacing: 2px; margin-top: 1px; }
.wb-top-actions { display: flex; align-items: center; gap: 10px; }
.wb-model {
  font-size: 10px;
  color: var(--mint);
  border: 1px solid rgba(47, 214, 163, 0.35);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(47, 214, 163, 0.08);
}

/* 按钮 */
.wb-btn {
  font-size: 12px;
  border: 1px solid var(--line2);
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  color: var(--txt2);
  background: transparent;
  transition: 0.2s;
}
.wb-btn:hover { border-color: var(--amber); color: var(--amber2); }
.wb-btn-primary {
  background: linear-gradient(135deg, var(--amber), #ff7a1a);
  color: #0a0d12;
  font-weight: 700;
  border: none;
}
.wb-btn-primary:hover { filter: brightness(1.08); color: #0a0d12; }
.wb-btn-warn {
  border-color: rgba(255, 93, 93, 0.5);
  color: #ff5d5d;
}
.wb-btn-warn:hover { background: rgba(255, 93, 93, 0.12); }

/* 对话区 */
.wb-chat {
  flex: 1;
  overflow-y: auto;
  padding: 22px 24px;
  background:
    radial-gradient(900px 500px at 85% -10%, rgba(255, 176, 32, 0.05), transparent 60%),
    radial-gradient(700px 400px at -10% 110%, rgba(77, 159, 255, 0.05), transparent 60%);
}
.wb-msg { display: flex; gap: 12px; margin-bottom: 22px; max-width: 820px; }
.wb-msg.user { margin-left: auto; flex-direction: row-reverse; }
.wb-avatar {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}
.wb-msg.ai .wb-avatar { background: linear-gradient(135deg, #33415a, #1c2536); border: 1px solid var(--line2); color: var(--amber2); }
.wb-msg.user .wb-avatar { background: var(--amberDim); border: 1px solid rgba(255, 176, 32, 0.4); color: var(--amber); }
.wb-bubble {
  flex: 1;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.wb-msg.user .wb-bubble { background: var(--panel2); }
.wb-bubble-head { font-size: 9px; color: var(--txt3); letter-spacing: 1.5px; margin-bottom: 8px; }
.wb-bubble-txt { font-size: 13.5px; line-height: 1.75; white-space: pre-wrap; color: var(--txt); }
.wb-cites { margin-top: 12px; border-top: 1px dashed var(--line2); padding-top: 10px; }
.wb-cite-title { font-size: 9.5px; color: var(--amber); letter-spacing: 1px; margin-bottom: 6px; }
.wb-cite {
  font-size: 10.5px;
  color: var(--txt2);
  background: var(--amberDim);
  border: 1px solid rgba(255, 176, 32, 0.25);
  border-radius: 6px;
  padding: 5px 9px;
  margin-bottom: 5px;
  display: inline-block;
  margin-right: 6px;
}
.wb-time { font-size: 9px; color: var(--txt3); align-self: flex-end; }

/* 输入区 */
.wb-inputbar { padding: 12px 20px 18px; border-top: 1px solid var(--line); background: var(--bg2); }
.wb-inputbox {
  background: var(--panel);
  border: 1px solid var(--line2);
  border-radius: 12px;
  padding: 10px 12px;
  transition: 0.2s;
}
.wb-inputbox:focus-within { border-color: var(--amber); box-shadow: 0 0 0 3px var(--amberDim); }
.wb-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--txt);
  font-size: 13px;
  line-height: 1.6;
  resize: none;
}
.wb-input::placeholder { color: var(--txt3); }
.wb-input-tools {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.wb-input-tools span { font-size: 9.5px; color: var(--txt3); letter-spacing: 0.5px; }

/* ===== 右栏 ===== */
.wb-panel {
  width: 292px;
  min-width: 292px;
  border-left: 1px solid var(--line);
  background: var(--bg2);
  overflow-y: auto;
}
.wb-panel-block { padding: 16px 16px 4px; }
.wb-panel-title {
  font-size: 9.5px;
  letter-spacing: 2px;
  color: var(--txt3);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.wb-evidence { display: flex; flex-direction: column; gap: 10px; }
.wb-ev-item {
  display: flex;
  gap: 10px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}
.wb-ev-score { font-size: 12px; font-weight: 700; color: var(--mint); flex: none; }
.wb-ev-score.amber { color: var(--amber); }
.wb-ev-score.violet { color: var(--violet); }
.wb-ev-txt { font-size: 11.5px; color: var(--txt2); line-height: 1.55; }
.wb-kv { display: flex; flex-direction: column; gap: 9px; font-size: 11.5px; }
.wb-kv div { display: flex; justify-content: space-between; }
.wb-kv span { color: var(--txt3); }
.wb-kv b { color: var(--txt); font-weight: 600; }
.wb-quick {
  font-size: 12px;
  color: var(--txt2);
  border: 1px dashed var(--line2);
  border-radius: 8px;
  padding: 9px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: 0.18s;
}
.wb-quick:hover { border-color: var(--amber); color: var(--amber2); background: var(--amberDim); }

/* 滚动条 */
.wb-chat::-webkit-scrollbar,
.wb-panel::-webkit-scrollbar,
.wb-conv-list::-webkit-scrollbar { width: 8px; }
.wb-chat::-webkit-scrollbar-thumb,
.wb-panel::-webkit-scrollbar-thumb { background: #263140; border-radius: 4px; }
</style>
