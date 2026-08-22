import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace KnowledgeApi {
  /** 知识库 */
  export interface KnowledgeBase {
    id?: number;
    name: string;
    /** 知识领域: GENERAL/PATENT */
    domainCode?: string;
    status?: number;
    remark?: string;
    createTime?: string;
  }
}

/** 查询知识库分页 */
export function getKnowledgeBasePage(
  params: PageParam & { name?: string },
) {
  return requestClient.get<PageResult<KnowledgeApi.KnowledgeBase>>(
    '/knowledge/knowledge-base/page',
    { params },
  );
}

/** 创建知识库 */
export function createKnowledgeBase(data: KnowledgeApi.KnowledgeBase) {
  return requestClient.post('/knowledge/knowledge-base/create', data);
}

/** 更新知识库 */
export function updateKnowledgeBase(data: KnowledgeApi.KnowledgeBase) {
  return requestClient.put('/knowledge/knowledge-base/update', data);
}

/** 删除知识库 */
export function deleteKnowledgeBase(id: number) {
  return requestClient.delete(`/knowledge/knowledge-base/delete?id=${id}`);
}

/* ========== 文档(入库管线) ========== */
export interface KnowledgeDocument {
  id?: number;
  kbId?: number;
  kbName?: string; // 所属知识库名(联表)
  name?: string;
  type?: string;
  storagePath?: string;
  fileHash?: string;
  parseStatus?: string;
  chunkStrategy?: string; // 切分策略(文档级: auto/structure/parent-child/semantic/policy/faq/table/image)
  chunkStrategyParams?: string; // 切分策略参数(JSON)
  chunkCount?: number; // 片段数(解析结果)
  errorMsg?: string; // 失败原因
  versionNo?: string; // 当前版本号(联表)
  versionStatus?: string; // 当前版本状态(联表)
  owner?: string;
  createTime?: string;
}

/** 查询文档分页 */
export function getDocumentPage(
  params: PageParam & { kbId?: number; name?: string },
) {
  return requestClient.get<PageResult<KnowledgeDocument>>(
    '/knowledge/document/page',
    { params },
  );
}

/** 创建文档(上传后登记, 返回文档编号) */
export function createDocument(data: Partial<KnowledgeDocument>) {
  return requestClient.post<number>('/knowledge/document/create', data);
}

/** 获得文档详情(单行状态轮询用) */
export function getDocument(id: number) {
  return requestClient.get<KnowledgeDocument>(`/knowledge/document/get?id=${id}`);
}

/** 删除文档 */
export function deleteDocument(id: number) {
  return requestClient.delete(`/knowledge/document/delete?id=${id}`);
}
