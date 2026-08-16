import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace ModelApi {
  /** 模型配置 */
  export interface ModelConfig {
    id?: number;
    name: string;
    type: string;
    provider?: string;
    modelName: string;
    baseUrl?: string;
    apiKey?: string;
    dimensions?: number;
    status?: number;
    remark?: string;
    createTime?: string;
  }
}

/** 查询模型配置分页 */
export function getModelConfigPage(
  params: PageParam & { name?: string; type?: string },
) {
  return requestClient.get<PageResult<ModelApi.ModelConfig>>(
    '/model/model-config/page',
    { params },
  );
}

/** 查询指定类型的已启用模型列表(下拉用) */
export function getModelListByType(type: string) {
  return requestClient.get<ModelApi.ModelConfig[]>(
    `/model/model-config/list?type=${type}`,
  );
}

/** 创建模型配置 */
export function createModelConfig(data: ModelApi.ModelConfig) {
  return requestClient.post('/model/model-config/create', data);
}

/** 更新模型配置 */
export function updateModelConfig(data: ModelApi.ModelConfig) {
  return requestClient.put('/model/model-config/update', data);
}

/** 删除模型配置 */
export function deleteModelConfig(id: number) {
  return requestClient.delete(`/model/model-config/delete?id=${id}`);
}
