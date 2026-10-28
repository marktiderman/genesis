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
  /** Shown read-only when editing, and never sent by an edit (a create still sends it). */
  readOnlyOnEdit?: boolean;
  /**
   * The column takes null. A left-empty input is then sent as null on an edit and left out of
   * a create (so the column's default applies), text included. Unset, an empty text input
   * keeps sending "" and an empty input of any other type (date, number, select, relation)
   * is treated as nullable, since "" is never a valid value for those.
   */
  nullable?: boolean;
  /** The column has a default: a create leaves an empty input out, text included, so the default applies. */
  hasDefault?: boolean;
  description?: string;
  min?: number;
  max?: number;
  rows?: number;
  /**
   * Longest value accepted by a text-like field (text, email, url, textarea).
   * Validated on save, and the web renderer also sets the input's
   * `maxLength` so the user cannot type past it.
   */
  maxLength?: number;
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
