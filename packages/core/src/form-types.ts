// ---------------------------------------------------------------------------
// Form field types — platform-agnostic definitions used by useResourceForm
// ---------------------------------------------------------------------------

export type FieldType =
  | "text"
  | "number"
  | "email"
  /** A phone number: `type="tel"` and the phone keypad. Stored as text. */
  | "tel"
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
  /**
   * The browser's autofill token (`name`, `given-name`, `email`, `tel`, `street-address`,
   * `one-time-code`, `off`, ...). Unset, the input carries no `autocomplete` attribute, whatever
   * its type, so the browser applies its own heuristics (it may still offer to fill it). Set a
   * token on forms about the viewer (sign-up, their own profile), and `off` on a form about
   * someone else (an admin editing a member).
   */
  autoComplete?: string;
  /**
   * Which on-screen keyboard a phone shows. Unset, it follows the type: `email`, `tel`, `url`,
   * and, for a number with `min >= 0`, `decimal` (which has no minus key, so a number that can be
   * negative keeps the browser's own keyboard).
   */
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  /** The label on the keyboard's Return key (`next`, `done`, `go`, `search`, `send`). */
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
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
