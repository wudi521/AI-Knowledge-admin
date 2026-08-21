import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace AiPromptApi {
  /** 提示词版本 */
  export interface Prompt {
    id: number;
    promptKey: string;
    name: string;
    description?: string;
    content: string;
    version: number;
    /** 状态：0停用 1启用全量 2灰度中 */
    status: number;
    grayTenantIds?: number[];
    createTime?: number;
    updateTime?: number;
  }

  /** 提示词 Key 概览 */
  export interface KeyInfo {
    promptKey: string;
    name: string;
    enabledVersion?: number;
    grayVersion?: number;
    grayTenantIds?: number[];
    versionCount: number;
  }

  /** 试运行结论 */
  export interface ValidateResult {
    code?: string;
    text: string;
  }
}

/** 查询提示词分页 */
export function getPromptPage(
  params: PageParam & { promptKey?: string; status?: number },
) {
  return requestClient.get<PageResult<AiPromptApi.Prompt>>(
    '/model/prompt/page',
    { params },
  );
}

/** 查询提示词 Key 列表(版本概览) */
export function getPromptKeyList() {
  return requestClient.get<AiPromptApi.KeyInfo[]>('/model/prompt/key-list');
}

/** 创建提示词 */
export function createPrompt(data: {
  promptKey: string;
  name: string;
  description?: string;
  content: string;
}) {
  return requestClient.post<number>('/model/prompt/create', data);
}

/** 更新提示词(仅停用版本) */
export function updatePrompt(data: {
  id: number;
  name?: string;
  description?: string;
  content?: string;
}) {
  return requestClient.put<boolean>('/model/prompt/update', data);
}

/** 启用提示词(全量) */
export function enablePrompt(id: number) {
  return requestClient.post<boolean>('/model/prompt/enable', { id });
}

/** 灰度启用 */
export function grayEnablePrompt(id: number, tenantIds: number[]) {
  return requestClient.post<boolean>('/model/prompt/gray-enable', {
    id,
    tenantIds,
  });
}

/** 关闭灰度 */
export function grayOffPrompt(id: number) {
  return requestClient.post<boolean>('/model/prompt/gray-off', { id });
}

/** 删除提示词 */
export function deletePrompt(id: number) {
  return requestClient.delete<boolean>(`/model/prompt/delete?id=${id}`);
}

/** 试运行校验 */
export function validatePrompt(id: number, facts: Record<string, unknown>) {
  return requestClient.post<AiPromptApi.ValidateResult[]>(
    '/model/prompt/validate',
    { id, facts },
  );
}
