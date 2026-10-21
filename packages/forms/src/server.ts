/**
 * Server-side checking. No IO: the app loads the published definition,
 * resolves its server inputs, calls `validateSubmission`, and stores what
 * comes back.
 */
import { createForm, replay, type FormEngine } from "./engine";
import { fieldMap } from "./logic";
import type { FormDefinition, FormEvent, HiddenInput, Json } from "./types";
import { validateField, type FieldValidator } from "./validate";

export interface SubmissionInput {
  /** Answers keyed by field id. Ignored when `events` is given. */
  answers?: Record<string, Json>;
  /** The respondent's event log. Replayed instead of trusting `answers`. */
  events?: FormEvent[];
  /** URL and host inputs sent by the client. Server inputs here are ignored. */
  hidden?: Record<string, Json>;
}

export interface SubmissionOptions {
  /** Values for `source: "server"` inputs, resolved by the server (class, coach, user id…). */
  context?: Record<string, Json>;
  /** `false` checks a draft: formats only, nothing required. Default true. */
  complete?: boolean;
  validators?: Record<string, FieldValidator>;
}

export interface CheckedSubmission {
  status: "draft" | "completed";
  /** Visible answers only, keyed by field id. */
  answers: Record<string, Json>;
  /** Untrusted URL and host inputs, coerced to their declared types. */
  hidden: Record<string, Json>;
  /** Trusted server inputs. */
  context: Record<string, Json>;
  ending: string | null;
  /** Client-sent keys that were dropped: unknown fields, server inputs, undeclared hidden names. */
  ignored: string[];
}

export type SubmissionResult =
  | { ok: true; submission: CheckedSubmission }
  | { ok: false; errors: Record<string, string> };

function coerce(value: Json, type: HiddenInput["type"]): Json | undefined {
  if (type === "string") return typeof value === "string" ? value : String(value);
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function validateSubmission(
  definition: FormDefinition,
  input: SubmissionInput,
  options: SubmissionOptions = {},
): SubmissionResult {
  const ignored: string[] = [];
  const declared = new Map((definition.hidden ?? []).map((h) => [h.name, h]));

  const hidden: Record<string, Json> = {};
  for (const [name, value] of Object.entries(input.hidden ?? {})) {
    const spec = declared.get(name);
    if (!spec || spec.source === "server") {
      ignored.push(`hidden.${name}`);
      continue;
    }
    const coerced = coerce(value, spec.type);
    if (coerced === undefined) ignored.push(`hidden.${name}`);
    else hidden[name] = coerced;
  }
  const context: Record<string, Json> = {};
  for (const [name, value] of Object.entries(options.context ?? {})) {
    const spec = declared.get(name);
    if (spec?.source === "server") {
      const coerced = coerce(value, spec.type);
      if (coerced !== undefined) context[name] = coerced;
    }
  }

  const fields = fieldMap(definition);
  const engineHidden = { ...hidden, ...context };
  let engine: FormEngine;
  if (input.events) {
    for (const e of input.events) if (e.type === "answer" && !fields.has(e.field)) ignored.push(e.field);
    engine = replay(definition, input.events, { hidden: engineHidden, validators: options.validators });
  } else {
    const answers: Record<string, Json> = {};
    for (const [id, value] of Object.entries(input.answers ?? {})) {
      if (fields.has(id)) answers[id] = value;
      else ignored.push(id);
    }
    engine = createForm(definition, {
      initialValues: answers,
      hidden: engineHidden,
      validators: options.validators,
      clock: () => undefined,
    });
  }

  const complete = options.complete !== false;
  if (complete) {
    if (engine.getState().status !== "completed" && !engine.submit()) {
      return { ok: false, errors: engine.getState().errors };
    }
  } else {
    const errors: Record<string, string> = {};
    for (const [id, value] of Object.entries(engine.answers())) {
      const message = validateField(fields.get(id)!, value, {
        requireAnswers: false,
        custom: options.validators?.[id],
      });
      if (message) errors[id] = message;
    }
    if (Object.keys(errors).length) return { ok: false, errors };
  }

  const state = engine.getState();
  const keepHidden = definition.settings?.clearHiddenValues === false;
  const answers: Record<string, Json> = keepHidden
    ? Object.fromEntries(
        Object.entries(state.values).filter((e): e is [string, Json] => e[1] !== undefined && fields.has(e[0])),
      )
    : engine.answers();

  return {
    ok: true,
    submission: {
      status: complete ? "completed" : "draft",
      answers,
      hidden,
      context,
      ending: complete ? state.ending : null,
      ignored,
    },
  };
}

/**
 * The definition as respondents may see it. R1 forms hold nothing secret;
 * assessment answer keys (R4) will be stripped here.
 */
export function publicDefinition(definition: FormDefinition): FormDefinition {
  return JSON.parse(JSON.stringify(definition)) as FormDefinition;
}
