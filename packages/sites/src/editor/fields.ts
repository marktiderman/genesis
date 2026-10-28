/**
 * Editor fields from a section's JSON Schema (`sectionJsonSchema`, the zod
 * schema's input side), so a new section gets its fields with no editor
 * change:
 *
 * - `x-genesis-kind: "image"` (or any object with `src` and `alt`) → the
 *   image picker, which asks for alt text;
 * - `x-genesis-kind: "rich-text"` → the Genesis rich text editor;
 * - `x-genesis-kind: "slot"` → a Puck slot (nested sections);
 * - an enum, or a union of constants → a select;
 * - a boolean → a yes/no radio; a number → a number input;
 * - a string → text, or a textarea when it may run past 160 characters;
 * - an object → its fields (a record keyed by an enum, such as
 *   `z.partialRecord(Day, …)`, gets one optional field per key); an array of
 *   objects → a list of them; an array of strings → one per line.
 *
 * A prop marked `.meta({ deprecated: true })` gets no field: the schema still
 * accepts it, and a migration moves it.
 *
 * Anything else gets a field that says it can't be edited here, and a
 * warning in the console, so a gap is visible rather than silent.
 */
import type { Field, Fields } from "@puckeditor/core";
import type { AnySectionDefinition } from "../core/registry";
import { sectionJsonSchema } from "../core/registry";
import { NODE_KEYS } from "./data";
import { ImageField, ImageSrcField, LinesField, RichTextField, UnsupportedField } from "./field-components";

type JsonSchema = Record<string, unknown> & {
  type?: string | string[];
  title?: string;
  properties?: Record<string, JsonSchema>;
  propertyNames?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  default?: unknown;
  format?: string;
  "x-genesis-kind"?: string;
  "x-genesis-allow"?: string[];
  deprecated?: boolean;
};

/** Building-block titles that say what a value is, not what it's for: the key names it better. */
const GENERIC_TITLES = new Set(["Link", "Image", "Rich text"]);

