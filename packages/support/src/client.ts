/**
 * The support client: the app's own Supabase (migration 0006 from
 * `@marktiderman/genesis-supabase`) under row level security. Everything a
 * person does (send feedback, read their reports and the replies, reply, vote
 * on the idea board) and the Supabase sink for the feedback record.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackStatus } from "./contract";
import { attachmentBytes, sanitizeContext, type FeedbackDelivery, type FeedbackRecord, type FeedbackSink, type FeedbackType } from "./record";

/** Any supabase-js client; the app's generated Database types don't need to list the support tables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupportSupabase = SupabaseClient<any, any, any>;

/** The storage bucket migration 0006 creates. */
export const SUPPORT_BUCKET = "genesis-support";

/** A Supabase refusal, with its code (`GS429` rate limited, `42501` not allowed, …). */
export class SupportError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly operation: string,
  ) {
    super(message);
    this.name = "SupportError";
  }
  /** The database's rate limit (SQLSTATE GS429). */
  get rateLimited(): boolean {
    return this.code === "GS429";
  }
}

function must<T>(operation: string, result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new SupportError(result.error.message, result.error.code, operation);
  return result.data as T;
}

export type IdeaStatus = "open" | "planned" | "in_progress" | "shipped" | "declined" | "hidden";

export interface SupportReport {
  id: string;
  type: FeedbackType;
  title: string | null;
  message: string;
  status: FeedbackStatus;
  /** The FeatureId staff linked it to. */
  featureId: string | null;
  route: string | null;
  appVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lastStaffReplyAt: string | null;
  lastUserReplyAt: string | null;
  userReadAt: string | null;
  staffReadAt: string | null;
  /** A staff reply the person hasn't read. */
  unread: boolean;
}

export interface SupportReply {
  id: string;
  reportId: string;
  body: string;
  fromStaff: boolean;
  /** Written by the signed-in person. */
  mine: boolean;
  createdAt: string;
}

export interface SupportAttachmentView {
  id: string;
  path: string;
  contentType: string;
  width: number | null;
  height: number | null;
  /** A signed URL, valid for `signedUrlSeconds` (default an hour). Null when signing failed. */
  url: string | null;
}

export interface SupportIdea {
  id: string;
  title: string;
  body: string | null;
  status: IdeaStatus;
  /** The FeatureId that delivers it (set when it ships). */
  featureId: string | null;
  shippedAt: string | null;
  voteCount: number;
  /** The signed-in person voted for it. */
  voted: boolean;
  /** The signed-in person suggested it. */
  mine: boolean;
  createdAt: string;
}

export interface SupportClient extends FeedbackSink {
  /** The signed-in person's reports, newest first. */
  myReports(options?: { limit?: number }): Promise<SupportReport[]>;
  report(id: string): Promise<SupportReport | null>;
  replies(reportId: string): Promise<SupportReply[]>;
  reply(reportId: string, body: string): Promise<SupportReply>;
  markRead(reportId: string): Promise<void>;
  /** Deletes the person's own report; its screenshots are queued for removal. */
  deleteReport(reportId: string): Promise<void>;
  attachments(reportId: string): Promise<SupportAttachmentView[]>;
  /** The board, most votes first. Hidden ideas are left out, the person's own included. */
  ideas(options?: { limit?: number; statuses?: IdeaStatus[] }): Promise<SupportIdea[]>;
  suggestIdea(input: { title: string; body?: string }): Promise<SupportIdea>;
  vote(ideaId: string): Promise<void>;
  unvote(ideaId: string): Promise<void>;
  /** "You asked, we shipped": shipped ideas the person suggested or voted for. */
  shippedForMe(): Promise<SupportIdea[]>;
}

export interface SupportClientOptions {
  bucket?: string;
  signedUrlSeconds?: number;
  /** For the attachment file names. Default `crypto.randomUUID`. */
  randomId?: () => string;
}

const REPORT_COLUMNS =
  "id, type, title, message, status, feature_id, route, app_version, created_at, updated_at, last_staff_reply_at, last_user_reply_at, user_read_at, staff_read_at";
const IDEA_COLUMNS = "id, title, body, status, feature_id, shipped_at, vote_count, created_at";

type Row = Record<string, unknown>;

