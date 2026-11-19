/**
 * `parseDiagnosticReport`: a dump as it arrives at the server, checked,
 * scrubbed again and capped. The device already applied the same rules; the
 * server never trusts that it did.
 */
import { capReport, type CapLimits } from "../diagnostics/cap";
import { redactReport } from "../diagnostics/redact";
import { DIAGNOSTIC_TRIGGERS, DIAGNOSTICS_DEFAULTS, DIAGNOSTICS_SCHEMA, isUuid, type DiagnosticReport, type DiagnosticTrigger } from "../diagnostics/report";

export type ParseDiagnosticsError = "invalid_json" | "invalid_report" | "unknown_schema" | "payload_too_large";

export type ParsedDiagnostics =
  | { ok: true; report: DiagnosticReport }
  | { ok: false; error: ParseDiagnosticsError; status: 400 | 413; field?: string };

export interface ParseDiagnosticsOptions extends CapLimits {
  /** Refuse a body larger than this many bytes. Default 512 KB (`DIAGNOSTICS_DEFAULTS.serverMaxBytes`). */
  maxBodyBytes?: number;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * Takes the body as text (preferred: its size is checked before parsing) or as a parsed value.
 * Refuses over 512 KB; anything smaller is capped to 256 KB, never refused for size.
 */
export function parseDiagnosticReport(body: string | unknown, options: ParseDiagnosticsOptions = {}): ParsedDiagnostics {
  const maxBody = options.maxBodyBytes ?? DIAGNOSTICS_DEFAULTS.serverMaxBytes;
  let value: unknown = body;
  if (typeof body === "string") {
    if (byteLength(body) > maxBody) return { ok: false, error: "payload_too_large", status: 413 };
    try {
      value = JSON.parse(body);
    } catch {
      return { ok: false, error: "invalid_json", status: 400 };
    }
  } else {
    let text: string | undefined;
    try {
      text = JSON.stringify(body);
    } catch {
      return { ok: false, error: "invalid_report", status: 400 };
    }
    if (text === undefined) return { ok: false, error: "invalid_report", status: 400 };
    if (byteLength(text) > maxBody) return { ok: false, error: "payload_too_large", status: 413 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_report", status: 400, field: "body" };
  const r = value as Record<string, unknown>;
  if (r["schema"] !== DIAGNOSTICS_SCHEMA) return { ok: false, error: "unknown_schema", status: 400, field: "schema" };
  if (!isUuid(r["id"])) return { ok: false, error: "invalid_report", status: 400, field: "id" };
  if (!DIAGNOSTIC_TRIGGERS.includes(r["trigger"] as DiagnosticTrigger)) return { ok: false, error: "invalid_report", status: 400, field: "trigger" };
  if (typeof r["createdAt"] !== "string" || Number.isNaN(Date.parse(r["createdAt"]))) return { ok: false, error: "invalid_report", status: 400, field: "createdAt" };
  if (r["feedbackId"] != null && !isUuid(r["feedbackId"])) return { ok: false, error: "invalid_report", status: 400, field: "feedbackId" };
  if (!r["app"] || typeof r["app"] !== "object") return { ok: false, error: "invalid_report", status: 400, field: "app" };
  return { ok: true, report: capReport(redactReport(value as DiagnosticReport), options) };
}
