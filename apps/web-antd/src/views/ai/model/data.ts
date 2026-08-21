import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

const TYPE_OPTIONS = [
  { label: '对话 (chat)', value: 'chat' },
  { label: '向量 (embedding)', value: 'embedding' },
  { label: '重排 (rerank)', value: 'rerank' },
];

const PROVIDER_OPTIONS = [
  { label: 'OLLAMA(本地)', value: 'OLLAMA' },
  { label: 'XINFERENCE(本地)', value: 'XINFERENCE' },
  { label: 'OPENAI', value: 'OPENAI' },
  { label: 'ALIYUN', value: 'ALIYUN' },
  { label: 'DEEPSEEK', value: 'DEEPSEEK' },
];

/** 新增/编辑 表单 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'name',
      label: '名称',
      component: 'Input',
      componentProps: { placeholder: '如：BGE-M3 本地', clearable: true },
      rules: 'required',
    },
    {
      fieldName: 'type',
      label: '类型',
      component: 'Select',
      componentProps: { options: TYPE_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'scenario',
      label: '场景标识',
      component: 'Input',
      componentProps: {
        placeholder: '如 A/B; *=默认场景',
        clearable: true,
      },
      defaultValue: '*',
    },
    {
      fieldName: 'priority',
      label: '降级优先级',
      component: 'InputNumber',
      componentProps: { placeholder: '小者优先', min: 0 },
      defaultValue: 0,
    },
    {
      fieldName: 'provider',
      label: '供应商',
      component: 'Select',
      componentProps: { options: PROVIDER_OPTIONS, allowClear: true },
      defaultValue: 'OLLAMA',
    },
    {
      fieldName: 'modelName',
      label: '模型标识',
      component: 'Input',
      componentProps: { placeholder: '如：bge-m3 / deepseek-chat', clearable: true },
      rules: 'required',
    },
    {
      fieldName: 'baseUrl',
      label: '服务地址',
      component: 'Input',
      componentProps: {
        placeholder: '如：http://127.0.0.1:11434',
        clearable: true,
      },
    },
    {
      fieldName: 'apiKey',
      label: 'API 密钥',
      component: 'Input',
      componentProps: { placeholder: '云 API 需要，本地模型可空', clearable: true },
    },
    {
      fieldName: 'dimensions',
      label: '向量维度',
      component: 'InputNumber',
      componentProps: { placeholder: 'embedding 类型填写', min: 0 },
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
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: { placeholder: '请输入备注', rows: 2 },
    },
  ];
}

/** 列表搜索 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'name',
      label: '名称',
      component: 'Input',
      componentProps: { placeholder: '请输入名称', clearable: true },
    },
    {
      fieldName: 'type',
      label: '类型',
      component: 'Select',
      componentProps: {
        placeholder: '全部类型',
        options: TYPE_OPTIONS,
        allowClear: true,
      },
    },
  ];
}

/** 列表列 */
export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    { field: 'id', title: '编号', width: 80 },
    {
      field: 'name',
      title: '名称',
      minWidth: 130,
      showOverflow: true,
    },
    {
      field: 'type',
      title: '类型',
      width: 100,
      slots: { default: 'type' },
    },
    {
      field: 'scenario',
      title: '场景标识',
      width: 100,
      showOverflow: true,
    },
    {
      field: 'priority',
      title: '降级优先级',
      width: 100,
    },
    {
      field: 'provider',
      title: '供应商',
      width: 110,
    },
    {
      field: 'modelName',
      title: '模型标识',
      minWidth: 140,
      showOverflow: true,
    },
    {
      field: 'dimensions',
      title: '维度',
      width: 80,
    },
    {
      field: 'status',
      title: '状态',
      width: 90,
      slots: { default: 'status' },
    },
    {
      field: 'baseUrl',
      title: '服务地址',
      minWidth: 180,
      showOverflow: true,
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 120,
      showOverflow: true,
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
