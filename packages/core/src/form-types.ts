// ---------------------------------------------------------------------------
// Form field types — platform-agnostic definitions used by useResourceForm
// ---------------------------------------------------------------------------

import type { FilterParam } from "./provider/types";

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
   * a create (so the column's default applies), text included. `false`: an empty text input keeps
   * sending "" (left out of a create when `hasDefault`), while an empty input of another type is
   * handled as for `true`, since "" is never a valid value for those. Unset, the form doesn't know
   * the column: every empty input is sent as it is ("" or undefined), on a create and an edit.
   */
  nullable?: boolean;
  /**
   * The column has a default: a create leaves an empty input out, text included, so the default
   * applies. Acts only when `nullable` is set.
   */
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
  /**
   * A link's picker: lists `resource` through the data provider (its row-level security), searched
   * and paged on the server, and stores the picked row's `valueField`.
   */
  relation?: {
    resource: string;
    /** The linked field that names a row. Unset: the provider's `describe`, else a name-like field. */
    labelField?: string;
    valueField?: string; // default "id"
    /** Show the search box. Default: once there are more than ten rows, or more pages. */
    searchable?: boolean;
    allowCreate?: boolean;
    /** The linked fields a search matches. Default: `labelField`. */
    searchFields?: string[];
    /**
     * Filters every list request carries (the linked view's scope and default filter), fixed or
     * from the form's values, for a picker that follows another field.
     */
    filters?: FilterParam[] | ((values: Readonly<Record<string, unknown>>) => FilterParam[]);
    /** The words for a picked row the viewer can't see, or that's gone. Never its raw id. */
    missingLabel?: string;
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
