import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace KnowledgeApi {
  /** 知识库 */
  export interface KnowledgeBase {
    id?: number;
    name: string;
    chunkStrategy?: string;
    embedModel?: string;
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
  chunkStrategy?: string; // 切分策略(联表)
  embedModel?: string; // Embedding 模型(联表)
  chunkCount?: number; // 片段数(解析结果)
  errorMsg?: string; // 失败原因
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

/** 创建文档(上传后登记) */
export function createDocument(data: Partial<KnowledgeDocument>) {
  return requestClient.post('/knowledge/document/create', data);
}

/** 删除文档 */
export function deleteDocument(id: number) {
  return requestClient.delete(`/knowledge/document/delete?id=${id}`);
}
