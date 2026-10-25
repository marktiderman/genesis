/**
 * Typed analytics events: the app lists every event and the props each may
 * carry once, and `track(name, props)` accepts nothing else. A prop is a
 * closed list of strings, a number or a boolean, never free text, so an
 * event can't carry a name, an email or a message someone typed.
 *
 * ```ts
 * export const events = defineEvents({
 *   "auth.signed_in": { method: ["email", "apple"] },
 *   "settings.opened": {},
 *   "checkin.saved": { mood: "number", first: "boolean" },
 * });
 * ```
 *
 * At run time an unknown event, an unknown prop or a value outside its list
 * is dropped and reported (a `console.warn` in development, `onInvalid`
 * always), so a bad call is loud and still sends nothing.
 */

/** A closed list of strings, `"number"` (finite) or `"boolean"`. */
export type EventPropSpec = readonly string[] | "number" | "boolean";

/** Every event, by name, with the props it may carry. */
export type EventSchema = Readonly<Record<string, Readonly<Record<string, EventPropSpec>>>>;

type PropValue<S> = S extends readonly (infer L)[] ? L : S extends "number" ? number : S extends "boolean" ? boolean : never;

/** The props of one event: every prop optional, each its spec's type. */
export type EventProps<S extends Readonly<Record<string, EventPropSpec>>> = { readonly [K in keyof S]?: PropValue<S[K]> };

/** What a sink receives: the checked props. */
export type EventValues = Readonly<Record<string, string | number | boolean>>;

// Lower-case words joined by `.` or `_`: `auth.signed_in`, `checkin.saved`.
const EVENT_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const PROP_NAME = /^[a-z][a-z0-9_]*$/;
const MAX_PROPS = 25;
const MAX_LITERAL = 64;

/**
 * Declare the app's events. Checks names (lower-case, dot-separated), prop
 * names, and that each list has at least one short value, and throws listing
 * every problem, so a bad schema fails where it is written.
 *
 * @stability Beta
 */
export function defineEvents<const E extends EventSchema>(schema: E): E {
  const problems: string[] = [];
  for (const [name, props] of Object.entries(schema)) {
    if (!EVENT_NAME.test(name)) problems.push(`"${name}": an event name is lower-case words joined by "." (auth.signed_in)`);
    const keys = Object.keys(props);
    if (keys.length > MAX_PROPS) problems.push(`"${name}": at most ${MAX_PROPS} props`);
    for (const key of keys) {
      const spec = props[key];
      if (!PROP_NAME.test(key)) problems.push(`"${name}".${key}: a prop name is lower-case letters, digits and "_"`);
      if (Array.isArray(spec)) {
        if (spec.length === 0) problems.push(`"${name}".${key}: an empty list allows nothing`);
        for (const v of spec) if (typeof v !== "string" || v.length === 0 || v.length > MAX_LITERAL) problems.push(`"${name}".${key}: "${String(v)}" must be 1-${MAX_LITERAL} characters`);
      } else if (spec !== "number" && spec !== "boolean") {
        problems.push(`"${name}".${key}: a prop is a list of strings, "number" or "boolean" (free text is not allowed)`);
      }
    }
  }
  if (problems.length) throw new Error(`Invalid events:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  return Object.freeze(schema);
}

export type EventCheck = { ok: true; props: EventValues } | { ok: false; problem: string };

/** Check one call against the schema: the props to send, or why nothing is sent. */
export function checkEvent(schema: EventSchema, name: string, props: Readonly<Record<string, unknown>> | undefined): EventCheck {
  if (!Object.prototype.hasOwnProperty.call(schema, name)) return { ok: false, problem: `"${name}" is not in the event schema` };
  const specs = schema[name] ?? {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(specs, key)) return { ok: false, problem: `"${name}" has no prop "${key}"` };
    const spec = specs[key];
    const fits =
      spec === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : spec === "boolean"
          ? typeof value === "boolean"
          : typeof value === "string" && (spec as readonly string[]).includes(value);
    if (!fits) return { ok: false, problem: `"${name}".${key}: ${JSON.stringify(value)} is not allowed` };
    out[key] = value as string | number | boolean;
  }
  return { ok: true, props: out };
}
