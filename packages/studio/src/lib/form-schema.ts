// Validation built from the schema (DATA-STUDIO.md P1, "forms built from the
// schema"): required from NOT NULL without a default, enum labels, numbers,
// dates and JSON. The database still has the last word on CHECK constraints
// and domains; its reason comes back as the save's error.

import { z } from "zod";
import type { FieldSchema } from "@marktiderman/genesis-core/schema";
import { choicesFor, editText } from "../values";

export type FormValues = Record<string, string | boolean>;

/** Fields that need a value: NOT NULL and, on a new row, no default. */
export function isRequired(field: FieldSchema, mode: "create" | "edit"): boolean {
  if (field.nullable || field.generated) return false;
  return mode === "edit" || !field.hasDefault;
}

const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function textRule(field: FieldSchema, required: boolean) {
  const choices = choicesFor(field);
  return z.string().superRefine((value, ctx) => {
    if (value === "") {
      if (required) ctx.addIssue({ code: "custom", message: "Required." });
      return;
    }
    if (field.type === "number" && !NUMBER.test(value.trim())) ctx.addIssue({ code: "custom", message: "Enter a number." });
    if (field.widget === "date" && !DATE.test(value)) ctx.addIssue({ code: "custom", message: "Enter a date (YYYY-MM-DD)." });
    if (choices && field.type !== "boolean" && !choices.includes(value)) {
      ctx.addIssue({ code: "custom", message: `Choose one of: ${choices.join(", ")}.` });
    }
    if (field.type === "json") {
      try {
        JSON.parse(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter valid JSON." });
      }
    }
  });
}

export function formSchema(fields: readonly FieldSchema[], mode: "create" | "edit") {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    const required = isRequired(field, mode);
    shape[field.name] = field.type === "boolean" && !field.nullable ? z.boolean() : textRule(field, required);
  }
  return z.object(shape);
}

/** A row's values as form values: booleans stay booleans, everything else is text. */
export function toFormValues(fields: readonly FieldSchema[], row: Record<string, unknown> | undefined): FormValues {
  const out: FormValues = {};
  for (const field of fields) {
    const value = row?.[field.name];
    out[field.name] = field.type === "boolean" && !field.nullable ? value === true || value === "true" : editText(value);
  }
  return out;
}

/** A form value as the value to save. An emptied field is null where null is allowed. */
export function fromFormValue(field: FieldSchema, value: string | boolean): unknown {
  if (typeof value === "boolean") return value;
  if (value === "") return field.nullable ? null : "";
  return value;
}
