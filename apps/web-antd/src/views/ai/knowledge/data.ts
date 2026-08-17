import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { requestClient } from '#/api/request';

/** 切分策略 → 中文 */
export const CHUNK_STRATEGY_TEXT: Record<string, string> = {
  Semantic: '语义切分',
  ParentChild: '父子切分',
  Table: '表格切分',
  FAQ: '问答切分',
  Policy: '条款切分',
};

/** 新增/编辑 表单 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'id',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'name',
      label: '名称',
      component: 'Input',
      componentProps: {
        placeholder: '请输入知识库名称',
        clearable: true,
      },
      rules: 'required',
    },
    {
      fieldName: 'chunkStrategy',
      label: '切分策略',
      component: 'Select',
      componentProps: {
        placeholder: '请选择切分策略',
        options: [
          { label: '语义切分 (Semantic)', value: 'Semantic' },
          { label: '父子切分 (ParentChild)', value: 'ParentChild' },
          { label: '表格切分 (Table)', value: 'Table' },
          { label: '问答切分 (FAQ)', value: 'FAQ' },
          { label: '条款切分 (Policy)', value: 'Policy' },
        ],
      },
      defaultValue: 'ParentChild',
    },
    {
      fieldName: 'embedModel',
      label: 'Embedding 模型',
      component: 'Select',
      componentProps: {
        placeholder: '请选择 Embedding 模型',
        options: [
          { label: 'BGE-M3', value: 'BGE-M3' },
          { label: 'TextEmbedding-3-v2', value: 'TextEmbedding-3-v2' },
        ],
      },
      defaultValue: 'BGE-M3',
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        options: [
          { label: '启用', value: 1 },
          { label: '禁用', value: 0 },
        ],
      },
      defaultValue: 1,
    },
    {
      fieldName: 'visibleRoles',
      label: '可见角色',
      component: 'ApiSelect',
      componentProps: {
        multiple: true,
        mode: 'multiple',
        api: () => requestClient.get('/system/role/list-all-simple'),
        labelField: 'name',
        valueField: 'code',
        placeholder: '选择可见角色(空=全部可见)',
        allowClear: true,
      },
      // 前端为数组, 提交前在 form.vue join 为逗号分隔字符串; 回显时 split
    },
    {
      fieldName: 'effectiveTo',
      label: '有效期至',
      component: 'DatePicker',
      componentProps: {
        placeholder: '选择有效期(空=永久有效)',
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: {
        placeholder: '请输入备注',
        rows: 3,
      },
    },
  ];
}

/** 列表搜索表单 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'name',
      label: '名称',
      component: 'Input',
      componentProps: {
        placeholder: '请输入知识库名称',
        clearable: true,
      },
    },
  ];
}

/** 列表列 */
export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      field: 'id',
      title: '编号',
      width: 80,
    },
    {
      field: 'name',
      title: '名称',
      minWidth: 160,
      showOverflow: true,
    },
    {
      field: 'chunkStrategy',
      title: '切分策略',
      minWidth: 130,
      slots: { default: 'chunkStrategy' },
    },
    {
      field: 'embedModel',
      title: 'Embedding 模型',
      minWidth: 140,
    },
    {
      field: 'status',
      title: '状态',
      width: 90,
      slots: { default: 'status' },
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 160,
      showOverflow: true,
    },
    {
      field: 'visibleRoles',
      title: '可见角色',
      minWidth: 150,
      showOverflow: true,
    },
    {
      field: 'effectiveTo',
      title: '有效期至',
      width: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'createTime',
      title: '创建时间',
      width: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'operation',
      title: '操作',
      width: 140,
      slots: { default: 'operation' },
      fixed: 'right',
    },
  ];
}
