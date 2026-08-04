// ---------------------------------------------------------------------------
// Form field types — platform-agnostic definitions used by useResourceForm
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "url"
  | "textarea"
  | "select"
  | "checkbox"
  | "switch"
  | "date"
  | "hidden"
  | "relation"
  | "file"
  | "image"
  | "array";

export interface SelectOption {
  value: string;
  label: string;
}

export interface ResourceFormFieldDef {
  key: string;
  label?: string;
  type?: FieldType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: SelectOption[];
  hidden?: boolean;
  readOnlyOnEdit?: boolean;
  description?: string;
  min?: number;
  max?: number;
  rows?: number;
  /** Relation field configuration. */
  relation?: {
    resource: string;
    labelField: string;
    valueField?: string; // default "id"
    searchable?: boolean;
    allowCreate?: boolean;
  };
  /** Accepted file types, e.g. "image/*", ".pdf,.doc". */
  accept?: string;
  /** Max file size in bytes. Default 10MB. */
  maxSize?: number;
  /** Allow multiple files. */
  multiple?: boolean;
  /** Sub-field definitions for array (child records) fields. */
  arrayFields?: ResourceFormFieldDef[];
  /** Minimum number of array items. */
  arrayMin?: number;
  /** Maximum number of array items. */
  arrayMax?: number;
  /** Group heading for field grouping in the form. */
  group?: string;
  /** Column span in 2-column layout. Default 1. */
  colSpan?: 1 | 2;
  /** Return false to hide this field based on current form values. */
  visible?: (values: Record<string, unknown>) => boolean;
  /** Return true to disable this field based on current form values. */
  disabled?: (values: Record<string, unknown>) => boolean;
}
