// Options passed straight through from a consumer's own optional values must
// type-check with exactOptionalPropertyTypes on.
import { createForm, f, type FieldValidator, type Json } from "@marktiderman/genesis-forms";
import {
  allow,
  createEditSecretReader,
  editLinkUrl,
  isEditLinkRequest,
  validateSubmission,
  type RateLimitStore,
  type SubmissionInput,
} from "@marktiderman/genesis-forms/server";
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

declare const optional: {
  now?: number;
  ttlSeconds?: number;
  param?: string;
  isFormPage?: (url: URL) => boolean;
  log?: (message: string) => void;
  message?: string;
};
declare const store: RateLimitStore;
export const link = editLinkUrl("/f/a", { id: "x", nonce: "y" }, undefined, {
  now: optional.now,
  ttlSeconds: optional.ttlSeconds,
  param: optional.param,
});
export const isEdit = isEditLinkRequest(new URL("https://x.test/f/a"), { param: optional.param, isFormPage: optional.isFormPage });
export const readSecret = createEditSecretReader({ variable: "FORM_EDIT_SECRET", log: optional.log });
export const allowed = allow(store, { key: "k", limit: 1, windowSeconds: 1 }, { log: optional.log, message: optional.message });
