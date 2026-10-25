/**
 * The overlay's report, as text for "Copy debug info" and the feedback slot.
 * Built from what the overlay shows, already scrubbed where it came from the
 * observability block; the user is an id, never an email.
 */
import type { RecentActivity } from "../observability/block";
import { scrubString } from "../observability/scrub";
import type { VersionSignature } from "../updates/signature";

export interface DebugInfoInput {
  signature?: VersionSignature | null;
  userId?: string | null;
  blocks?: readonly string[];
  flags?: Readonly<Record<string, unknown>>;
  baseUrl?: string | null;
  recent?: RecentActivity;
  /** Default now. */
  at?: number;
}

const UNKNOWN = "unknown";

function flagValue(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return scrubString(value);
  return value === null || value === undefined ? "unset" : "(object)";
}

/** Several lines a person can paste into a bug report. Unknown values are written `unknown`, never left out. */
export function buildDebugInfo(input: DebugInfoInput): string {
  const lines: string[] = [`Debug info ${new Date(input.at ?? Date.now()).toISOString()}`];
  lines.push(...(input.signature ? input.signature.text.split("\n") : ["Version unknown (no updates block)"]));
  lines.push(`User ${input.userId ?? "signed out"}`);
  lines.push(`Server ${input.baseUrl ? scrubString(input.baseUrl.replace(/[?#].*$/, "")) : UNKNOWN}`);
  lines.push(`Blocks ${input.blocks && input.blocks.length > 0 ? input.blocks.join(", ") : "none"}`);
  const flags = Object.entries(input.flags ?? {});
  lines.push(`Flags ${flags.length > 0 ? flags.map(([k, v]) => `${k}=${flagValue(v)}`).join(", ") : "none"}`);
  const errors = input.recent?.errors ?? [];
  lines.push(`Errors (${errors.length})`);
  for (const e of errors.slice(-10)) lines.push(`  ${new Date(e.at).toISOString()} ${e.fatal ? "fatal " : ""}${e.source} ${e.name}: ${e.message}`);
  const crumbs = input.recent?.breadcrumbs ?? [];
  lines.push(`Breadcrumbs (${crumbs.length})`);
  for (const c of crumbs.slice(-20)) lines.push(`  ${c.timestamp ? new Date(c.timestamp).toISOString() : UNKNOWN} ${c.category} ${c.message ?? ""}`.trimEnd());
  return lines.join("\n");
}
