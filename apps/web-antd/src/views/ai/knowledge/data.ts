import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { requestClient } from '#/api/request';

/** 新增/编辑知识库。领域决定后续解析、检索与回答策略，技术参数由平台默认策略托管。 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'id',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'name',
      label: '知识库名称',
      component: 'Input',
      componentProps: {
        placeholder: '例如：专利技术资料库',
        clearable: true,
      },
      rules: 'required',
    },
    {
      fieldName: 'domainCode',
      label: '知识领域',
      component: 'Select',
      componentProps: {
        placeholder: '请选择知识领域',
        options: [
          { label: '通用知识库', value: 'GENERAL' },
          { label: '专利知识库', value: 'PATENT' },
        ],
      },
      defaultValue: 'GENERAL',
      rules: 'required',
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
        placeholder: '不选择表示全部角色可见',
        allowClear: true,
      },
    },
    {
      fieldName: 'effectiveTo',
      label: '有效期至',
      component: 'DatePicker',
      componentProps: {
        placeholder: '不设置表示长期有效',
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
      },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        options: [
          { label: '启用', value: 1 },
          { label: '停用', value: 0 },
        ],
      },
      defaultValue: 1,
    },
    {
      fieldName: 'remark',
      label: '说明',
      component: 'Textarea',
      componentProps: {
        placeholder: '描述知识库用途、资料范围或使用约束',
        rows: 3,
      },
    },
  ];
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'name',
      label: '知识库名称',
      component: 'Input',
      componentProps: {
        placeholder: '搜索知识库',
        clearable: true,
      },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      field: 'name',
      title: '知识库',
      minWidth: 190,
      showOverflow: true,
    },
    {
      field: 'domainCode',
      title: '领域',
      width: 100,
      slots: { default: 'domainCode' },
    },
    {
      field: 'status',
      title: '状态',
      width: 90,
      slots: { default: 'status' },
    },
    {
      field: 'remark',
      title: '说明',
      minWidth: 220,
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
      width: 260,
      slots: { default: 'operation' },
      fixed: 'right',
    },
  ];
}
