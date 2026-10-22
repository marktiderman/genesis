import { getFieldType, isEmptyValue } from "./fields";
import type { FieldBlock, Json } from "./types";

/** The Standard Schema interface (standardschema.dev), as far as validation needs it. */
export interface StandardSchemaV1<T = unknown> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { value: T; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string }> }
      | Promise<unknown>;
  };
}

/** A custom check for one field: a function, or any Standard Schema (Zod, Valibot, ArkType…). */
export type FieldValidator = ((value: Json) => string | null) | StandardSchemaV1;

export const REQUIRED_MESSAGE = "This question needs an answer.";

function runCustom(validator: FieldValidator, value: Json): string | null {
  if (typeof validator === "function") return validator(value);
  const result = validator["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new Error("Async validators are not supported in the engine yet; run them on the server.");
  }
  const issues = (result as { issues?: ReadonlyArray<{ message: string }> }).issues;
  return issues?.length ? issues[0]!.message : null;
}

/**
 * Validate one field's value. `requireAnswers: false` (drafts) checks the
 * format of what was answered without requiring the rest.
 */
export function validateField(
  field: FieldBlock,
  value: Json | undefined,
  options: { requireAnswers?: boolean; custom?: FieldValidator } = {},
): string | null {
  if (isEmptyValue(value, field)) {
    return field.required && options.requireAnswers !== false ? REQUIRED_MESSAGE : null;
  }
  const manifest = getFieldType(field.type);
  // A type with no manifest cannot say what a valid answer is, so none is accepted.
  if (!manifest) return `Unknown field type "${field.type}".`;
  const builtIn = manifest.validate?.(value as Json, field) ?? null;
  if (builtIn) return builtIn;
  return options.custom ? runCustom(options.custom, value as Json) : null;
}
