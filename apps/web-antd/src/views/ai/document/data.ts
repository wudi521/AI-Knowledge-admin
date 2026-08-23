import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { getKnowledgeBasePage } from '#/api/ai/knowledge';

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'kbId',
      label: '知识库',
      component: 'ApiSelect',
      componentProps: {
        api: () => getKnowledgeBasePage({ pageNo: 1, pageSize: 100 }),
        labelField: 'name',
        valueField: 'id',
        resultField: 'list',
        placeholder: '请选择知识库',
        allowClear: true,
      },
    },
    {
      fieldName: 'name',
      label: '文档名称',
      component: 'Input',
      componentProps: { placeholder: '搜索文档', clearable: true },
    },
    {
      fieldName: 'parseStatus',
      label: '处理状态',
      component: 'Select',
      componentProps: {
        placeholder: '全部状态',
        allowClear: true,
        options: [
          { label: '待处理', value: 'PENDING' },
          { label: '解析中', value: 'PARSING' },
          { label: '知识构建中', value: 'EXTRACTING' },
          { label: '索引构建中', value: 'EMBEDDING' },
          { label: '待审核', value: 'REVIEW' },
          { label: '待发布', value: 'INDEXED' },
          { label: '已发布', value: 'PUBLISHED' },
          { label: '处理失败', value: 'FAILED' },
        ],
      },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      field: 'name',
      title: '文档名称',
      minWidth: 240,
      showOverflow: true,
      slots: { default: 'name' },
    },
    {
      field: 'kbName',
      title: '所属知识库',
      width: 150,
      showOverflow: true,
    },
    {
      field: 'applicationNo',
      title: '申请号',
      width: 145,
      showOverflow: true,
      formatter: ({ row }: any) => docMetaField(row.domainMetadata, 'applicationNo') || '-',
    },
    {
      field: 'publicationNo',
      title: '公布号',
      width: 145,
      showOverflow: true,
      formatter: ({ row }: any) => docMetaField(row.domainMetadata, 'publicationNo') || '-',
    },
    {
      field: 'type',
      title: '文件类型',
      width: 90,
      slots: { default: 'type' },
    },
    {
      field: 'parseStatus',
      title: '业务状态',
      width: 120,
      slots: { default: 'status' },
    },
    {
      field: 'versionNo',
      title: '当前版本',
      width: 100,
      slots: { default: 'versionNo' },
    },
    {
      field: 'chunkCount',
      title: '知识单元',
      width: 100,
      align: 'center',
      slots: { default: 'chunkCount' },
    },
    {
      field: 'owner',
      title: '上传人',
      width: 110,
    },
    {
      field: 'createTime',
      title: '上传时间',
      width: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'operation',
      title: '操作',
      width: 300,
      slots: { default: 'operation' },
      fixed: 'right',
    },
  ];
}

export function docMetaField(meta: string | undefined, key: string): string {
  if (!meta) return '';
  try {
    const m = JSON.parse(meta);
    const v = m[key];
    return v === undefined || v === null ? '' : String(v);
  } catch {
    return '';
  }
}
