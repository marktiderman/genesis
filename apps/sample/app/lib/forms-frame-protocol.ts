import type { FormDefinition, FormEvent, Json } from "@marktiderman/genesis-forms";

/** Messages between the playground shell and the device-frame iframe (same origin only). */
export type ShellToFrame = {
  type: "gf:load";
  definition: FormDefinition;
  context: Record<string, Json>;
  layout: "focus" | "classic";
  events: FormEvent[];
};
export type FrameToShell = { type: "gf:ready" } | { type: "gf:events"; events: FormEvent[] };

export const isFrameMessage = (data: unknown): data is FrameToShell =>
  !!data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string" &&
  (data as { type: string }).type.startsWith("gf:");
