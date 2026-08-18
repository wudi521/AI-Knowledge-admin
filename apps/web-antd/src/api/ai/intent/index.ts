import { requestClient } from '#/api/request';

export namespace AiIntentApi {
  /** 知识库意图 */
  export interface Intent {
    id: number; // 意图编号
    kbId: number; // 所属知识库编号
    description?: string; // 意图说明
    name: string; // 意图名称
    source: 'LLM_AUTO' | 'MANUAL'; // 来源: LLM_AUTO=AI 总结 / MANUAL=手动
    status: number; // 状态: 0=启用 / 1=停用
    createTime?: string; // 创建时间
  }
}

/** 查询知识库意图列表 */
export function getIntentList(kbId: number) {
  return requestClient.get<AiIntentApi.Intent[]>(
    `/knowledge/intent/list?kbId=${kbId}`,
  );
}

/** 新增意图(手动, source 固定为 MANUAL) */
export function createIntent(data: {
  description?: string;
  kbId: number;
  name: string;
}) {
  return requestClient.post<number>('/knowledge/intent/create', data);
}

/** 修改意图 */
export function updateIntent(data: {
  description?: string;
  id: number;
  name?: string;
  status?: number;
}) {
  return requestClient.put<boolean>('/knowledge/intent/update', data);
}

/** 删除意图 */
export function deleteIntent(id: number) {
  return requestClient.delete(`/knowledge/intent/delete?id=${id}`);
}

/** AI 总结生成意图(同步, 含多次 LLM 调用, 约 20~60 秒) */
export function summarizeIntents(kbId: number) {
  return requestClient.post<number>(
    `/knowledge/intent/summarize?kbId=${kbId}`,
    undefined,
    {
      timeout: 180_000,
    },
  );
}
