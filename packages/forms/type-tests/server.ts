// Options passed straight through from a consumer's own optional values must
// type-check with exactOptionalPropertyTypes on.
import { createForm, f, type FieldValidator, type Json } from "@marktiderman/genesis-forms";
import { validateSubmission, type SubmissionInput } from "@marktiderman/genesis-forms/server";
import { form } from "./exact-optional";

declare const maybe: {
  context?: Record<string, Json>;
  complete?: boolean;
  validators?: Record<string, FieldValidator>;
  maxEvents?: number;
  hidden?: Record<string, Json>;
  answers?: Record<string, Json>;
  description?: string;
  identifying?: boolean;
};

const input: SubmissionInput = { answers: maybe.answers, events: undefined, hidden: maybe.hidden };
export const result = validateSubmission(form.definition, input, {
  context: maybe.context,
  complete: maybe.complete,
  validators: maybe.validators,
  maxEvents: maybe.maxEvents,
});

export const engine = createForm(form.definition, {
  initialValues: maybe.answers,
  hidden: maybe.hidden,
  validators: maybe.validators,
  clock: undefined,
});

export const fields = [
  f.shortText("name", { label: "Name", description: maybe.description, identifying: maybe.identifying }),
  f.rating("score", { label: "Score", max: undefined }),
];
export const member = f.hidden.string({ source: "server", identifying: maybe.identifying });
