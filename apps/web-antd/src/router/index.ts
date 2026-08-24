import type { RouteLocationRaw } from 'vue-router';

import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import { resetStaticRoutes } from '@vben/utils';

import { createRouterGuard } from './guard';
import { routes } from './routes';
import { setupBaiduTongJi } from './tongji';

/**
 *  @zh_CN 创建vue-router实例
 */
const router = createRouter({
  history:
    import.meta.env.VITE_ROUTER_HISTORY === 'hash'
      ? createWebHashHistory(import.meta.env.VITE_BASE)
      : createWebHistory(import.meta.env.VITE_BASE),
  // 应该添加到路由的初始路由列表。
  routes,
  scrollBehavior: (to, _from, savedPosition) => {
    if (savedPosition) {
      return savedPosition;
    }
    return to.hash ? { behavior: 'smooth', el: to.hash } : { left: 0, top: 0 };
  },
  // 是否应该禁止尾部斜杠。
  // strict: true,
});

/**
 * Knowledge QA Workbench 的 conversationId 是“工作区运行状态”，不是一个新的 Tab Route。
 *
 * 之前无论 router.replace({ query }) 还是 history.replaceState()，都会让 Vben Tabs 的 route/fullPath
 * 与浏览器地址产生竞争，最终出现“一轮一个 AI 对话工作台页签”和多个组件实例持有不同会话的问题。
 *
 * 这里改为：
 * 1. 运行期间仅把 conversationId 放进 sessionStorage，不产生任何 router/history 导航；
 * 2. F5/重新进入页面时，beforeEach 再把该锚点恢复到首个路由解析中；
 * 3. 新建会话清除锚点后，下一轮会创建新 conversationId，但当前 Tab 始终不变。
 */
const CONVERSATION_ANCHOR_PREFIX = 'ai-qa:conversation:';
const nativeReplace = router.replace.bind(router);

function anchorKey(path: string) {
  return `${CONVERSATION_ANCHOR_PREFIX}${path}`;
}

function getConversationIdFromQuery(query?: Record<string, any>): string | undefined {
  if (!query) return undefined;
  const value = query.conversationId;
  if (value == null || value === '') return undefined;
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(id) && id > 0 ? String(id) : undefined;
}

function isConversationAnchorReplace(to: RouteLocationRaw): boolean {
  if (typeof to === 'string' || !to || typeof to !== 'object') {
    return false;
  }
  const target = to as {
    hash?: string;
    name?: unknown;
    params?: unknown;
    path?: string;
    query?: Record<string, any>;
  };
  // 仅接管工作台内部 syncConversationUrl() 这种 router.replace({ query })。
  return Boolean(
    target.query &&
      !target.path &&
      !target.name &&
      !target.params &&
      !target.hash,
  );
}

router.replace = ((to: RouteLocationRaw) => {
  if (!isConversationAnchorReplace(to)) {
    return nativeReplace(to);
  }

  const path = router.currentRoute.value.path || window.location.pathname;
  const query = (to as { query?: Record<string, any> }).query || {};
  const conversationId = getConversationIdFromQuery(query);
  const key = anchorKey(path);
  if (conversationId) {
    sessionStorage.setItem(key, conversationId);
  } else {
    sessionStorage.removeItem(key);
  }

  // 关键：不触发 router.replace / history.replaceState。
  // 当前 Vue 组件实例、Vben Tab key、SSE 状态保持原样。
  return Promise.resolve(undefined);
}) as typeof router.replace;

// F5/重新进入时恢复最近会话。只在真正的路由导航阶段执行一次，不参与每轮消息发送。
router.beforeEach((to) => {
  const explicit = getConversationIdFromQuery(to.query as Record<string, any>);
  if (explicit) {
    sessionStorage.setItem(anchorKey(to.path), explicit);
    return true;
  }

  const saved = sessionStorage.getItem(anchorKey(to.path));
  if (!saved) {
    return true;
  }

  return {
    path: to.path,
    query: { ...to.query, conversationId: saved },
    hash: to.hash,
    replace: true,
  };
});

const resetRoutes = () => resetStaticRoutes(router, routes);

// 创建路由守卫
createRouterGuard(router);
// 设置百度统计
setupBaiduTongJi(router);

export { resetRoutes, router };
