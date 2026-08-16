import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace AiChunkApi {
  export interface Chunk {
    id: number; // 片段编号
    documentId: number; // 文档编号(version_id 映射)
    documentName?: string; // 文档名(联表)
    storagePath?: string; // MinIO 下载路径(联表)
    chunkType: string; // 类型: SEMANTIC/TABLE/FAQ/POLICY
    content: string; // 片段内容
    parentId?: number; // 父块编号
    metadata?: string; // 元数据
    status: string; // PUBLISHED / DISABLED
    vectorKey?: string; // 向量关联键
    createTime: string; // 创建时间
  }
}

/** 分页查询片段 */
export function getChunkPage(
  params: PageParam & { documentId?: number; chunkType?: string; status?: string },
) {
  return requestClient.get<PageResult<AiChunkApi.Chunk>>('/ingestion/chunk/page', {
    params,
  });
}

/** 编辑片段内容 */
export function updateChunk(data: { id: number; content: string }) {
  return requestClient.put('/ingestion/chunk/update', data);
}

/** 启用/禁用片段 */
export function updateChunkStatus(data: { id: number; status: string }) {
  return requestClient.put('/ingestion/chunk/update-status', data);
}

/** 删除片段(同时删除向量与检索索引) */
export function deleteChunk(id: number) {
  return requestClient.delete(`/ingestion/chunk/delete?id=${id}`);
}

/** 批量删除片段(三处联动) */
export function deleteChunkBatch(ids: number[]) {
  return requestClient.delete(`/ingestion/chunk/delete-batch?ids=${ids.join(',')}`);
}
