import { requestClient } from '#/api/request';

export namespace AiConflictApi {
  export interface Conflict {
    id: number; // 编号
    versionId: number; // 新版本编号
    oldVersionId: number; // 旧已发布版本编号
    docId: number; // 文档编号
    itemId?: number; // 关联审核条目
    title: string; // 冲突主题
    oldContent: string; // 旧版本表述
    newContent: string; // 新版本表述
    ruleHit: boolean; // 规则粗筛命中
    llmJudgement?: string; // LLM判定: CONFLICT/NO_CONFLICT
    llmReason?: string; // LLM判定理由
    status: string; // PENDING/RESOLVED_NEW/RESOLVED_OLD
    resolver?: string; // 裁决人
    resolveTime?: string; // 裁决时间
    createTime: string; // 创建时间
  }
}

/** 冲突列表(按文档/状态) */
export function getConflictList(docId: number, status?: string) {
  return requestClient.get<AiConflictApi.Conflict[]>('/knowledge/conflict/list', {
    params: { docId, status },
  });
}

/** 触发冲突检测 */
export function detectConflicts(versionId: number) {
  return requestClient.post('/knowledge/conflict/detect', {
    params: { versionId },
  });
}

/** 裁决 */
export function resolveConflict(id: number, resolveType: string, comment?: string) {
  return requestClient.post('/knowledge/conflict/resolve', {
    params: { id, resolveType, comment },
  });
}
