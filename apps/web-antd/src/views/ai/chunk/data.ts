import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

/** 片段类型 → Tag 颜色 */
export const CHUNK_TYPE_TAG: Record<string, { color: string; text: string }> = {
  SEMANTIC: { color: 'blue', text: '语义' },
  TABLE: { color: 'orange', text: '表格' },
  FAQ: { color: 'green', text: '问答' },
  POLICY: { color: 'purple', text: '政策' },
};

/** 片段状态 → Tag 颜色 */
export const CHUNK_STATUS_TAG: Record<string, { color: string; text: string }> = {
  PUBLISHED: { color: 'success', text: '已发布' },
  DISABLED: { color: 'default', text: '已禁用' },
};

/** 列表的搜索表单 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'documentId',
      label: '文档编号',
      component: 'Input',
      componentProps: {
        placeholder: '请输入文档编号',
        allowClear: true,
      },
    },
    {
      fieldName: 'chunkType',
      label: '片段类型',
      component: 'Select',
      componentProps: {
        placeholder: '请选择片段类型',
        allowClear: true,
        options: [
          { label: '语义', value: 'SEMANTIC' },
          { label: '表格', value: 'TABLE' },
          { label: '问答', value: 'FAQ' },
          { label: '政策', value: 'POLICY' },
        ],
      },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        placeholder: '请选择状态',
        allowClear: true,
        options: [
          { label: '已发布', value: 'PUBLISHED' },
          { label: '已禁用', value: 'DISABLED' },
        ],
      },
    },
  ];
}

/** 列表的字段 */
export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      field: 'id',
      title: 'Chunk ID',
      width: 100,
    },
    {
      type: 'expand',
      width: 40,
      slots: { content: 'expand_content' },
    },
    {
      field: 'chunkType',
      title: '类型',
      width: 90,
      slots: { default: 'chunkType' },
    },
    {
      field: 'content',
      title: '内容摘要',
      minWidth: 300,
      showOverflow: true,
    },
    {
      field: 'documentId',
      title: '所属文档',
      width: 160,
      showOverflow: true,
      slots: { default: 'documentId' },
    },
    {
      field: 'status',
      title: '状态',
      width: 150,
      align: 'center',
      slots: { default: 'status' },
    },
    {
      field: 'createTime',
      title: '创建时间',
      width: 170,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