/** `primaryCta` → "Primary CTA"; `hideOn` → "Hide on". */
export function humanize(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w === "href" ? "link" : w === "cta" || w === "seo" || w === "faq" || w === "url" ? w.toUpperCase() : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const labelFor = (key: string, schema: JsonSchema) => (schema.title && !GENERIC_TITLES.has(schema.title) ? schema.title : humanize(key));

const typeOf = (schema: JsonSchema): string | undefined => (Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type);

export const isImageSchema = (schema: JsonSchema): boolean =>
  schema["x-genesis-kind"] === "image" || (typeOf(schema) === "object" && Boolean(schema.properties?.src) && Boolean(schema.properties?.alt));

const SUMMARY_KEYS = ["title", "name", "label", "question", "heading", "value", "quote", "caption", "alt"];

function summaryOf(item: Record<string, unknown> | undefined, index?: number): string {
  for (const key of SUMMARY_KEYS) {
    const v = item?.[key];
    if (typeof v === "string" && v.trim()) return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  }
  return `Item ${(index ?? 0) + 1}`;
}

/** The empty value a new list item starts with, from its schema's defaults. */
function defaultValue(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  const t = typeOf(schema);
  if (t === "object" && schema.properties && !isImageSchema(schema)) {
    const out: Record<string, unknown> = {};
    for (const key of schema.required ?? []) {
      const v = defaultValue(schema.properties[key] ?? {});
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  if (t === "string" && !schema.enum) return "";
  if (t === "array") return [];
  return undefined;
}

export interface FieldContext {
  /** Where a gap is reported: `hero.image`. */
  path: string;
  /** Collected paths no field could be made for. */
  unsupported: string[];
  /** Collected slot keys (top level only). */
  slots: string[];
  /** Section types a slot may hold, when its schema doesn't say. */
  slotAllow?: string[];
}

/** Select options; an optional value gets an empty choice, named after the schema's default when it has one. */
function options(values: readonly unknown[], required: boolean, fallback?: unknown) {
  const opts = values.map((v) => ({ label: typeof v === "string" ? humanize(v) : String(v), value: v as string | number | boolean }));
  const empty = fallback === undefined ? "None" : `Default (${typeof fallback === "string" ? humanize(fallback).toLowerCase() : String(fallback)})`;
  return required ? opts : [{ label: empty, value: "" }, ...opts];
}

/** One field for one property, or a field that says it can't be edited. */
export function fieldFor(key: string, schema: JsonSchema, required: boolean, ctx: FieldContext): Field {
  const label = labelFor(key, schema);
  const path = ctx.path ? `${ctx.path}.${key}` : key;
  const kind = schema["x-genesis-kind"];

  if (kind === "slot") {
    // Only a section's own props become slots (data.ts reads and writes them at the top level); a slot inside an
    // object or a list item has no path there yet, so it is reported, not edited.
    if (ctx.path !== "") {
      ctx.unsupported.push(path);
      return { type: "custom", label, render: UnsupportedField };
    }
    ctx.slots.push(key);
    return { type: "slot", label, ...((schema["x-genesis-allow"] ?? ctx.slotAllow) ? { allow: schema["x-genesis-allow"] ?? ctx.slotAllow } : {}) };
  }
  if (kind === "rich-text") return { type: "custom", label, render: RichTextField };
  if (isImageSchema(schema)) return { type: "custom", label, render: ImageField, metadata: { required } };

  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    const consts = union.filter((s) => "const" in s).map((s) => s.const);
    if (consts.length === union.length && consts.length > 0) return { type: "select", label, options: options(consts, required, schema.default) };
    const branch = union.find((s) => typeOf(s) !== "null");
    if (branch) return fieldFor(key, { ...branch, title: schema.title ?? branch.title }, required, ctx);
  }
  if (schema.enum) return { type: "select", label, options: options(schema.enum, required, schema.default) };

  switch (typeOf(schema)) {
    case "boolean":
      return {
        type: "radio",
        label,
        // Shown when the prop is unset, so the radio says what the section does.
        metadata: { default: schema.default === true },
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      };
    case "number":
    case "integer":
      return {
        type: "number",
        label,
        ...(typeof schema.minimum === "number" ? { min: schema.minimum } : typeof schema.exclusiveMinimum === "number" ? { min: schema.exclusiveMinimum + (typeOf(schema) === "integer" ? 1 : 0) } : {}),
        ...(typeof schema.maximum === "number" ? { max: schema.maximum } : {}),
        ...(typeOf(schema) === "integer" ? { step: 1 } : {}),
      };
    case "string":
      return {
        type: schema.format !== "uri-reference" && (schema.maxLength ?? 0) > 160 ? "textarea" : "text",
        label,
        ...(schema.format === "uri-reference" ? { placeholder: "/about, #section or https://…" } : {}),
      };
    case "object": {
      const keyed = enumKeyedProperties(schema);
      if (keyed) return { type: "object", label, objectFields: objectFields({ ...schema, properties: keyed, required: [] }, { ...ctx, path }) };
      if (!schema.properties) break;
      return { type: "object", label, objectFields: objectFields(schema, { ...ctx, path }) };
    }
    case "array": {
      const items = schema.items ?? {};
      if (typeOf(items) === "string") return { type: "custom", label, render: LinesField, metadata: { maxItems: schema.maxItems } };
      if (typeOf(items) === "object" && items.properties) {
        const arrayFields = isImageSchema(items) ? imageItemFields(items, { ...ctx, path: `${path}[]` }) : objectFields(items, { ...ctx, path: `${path}[]` });
        return {
          type: "array",
          label,
          arrayFields,
          defaultItemProps: (defaultValue(items) ?? {}) as Record<string, unknown>,
          getItemSummary: (item: Record<string, unknown>, index?: number) => summaryOf(item, index),
          ...(typeof schema.minItems === "number" ? { min: schema.minItems } : {}),
          ...(typeof schema.maxItems === "number" ? { max: schema.maxItems } : {}),
        };
      }
      break;
    }
  }
  ctx.unsupported.push(path);
  return { type: "custom", label, render: UnsupportedField };
}

/** A record keyed by an enum (`z.partialRecord(Day, Line(20))`): one optional property per key, or null when it isn't one. */
function enumKeyedProperties(schema: JsonSchema): Record<string, JsonSchema> | null {
  const keys = schema.propertyNames?.enum;
  const value = schema.additionalProperties;
  if (schema.properties || !keys?.length || !keys.every((k) => typeof k === "string") || !value || typeof value !== "object") return null;
  return Object.fromEntries((keys as string[]).map((k) => [k, value]));
}

function objectFields(schema: JsonSchema, ctx: FieldContext): Record<string, Field> {
  const required = new Set(schema.required ?? []);
  const out: Record<string, Field> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    // A deprecated prop (`.meta({ deprecated: true })`) is still accepted, but nobody should type into it.
    if (prop.deprecated === true) continue;
    out[key] = fieldFor(key, prop, required.has(key), ctx);
  }
  return out;
}

/** A list item that is itself an image (a gallery photo): the picker for `src`, then its other fields. */
function imageItemFields(schema: JsonSchema, ctx: FieldContext): Record<string, Field> {
  const out: Record<string, Field> = {
    src: { type: "custom", label: "Image", render: ImageSrcField },
    alt: { type: "textarea", label: "Alt text (what the image shows)" },
    decorative: {
      type: "radio",
      label: "Decorative (no alt text needed)",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  };
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (["src", "alt", "decorative", "width", "height", "focal"].includes(key)) continue;
    out[key] = fieldFor(key, prop, required.has(key), ctx);
  }
  return out;
}

export interface SectionFields {
  fields: Fields;
  /** Props that hold nested sections (Puck slots). */
  slotKeys: string[];
  /** Props no field could be made for (shown as "can't be edited here"). */
  unsupported: string[];
}

const warned = new Set<string>();

/**
 * Every field of a section: its layout (variant) first, then its props from
 * the JSON Schema, then where it shows.
 *
 * @stability Beta
 */
export function sectionFields(def: AnySectionDefinition, options: { slotAllow?: string[] } = {}): SectionFields {
  const schema = sectionJsonSchema(def) as JsonSchema;
  const ctx: FieldContext = { path: "", unsupported: [], slots: [], ...(options.slotAllow ? { slotAllow: options.slotAllow } : {}) };
  const fields: Record<string, Field> = {};
  if (def.variants.length > 1) {
    fields._variant = { type: "select", label: "Layout", options: def.variants.map((v) => ({ label: v.label, value: v.id })) };
  }
  for (const reserved of NODE_KEYS) {
    if (schema.properties?.[reserved]) throw new Error(`Section "${def.type}" has a prop named "${reserved}", which the editor reserves.`);
  }
  Object.assign(fields, objectFields(schema, ctx));
  fields._hidden = {
    type: "radio",
    label: "Visibility",
    options: [
      { label: "Shown", value: false },
      { label: "Hidden (kept, never published)", value: true },
    ],
  };
  fields._hideOn = {
    type: "select",
    label: "Show on",
    options: [
      { label: "Every screen", value: "none" },
      { label: "Wider screens only", value: "mobile" },
      { label: "Phones only", value: "desktop" },
    ],
  };
  if (ctx.unsupported.length) {
    const key = `${def.type}:${ctx.unsupported.join(",")}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[genesis-sites/editor] section "${def.type}": no editor field for ${ctx.unsupported.join(", ")}; those props show as "can't be edited here".`);
    }
  }
  return { fields: fields as Fields, slotKeys: ctx.slots, unsupported: ctx.unsupported };
}
