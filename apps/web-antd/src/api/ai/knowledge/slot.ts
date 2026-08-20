import { requestClient } from '#/api/request';

export namespace AiKnowledgeSlotApi {
  /** 知识库槽位定义 */
  export interface Slot {
    id: number; // 槽位编号
    kbId: number; // 所属知识库编号
    slotCode: string; // 槽位编码(如 brand/faultType/purchaseTime)
    slotName: string; // 槽位名(如 品牌型号)
    description?: string; // 抽取说明(喂给槽位检测 LLM 的定义)
    required: boolean; // 是否必填(1=缺则反问)
    sort?: number; // 排序(组反问句顺序)
    source: 'LLM_AUTO' | 'MANUAL'; // 来源: LLM_AUTO=AI 总结 / MANUAL=手动或编辑过(受保护)
    status: number; // 状态: 0=启用 / 1=停用
    createTime?: string; // 创建时间
  }

  /** 分页查询槽位定义 */
  export interface SlotPageParams {
    kbId?: number;
    slotCode?: string;
    status?: number;
    pageNo?: number;
    pageSize?: number;
  }
}

/** 分页查询槽位定义(管理弹窗用, 取足量) */
export function getSlotPage(params: AiKnowledgeSlotApi.SlotPageParams) {
  return requestClient.get<{ list: AiKnowledgeSlotApi.Slot[]; total: number }>(
    '/knowledge/kb-slot/page',
    { params },
  );
}

/** 新增槽位(手动, source 固定为 MANUAL) */
export function createSlot(data: {
  kbId: number;
  slotCode: string;
  slotName: string;
  description?: string;
  required?: boolean;
  sort?: number;
  status?: number;
}) {
  return requestClient.post<number>('/knowledge/kb-slot/create', data);
}

/** 修改槽位(编辑 LLM_AUTO 槽位后 source 自动翻转为 MANUAL, 不再被 AI 总结覆盖) */
export function updateSlot(data: {
  id: number;
  kbId: number;
  slotCode?: string;
  slotName?: string;
  description?: string;
  required?: boolean;
  sort?: number;
  status?: number;
}) {
  return requestClient.put<boolean>('/knowledge/kb-slot/update', data);
}

/** 删除槽位 */
export function deleteSlot(id: number) {
  return requestClient.delete(`/knowledge/kb-slot/delete?id=${id}`);
}

/** AI 总结生成槽位(同步, 覆盖 LLM_AUTO, MANUAL 保留, 约 20~60 秒) */
export function summarizeSlots(kbId: number) {
  return requestClient.post<number>(
    `/knowledge/kb-slot/summarize?kbId=${kbId}`,
    undefined,
    {
      timeout: 180_000,
    },
  );
}
