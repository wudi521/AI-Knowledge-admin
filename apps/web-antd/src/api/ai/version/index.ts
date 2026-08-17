import { requestClient } from '#/api/request';

export namespace AiVersionApi {
  export interface Version {
    id: number; // 编号
    docId: number; // 文档编号
    versionNo: string; // 版本号 V1/V2/...
    status: string; // DRAFT/REVIEW/PUBLISHED/EXPIRED/ARCHIVED
    effectiveFrom?: string; // 生效开始
    effectiveTo?: string; // 生效结束
    reviewer?: string; // 审核人
    conflictStatus: number; // 0无 1待裁决 2已裁决
    reviewResult?: string; // APPROVED/REJECTED
    reviewComment?: string; // 审核意见
    createTime: string; // 创建时间
  }
}

/** 按文档查询版本列表(时间线) */
export function getVersionList(docId: number) {
  return requestClient.get<AiVersionApi.Version[]>('/knowledge/version/list', {
    params: { docId },
  });
}

/** 发布版本 */
export function publishVersion(id: number) {
  return requestClient.post(`/knowledge/version/publish?id=${id}`);
}

/** 整体驳回版本 */
export function rejectVersion(id: number, comment: string) {
  return requestClient.post(`/knowledge/version/reject?id=${id}&comment=${encodeURIComponent(comment)}`);
}
