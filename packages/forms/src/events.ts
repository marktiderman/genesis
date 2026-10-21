/** Guards and helpers for event logs and other untrusted JSON. No dependencies. */
import type { FormEvent, Json } from "./types";

/** A plain object: `{}` or `Object.create(null)`, not an array, a class instance or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Whether a value is JSON: strings, finite numbers, booleans, null, arrays and
 * plain objects, nested to any depth. Iterative, so a deeply nested value
 * cannot overflow the stack.
 */
export function isJson(value: unknown): value is Json {
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v === "string" || typeof v === "boolean") continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return false;
      continue;
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push(v[i]);
      continue;
    }
    if (!isPlainObject(v)) return false;
    for (const key of Object.keys(v)) stack.push(v[key]);
  }
  return true;
}

const EVENT_TYPES = new Set(["answer", "next", "back", "submit"]);

/** Whether `value` is a well-formed `FormEvent` of a known type. */
export function isFormEvent(value: unknown): value is FormEvent {
  if (!isPlainObject(value) || typeof value.type !== "string" || !EVENT_TYPES.has(value.type)) return false;
  if (value.at !== undefined && !(typeof value.at === "number" && Number.isFinite(value.at))) return false;
  if (value.type !== "answer") return true;
  return (
    typeof value.field === "string" &&
    (value.value === undefined || isJson(value.value)) &&
    (value.source === undefined || value.source === "prefill")
  );
}

/**
 * An event of a type this version does not know, such as one a newer client
 * logs. Replays ignore these, so they are dropped rather than rejected.
 */
export function isUnknownEvent(value: unknown): boolean {
  return isPlainObject(value) && typeof value.type === "string" && !EVENT_TYPES.has(value.type);
}

/**
 * Merge consecutive answer events to the same field, keeping the last value.
 * Text inputs log one event per keystroke; the merged log replays to the same
 * state, because the path is derived from values alone.
 */
export function compactEvents(events: FormEvent[]): FormEvent[] {
  const out: FormEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (event.type === "answer" && last?.type === "answer" && last.field === event.field) {
      out[out.length - 1] = event;
    } else out.push(event);
  }
  return out;
}
