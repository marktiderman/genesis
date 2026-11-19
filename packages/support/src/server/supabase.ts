/**
 * Supabase adapters for `createDiagnosticsHandler`, for a server that holds
 * the service-role client (an Edge Function, a backend): the store writes
 * `public.support_diagnostics` (migration 0019) and the tickets, the files go to
 * the private `genesis-support` bucket, and `supabaseAuthenticate` reads the
 * person from their Supabase access token.
 *
 * A Supabase app's own client doesn't need these: `supabaseTransport(supabase)`
 * writes straight to the same tables under the person's session and RLS.
 */
import type { SupportSupabase } from "../client";
import { diagnosticsShortId } from "../diagnostics/report";
import { reportVersionLine, DIAGNOSTICS_TABLE } from "../diagnostics/transports";
import { DiagnosticsStoreError, type DiagnosticsCaller, type DiagnosticsFiles, type DiagnosticsStore } from "./handler";

type DbError = { message: string; code?: string } | null;

function check(error: DbError, where: string): void {
  if (!error) return;
  if (error.code === "GS429") throw new DiagnosticsStoreError("rate_limited", 429, "rate_limited");
  if (error.code === "42501") throw new DiagnosticsStoreError("forbidden", 403, "forbidden");
  if (error.code === "23503") throw new DiagnosticsStoreError("unknown_feedback", 400, "unknown_feedback");
  throw new Error(`${where}: ${error.message}`);
}

/** The store over the service-role client. Each row is written for the authenticated person. */
export function supabaseDiagnosticsStore(admin: SupportSupabase, options: { table?: string } = {}): DiagnosticsStore {
  const table = options.table ?? DIAGNOSTICS_TABLE;
  return {
    async saveReport({ report, userId, feedbackId }) {
      const { error } = await admin.from(table).insert({
        id: report.id,
        user_id: userId,
        feedback_id: feedbackId,
        trigger: report.trigger,
        app_version: reportVersionLine(report),
        platform: report.app.platform?.slice(0, 40) ?? null,
        report,
      });
      // Already stored (a retry whose first answer was lost): the same row, if it's this person's.
      if (error?.code === "23505") {
        const { data } = await admin.from(table).select("id").eq("id", report.id).eq("user_id", userId).maybeSingle();
        if (!data) throw new DiagnosticsStoreError("conflict", 409, "conflict");
      } else check(error, "saveReport");
      return { id: report.id, shortId: diagnosticsShortId(report.id) };
    },
    async saveFeedback({ feedback, userId }) {
      // The service role skips the tickets trigger's tenant check (it runs only with a session):
      // a help desk other than the app's own must be one the person belongs to, and switched on.
      if (feedback.tenantId) {
        const { data: allowed, error: tenantError } = await admin.rpc("support_ticket_tenant_allowed", { person: userId, tenant: feedback.tenantId });
        check(tenantError, "saveFeedback");
        if (allowed !== true) throw new DiagnosticsStoreError("not_your_tenant", 403, "not_your_tenant");
      }
      const { data, error } = await admin
        .from("tickets")
        .insert({
          user_id: userId,
          ...(feedback.tenantId ? { tenant_id: feedback.tenantId } : {}),
          type: feedback.type,
          title: feedback.title,
          message: feedback.message,
          route: feedback.route,
          app_version: feedback.appVersion,
          platform: feedback.platform,
          device: feedback.device,
          context: {
            ...feedback.extra,
            ...(feedback.severity ? { severity: feedback.severity } : {}),
            ...(feedback.diagnosticsId ? { diagnosticsId: feedback.diagnosticsId } : {}),
          },
        })
        .select("id")
        .single();
      check(error, "saveFeedback");
      return { id: String((data as { id: string }).id) };
    },
    async attachFile(file) {
      const { error } = await admin.from("ticket_attachments").insert({
        // The service role has no auth.uid(): the attachment trigger checks the path against this.
        user_id: file.userId,
        report_id: file.feedbackId,
        path: file.path,
        content_type: file.contentType,
        byte_size: file.byteSize,
        width: file.width,
        height: file.height,
      });
      check(error, "attachFile");
    },
    async ownsFeedback(userId, feedbackId) {
      const { data, error } = await admin.from("tickets").select("id").eq("id", feedbackId).eq("user_id", userId).maybeSingle();
      check(error, "ownsFeedback");
      return Boolean(data);
    },
    async ownsReport(userId, reportId) {
      const { data, error } = await admin.from(table).select("id").eq("id", reportId).eq("user_id", userId).maybeSingle();
      check(error, "ownsReport");
      return Boolean(data);
    },
  };
}

/** Screenshots into the private `genesis-support` bucket (migration 0006), under `<user>/<report>/`. */
export function supabaseDiagnosticsFiles(admin: SupportSupabase, options: { bucket?: string } = {}): DiagnosticsFiles {
  const bucket = options.bucket ?? "genesis-support";
  return {
    async put(path, bytes, contentType) {
      const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`upload: ${error.message}`);
    },
    async remove(path) {
      const { error } = await admin.storage.from(bucket).remove([path]);
      if (error) throw new Error(`remove: ${error.message}`);
    },
  };
}

/** The person from `Authorization: Bearer <Supabase access token>`, checked with Supabase Auth. */
export function supabaseAuthenticate(admin: SupportSupabase): (request: Request) => Promise<DiagnosticsCaller | null> {
  return async (request) => {
    const header = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, role: (data.user.app_metadata as { role?: string } | undefined)?.role ?? null };
  };
}
