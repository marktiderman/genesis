/**
 * The form definition format. Everything here is plain JSON: a definition can
 * be stored, diffed, versioned and evaluated identically in a browser, in
 * React Native and on a server.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface FieldBlock {
  kind: "field";
  /** Immutable. Answers are keyed by this. */
  id: string;
  /** Human / export name. Renamable. Used by recall and the builders. */
  key: string;
  /** Registry key: "rating", "short-text", "acme/signature". */
  type: string;
  /** Supports recall: `{{field:name|there}}`. */
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  /**
   * Personal or secret data (an SSN, a health detail). Tools such as devtools
   * mask it. `props.sensitive: true` is read as an alias; see `isSensitive`.
   */
  sensitive?: boolean;
  props?: Record<string, Json>;
}

export interface ContentBlock {
  kind: "content";
  id: string;
  type: "heading" | "text";
  text: string;
}

export interface PageBreakBlock {
  kind: "page-break";
  id: string;
  title?: string;
}

export type Block = FieldBlock | ContentBlock | PageBreakBlock;

/**
 * A typed value that does not come from a question.
 * - `url`: read from the query string. Untrusted.
 * - `host`: passed by the app hosting the form. Untrusted.
 * - `server`: resolved by the server when the form loads and again on
 *   submit. Never read from the client.
 */
export interface HiddenInput {
  name: string;
  type: "string" | "number" | "boolean";
  source: "url" | "host" | "server";
}

export type Operator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "contains"
  | "answered"
  | "empty";

export type Operand = { field: string } | { hidden: string } | { value: Json };

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { op: Operator; left: Operand; right?: Operand };

export type LogicRule =
  | { id: string; when: Condition; effect: "show" | "hide"; target: string }
  | { id: string; when: Condition; effect: "jump"; from: string; to: string | { ending: string } };

export interface Ending {
  id: string;
  title: string;
  description?: string;
}

export interface FormSettings {
  /** Store no identifying metadata with responses. The app's store enforces it. */
  anonymous?: boolean;
  /** Clear the values of fields hidden by logic on submit. Default true. */
  clearHiddenValues?: boolean;
}

export type FormLayout = { mode: "classic" } | { mode: "focus" };

export interface FormDefinition {
  /** Version of the definition format itself. */
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  layout?: FormLayout;
  blocks: Block[];
  hidden?: HiddenInput[];
  logic?: LogicRule[];
  endings?: Ending[];
  settings?: FormSettings;
  /** Free for apps and plugins; preserved round-trip. */
  meta?: Record<string, Json>;
}

/** One thing a respondent did. A response is the replay of its events. */
export type FormEvent =
  | {
      type: "answer";
      field: string;
      value: Json | undefined;
      at?: number;
      /** `"prefill"`: set by `initialValues` when the form was created, not typed by the respondent. */
      source?: "prefill";
    }
  | { type: "next"; at?: number }
  | { type: "back"; at?: number }
  | { type: "submit"; at?: number };
