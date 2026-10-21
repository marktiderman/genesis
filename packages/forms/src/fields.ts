import type { FieldBlock, Json, Operator } from "./types";

/**
 * A field type, without any UI. Renderers are registered separately per
 * platform (`genesis-forms-react`), so a manifest runs anywhere.
 */
export interface FieldTypeManifest {
  type: string;
  label: string;
  category: "text" | "choice" | "scale" | "date" | "media" | "advanced";
  /** `json: false` types must convert, so drafts and server replay never lose an answer. */
  value:
    | { json: true }
    | { json: false; serialize: (value: unknown) => Json; deserialize: (json: Json) => unknown };
  operators: Operator[];
  a11y: { semantics: "control" | "group"; autocomplete?: string };
  isEmpty?: (value: Json | undefined) => boolean;
  /** Return an error message, or null when the (non-empty) value is valid. */
  validate?: (value: Json, field: FieldBlock) => string | null;
  /** Plain text for recall, exports and emails. */
  summarize?: (value: Json, field: FieldBlock) => string;
}

// One registry per process, shared by every entry point (index, server,
// testing are bundled separately), so a plugin registered once is seen by all.
const REGISTRY = Symbol.for("@marktiderman/genesis-forms/field-types");
const globalScope = globalThis as typeof globalThis & { [REGISTRY]?: Map<string, FieldTypeManifest> };
const registry: Map<string, FieldTypeManifest> = (globalScope[REGISTRY] ??= new Map());

export function registerFieldType(manifest: FieldTypeManifest): void {
  if (!manifest.type) throw new Error("registerFieldType: a field type needs a `type`.");
  const value = manifest.value as { json: boolean; serialize?: unknown; deserialize?: unknown };
  if (
    !value.json &&
    (typeof value.serialize !== "function" || typeof value.deserialize !== "function")
  ) {
    throw new Error(
      `registerFieldType: "${manifest.type}" stores a non-JSON value, so it must provide both serialize and deserialize.`,
    );
  }
  registry.set(manifest.type, manifest);
}

export function getFieldType(type: string): FieldTypeManifest | undefined {
  return registry.get(type);
}

export function listFieldTypes(): FieldTypeManifest[] {
  return [...registry.values()];
}

export function isEmptyValue(value: Json | undefined, field?: FieldBlock): boolean {
  const manifest = field ? registry.get(field.type) : undefined;
  if (manifest?.isEmpty) return manifest.isEmpty(value);
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function summarizeValue(value: Json | undefined, field: FieldBlock): string {
  if (isEmptyValue(value, field)) return "";
  const manifest = registry.get(field.type);
  if (manifest?.summarize) return manifest.summarize(value as Json, field);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

// ── Built-in types (R1) ──────────────────────────────────────────────────────

export interface ChoiceOption {
  value: string;
  label?: string;
}

export function choiceOptions(field: FieldBlock): ChoiceOption[] {
  const raw = field.props?.options;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) =>
    o && typeof o === "object" && !Array.isArray(o) && typeof o.value === "string"
      ? [{ value: o.value, label: typeof o.label === "string" ? o.label : undefined }]
      : [],
  );
}

function optionLabel(field: FieldBlock, value: string): string {
  const option = choiceOptions(field).find((o) => o.value === value);
  return option?.label ?? value;
}

function intRange(field: FieldBlock, min: number, maxDefault: number) {
  const max = typeof field.props?.max === "number" ? field.props.max : maxDefault;
  return { min, max };
}

const numberOps: Operator[] = ["eq", "neq", "lt", "lte", "gt", "gte", "in", "answered", "empty"];
const textOps: Operator[] = ["eq", "neq", "contains", "answered", "empty"];

function maxLength(field: FieldBlock, fallback: number): number {
  return typeof field.props?.maxLength === "number" ? field.props.maxLength : fallback;
}

function textValidate(fallback: number) {
  return (value: Json, field: FieldBlock) => {
    if (typeof value !== "string") return "Enter text.";
    const limit = maxLength(field, fallback);
    return value.length > limit ? `Keep it under ${limit} characters.` : null;
  };
}

const builtins: FieldTypeManifest[] = [
  {
    type: "short-text",
    label: "Short text",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control" },
    validate: textValidate(500),
  },
  {
    type: "long-text",
    label: "Long text",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control" },
    validate: textValidate(5000),
  },
  {
    type: "email",
    label: "Email",
    category: "text",
    value: { json: true },
    operators: textOps,
    a11y: { semantics: "control", autocomplete: "email" },
    validate: (value) =>
      typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ? null
        : "Enter an email address like name@example.com.",
  },
  {
    type: "rating",
    label: "Rating",
    category: "scale",
    value: { json: true },
    operators: numberOps,
    a11y: { semantics: "group" },
    validate: (value, field) => {
      const { min, max } = intRange(field, 1, 5);
      return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
        ? null
        : `Choose a rating from ${min} to ${max}.`;
    },
    summarize: (value, field) => `${value}/${intRange(field, 1, 5).max}`,
  },
  {
    type: "nps",
    label: "Net Promoter Score",
    category: "scale",
    value: { json: true },
    operators: numberOps,
    a11y: { semantics: "group" },
    validate: (value) =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10
        ? null
        : "Choose a score from 0 to 10.",
    summarize: (value) => `${value}/10`,
  },
  {
    type: "single-choice",
    label: "Single choice",
    category: "choice",
    value: { json: true },
    operators: ["eq", "neq", "in", "answered", "empty"],
    a11y: { semantics: "group" },
    validate: (value, field) =>
      typeof value === "string" && choiceOptions(field).some((o) => o.value === value)
        ? null
        : "Choose one of the options.",
    summarize: (value, field) => optionLabel(field, String(value)),
  },
  {
    type: "multi-choice",
    label: "Multiple choice",
    category: "choice",
    value: { json: true },
    operators: ["contains", "answered", "empty"],
    a11y: { semantics: "group" },
    validate: (value, field) => {
      const allowed = new Set(choiceOptions(field).map((o) => o.value));
      return Array.isArray(value) && value.every((v) => typeof v === "string" && allowed.has(v))
        ? null
        : "Choose from the options.";
    },
    summarize: (value, field) =>
      (value as string[]).map((v) => optionLabel(field, v)).join(", "),
  },
  {
    type: "yes-no",
    label: "Yes / no",
    category: "choice",
    value: { json: true },
    operators: ["eq", "neq", "answered", "empty"],
    a11y: { semantics: "group" },
    validate: (value) => (typeof value === "boolean" ? null : "Choose yes or no."),
    summarize: (value) => (value ? "Yes" : "No"),
  },
];

for (const manifest of builtins) registerFieldType(manifest);
