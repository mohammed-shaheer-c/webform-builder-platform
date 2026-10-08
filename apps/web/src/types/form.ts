export type FieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'date';

export type FieldOption =
  | string
  | {
      label: string;
      value: string;
    };

export interface ConditionalVisibility {
  field: string;
  equals: unknown;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: FieldOption[];
  defaultValue?: unknown;
  visibleWhen?: ConditionalVisibility;
}

export interface FormSchema {
  fields: FormField[];
}

export interface PublicFormResponse {
  id: string;
  name: string;
  version: number;
  formVersionId: string;
  schema: FormSchema;
  publishedAt: string;
}

export interface SubmissionResponse {
  id: string;
  formId: string;
  formVersionId: string;
  createdAt: string;
  message: string;
}
