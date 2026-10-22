import { isFormEvent, type FormDefinition, type FormEvent, type Json } from "@marktiderman/genesis-forms";

/** Messages between the playground shell and the device-frame iframe (same origin only). */
export type ShellToFrame = {
  type: "gf:load";
  definition: FormDefinition;
  context: Record<string, Json>;
  layout: "focus" | "classic";
  events: FormEvent[];
};
export type FrameToShell = { type: "gf:ready" } | { type: "gf:events"; events: FormEvent[] };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const isEventLog = (events: unknown): events is FormEvent[] => Array.isArray(events) && events.every(isFormEvent);

/** Frame → shell: exactly `gf:ready`, or `gf:events` with a well-formed log. Anything else is dropped. */
export const isFrameMessage = (data: unknown): data is FrameToShell => {
  if (!isRecord(data)) return false;
  if (data.type === "gf:ready") return true;
  return data.type === "gf:events" && isEventLog(data.events);
};

/** Shell → frame: exactly `gf:load` with a definition, a context object, a layout and a well-formed log. */
export const isShellMessage = (data: unknown): data is ShellToFrame =>
  isRecord(data) &&
  data.type === "gf:load" &&
  isRecord(data.definition) &&
  Array.isArray(data.definition.blocks) &&
  isRecord(data.context) &&
  (data.layout === "focus" || data.layout === "classic") &&
  isEventLog(data.events);
