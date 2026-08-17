import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace AiReviewApi {
  export interface ReviewItem {
    id: number; // 编号
    versionId: number; // 版本编号
    docId: number; // 文档编号
    docName?: string; // 文档名称(联表)
    chunkId?: number; // 来源Chunk编号
    itemType: string; // POLICY/PRICE/LEGAL/FAQ/SOP
    title: string; // 条目主题
    content: string; // 条目内容
    riskLevel: string; // HIGH/MED/LOW
    aiConfidence?: number; // AI置信度
    mustReview: boolean; // 是否必审
    status: string; // PENDING/APPROVED/REJECTED
    reviewer?: string; // 审核人
    reviewer2?: string; // 双人复核第二人
    rejectReason?: string; // 驳回原因
    reviewTime?: string; // 审核时间
  }
}

/** 审核条目分页 */
export function getReviewItemPage(
  params: PageParam & {
    docId?: number;
    versionId?: number;
    status?: string;
    itemType?: string;
    riskLevel?: string;
  },
) {
  return requestClient.get<PageResult<AiReviewApi.ReviewItem>>(
    '/knowledge/review-item/page',
    { params },
  );
}

/** 通过条目 */
export function approveReviewItem(id: number) {
  return requestClient.post('/knowledge/review-item/approve', { params: { id } });
}

/** 价格类双人复核 */
export function approveReviewItemSecond(id: number) {
  return requestClient.post('/knowledge/review-item/approve-second', {
    params: { id },
  });
}

/** 驳回条目 */
export function rejectReviewItem(id: number, reason: string) {
  return requestClient.post('/knowledge/review-item/reject', {
    params: { id, reason },
  });
}

/** 按文档重试 LLM 抽取(抽取失败后的恢复入口) */
export function retryExtractByDocId(docId: number) {
  return requestClient.post('/knowledge/review-item/retry-extract', {
    params: { docId },
  });
}