/** True when there is a staff reply newer than the person's last read. */
export function isUnread(row: { lastStaffReplyAt: string | null; userReadAt: string | null }): boolean {
  if (!row.lastStaffReplyAt) return false;
  return !row.userReadAt || new Date(row.lastStaffReplyAt).getTime() > new Date(row.userReadAt).getTime();
}

function toReport(r: Row): SupportReport {
  const report: Omit<SupportReport, "unread"> = {
    id: String(r.id),
    type: r.type as FeedbackType,
    title: (r.title as string | null) ?? null,
    message: String(r.message ?? ""),
    status: r.status as FeedbackStatus,
    featureId: (r.feature_id as string | null) ?? null,
    route: (r.route as string | null) ?? null,
    appVersion: (r.app_version as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastStaffReplyAt: (r.last_staff_reply_at as string | null) ?? null,
    lastUserReplyAt: (r.last_user_reply_at as string | null) ?? null,
    userReadAt: (r.user_read_at as string | null) ?? null,
    staffReadAt: (r.staff_read_at as string | null) ?? null,
  };
  return { ...report, unread: isUnread(report) };
}

function toIdea(r: Row, mine: ReadonlySet<string>, voted: ReadonlySet<string>): SupportIdea {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    body: (r.body as string | null) ?? null,
    status: r.status as IdeaStatus,
    featureId: (r.feature_id as string | null) ?? null,
    shippedAt: (r.shipped_at as string | null) ?? null,
    voteCount: Number(r.vote_count ?? 0),
    voted: voted.has(String(r.id)),
    mine: mine.has(String(r.id)),
    createdAt: String(r.created_at),
  };
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function defaultRandomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The support client over the app's Supabase client. */
export function createSupportClient(supabase: SupportSupabase, options: SupportClientOptions = {}): SupportClient {
  const bucket = options.bucket ?? SUPPORT_BUCKET;
  const signedUrlSeconds = options.signedUrlSeconds ?? 3600;
  const randomId = options.randomId ?? defaultRandomId;

  const me = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  };

  const client: SupportClient = {
    async submit(record: FeedbackRecord): Promise<FeedbackDelivery> {
      const userId = await me();
      if (!userId) throw new SupportError("Sign in to send feedback.", "42501", "submit");
      const context = sanitizeContext(record.context);
      const row = must<Row>(
        "submit",
        await supabase
          .from("support_reports")
          .insert({
            type: record.type,
            title: record.title?.trim() ? record.title.trim().slice(0, 300) : null,
            message: record.message,
            route: context.route ?? null,
            app_version: context.appVersion ?? null,
            platform: context.platform ?? null,
            device: context.device ?? {},
            context: context.extra ?? {},
          })
          .select("id")
          .single(),
      );
      const id = String(row.id);
      let dropped = 0;
      for (const attachment of (record.attachments ?? []).slice(0, 5)) {
        try {
          const bytes = attachmentBytes(attachment);
          if (!bytes) throw new Error("no image data");
          const path = `${userId}/${id}/${randomId().replace(/[^A-Za-z0-9_-]/g, "")}.${EXTENSIONS[attachment.contentType] ?? "png"}`;
          const upload = await supabase.storage.from(bucket).upload(path, bytes, { contentType: attachment.contentType, upsert: false });
          if (upload.error) throw upload.error;
          must(
            "attach",
            await supabase.from("support_attachments").insert({
              report_id: id,
              path,
              content_type: attachment.contentType,
              byte_size: bytes.byteLength,
              width: attachment.width ? Math.round(attachment.width) : null,
              height: attachment.height ? Math.round(attachment.height) : null,
            }),
          );
        } catch {
          dropped += 1;
        }
      }
      dropped += Math.max(0, (record.attachments?.length ?? 0) - 5);
      return { id, attachmentsDropped: dropped };
    },

    async myReports({ limit = 50 } = {}) {
      const userId = await me();
      if (!userId) return [];
      const rows = must<Row[]>(
        "myReports",
        await supabase.from("support_reports").select(REPORT_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
      );
      return rows.map(toReport);
    },

    async report(id) {
      const row = must<Row | null>("report", await supabase.from("support_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle());
      return row ? toReport(row) : null;
    },

    async replies(reportId) {
      // Who wrote a reply isn't readable (staff stay anonymous): on the person's own report, theirs are the non-staff ones.
      const rows = must<Row[]>(
        "replies",
        await supabase.from("support_replies").select("id, report_id, body, from_staff, created_at").eq("report_id", reportId).order("created_at", { ascending: true }),
      );
      return rows.map((r) => ({
        id: String(r.id),
        reportId: String(r.report_id),
        body: String(r.body ?? ""),
        fromStaff: r.from_staff === true,
        mine: r.from_staff !== true,
        createdAt: String(r.created_at),
      }));
    },

    async reply(reportId, body) {
      const row = must<Row>(
        "reply",
        await supabase.from("support_replies").insert({ report_id: reportId, body }).select("id, report_id, body, from_staff, created_at").single(),
      );
      return { id: String(row.id), reportId: String(row.report_id), body: String(row.body), fromStaff: row.from_staff === true, mine: true, createdAt: String(row.created_at) };
    },

    async markRead(reportId) {
      must("markRead", await supabase.rpc("support_mark_read", { report: reportId }));
    },

    async deleteReport(reportId) {
      const rows = must<Row[]>("deleteReport", await supabase.from("support_reports").delete().eq("id", reportId).select("id"));
      if (!rows.length) throw new SupportError("That report wasn't deleted.", "42501", "deleteReport");
    },

    async attachments(reportId) {
      const rows = must<Row[]>(
        "attachments",
        await supabase.from("support_attachments").select("id, path, content_type, width, height").eq("report_id", reportId).order("created_at"),
      );
      if (!rows.length) return [];
      const signed = await supabase.storage.from(bucket).createSignedUrls(
        rows.map((r) => String(r.path)),
        signedUrlSeconds,
      );
      const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl] as const));
      return rows.map((r) => ({
        id: String(r.id),
        path: String(r.path),
        contentType: String(r.content_type),
        width: (r.width as number | null) ?? null,
        height: (r.height as number | null) ?? null,
        url: urls.get(String(r.path)) ?? null,
      }));
    },

    async ideas({ limit = 100, statuses } = {}) {
      const userId = await me();
      let query = supabase.from("support_ideas").select(IDEA_COLUMNS).neq("status", "hidden");
      if (statuses?.length) query = query.in("status", statuses);
      const rows = must<Row[]>("ideas", await query.order("vote_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit));
      const votes = userId ? must<Row[]>("ideas", await supabase.from("support_idea_votes").select("idea_id").eq("user_id", userId)) : [];
      const voted = new Set(votes.map((v) => String(v.idea_id)));
      const mineIds = userId ? must<unknown[]>("ideas", await supabase.rpc("support_my_idea_ids")) : [];
      const mine = new Set((mineIds ?? []).map((v) => String(typeof v === "object" && v !== null ? Object.values(v)[0] : v)));
      return rows.map((r) => toIdea(r, mine, voted));
    },

    async suggestIdea({ title, body }) {
      const row = must<Row>("suggestIdea", await supabase.from("support_ideas").insert({ title: title.trim(), body: body?.trim() || null }).select(IDEA_COLUMNS).single());
      return toIdea(row, new Set([String(row.id)]), new Set());
    },

    async vote(ideaId) {
      const result = await supabase.from("support_idea_votes").insert({ idea_id: ideaId });
      // Voting twice is already voting.
      if (result.error && result.error.code !== "23505") must("vote", result);
    },

    async unvote(ideaId) {
      const userId = await me();
      if (!userId) return;
      must("unvote", await supabase.from("support_idea_votes").delete().eq("idea_id", ideaId).eq("user_id", userId));
    },

    async shippedForMe() {
      const rows = must<Row[]>("shippedForMe", await supabase.rpc("support_shipped_for_me", { max_rows: 50 }));
      const ids = (pick: string) => new Set(rows.filter((r) => r[pick] === true).map((r) => String(r.id)));
      return rows.map((r) => toIdea(r, ids("mine"), ids("voted")));
    },
  };
  return client;
}

/** The Supabase sink on its own (the support client is one). */
export function createSupabaseSink(supabase: SupportSupabase, options: SupportClientOptions = {}): FeedbackSink {
  const client = createSupportClient(supabase, options);
  return { submit: (record) => client.submit(record) };
}
