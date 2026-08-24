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
 * Knowledge QA Workbench 的 conversationId 只是“刷新恢复锚点”，不是一个新的业务页面。
 *
 * Vben Tabs 会把 query 变化识别成新的 tab route。工作台在首轮 SSE 收到 conversationId 后
 * 原本调用 router.replace({ query }), 会导致“每发一轮多一个 AI 对话工作台页签”，甚至让
 * 多个页面实例分别持有不同 currentConversationId。
 *
 * 对这种仅同步 conversationId 的 replace，不触发 Vue Router 导航，只替换浏览器 URL：
 * - 当前组件实例和会话状态保持不变；
 * - Vben 不会创建新 Tab；
 * - URL 仍保留 conversationId，F5/深链恢复能力不受影响；
 * - 新建会话清除 conversationId 时同样只更新当前 URL。
 */
const nativeReplace = router.replace.bind(router);
router.replace = ((to: RouteLocationRaw) => {
  if (isConversationAnchorReplace(to)) {
    const current = router.currentRoute.value;
    const target = router.resolve({
      path: current.path,
      query: (to as { query?: Record<string, any> }).query || {},
      hash: current.hash,
    });
    window.history.replaceState(window.history.state, '', target.href);
    return Promise.resolve(undefined);
  }
  return nativeReplace(to);
}) as typeof router.replace;

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
  // 只接管组件内部 router.replace({ query })；显式 path/name/params 导航保持 Vue Router 原语义。
  if (target.path || target.name || target.params || target.hash) {
    return false;
  }
  if (!target.query) {
    return false;
  }

  // 设置 conversationId，或当前浏览器 URL 已有 conversationId 而本次准备清除它。
  // 后者覆盖“＋ 新建会话”场景，即使 vue-router 内部 currentRoute 仍保持原 query，也能正确清 URL。
  const targetHasConversationId = Object.prototype.hasOwnProperty.call(
    target.query,
    'conversationId',
  );
  const browserHasConversationId = (() => {
    try {
      const href = window.location.href;
      return /(?:[?&])conversationId=\d+/.test(href);
    } catch {
      return false;
    }
  })();
  return targetHasConversationId || browserHasConversationId;
}

const resetRoutes = () => resetStaticRoutes(router, routes);

// 创建路由守卫
createRouterGuard(router);
// 设置百度统计
setupBaiduTongJi(router);

export { resetRoutes, router };
