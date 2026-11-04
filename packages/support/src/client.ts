/**
 * The support client: the app's own Supabase (migration 0006 from
 * `@marktiderman/genesis-supabase`) under row level security. Everything a
 * person does (send feedback, read their reports and the replies, reply, vote
 * on the idea board) and the Supabase sink for the feedback record.
 *
 * With a genesis-chat client (`chat` option) and the support-chat block's
 * migration applied, a report's thread runs on genesis-chat: replies, reply,
 * markRead and subscribe go through the report's conversation (live updates,
 * files, internal notes for staff). Otherwise they use support_replies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackStatus } from "./contract";
import { attachmentBytes, sanitizeContext, type FeedbackDelivery, type FeedbackRecord, type FeedbackSink, type FeedbackType } from "./record";
import { isMissingFunction, type SupportChatAttachment, type SupportChatClient, type SupportChatMessage, type SupportThreadInfo } from "./chat";

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
  /** Whether the person pointed to a spot on the page (a pin in its context). */
  pinned?: boolean;
  /** What the page was about, as the panel showed it ("About: …"), when the person kept it. */
  aboutLabel?: string | null;
  /**
   * Where it was sent from, for people: the about label with the route ("Billing
   * (/teams/:id/billing)"), else the route. The route has its ids taken out (cleanRoute).
   */
  page?: string | null;
  appVersion: string | null;
  createdAt: string;
  updatedAt: string;
  lastStaffReplyAt: string | null;
  lastUserReplyAt: string | null;
  userReadAt: string | null;
  staffReadAt: string | null;
  /** A staff reply the person hasn't read. */
  unread: boolean;
  /** Who sent it (the person's own id, or for staff the reporter's). */
  userId?: string | null;
}

/** A ticket: a request from someone outside the team, owed a reply (ADR 0015). The new name for {@link SupportReport}. */
export type Ticket = SupportReport;

/** A help center's collection (migration 0010). */
export interface HelpCollection {
  id: string;
  title: string;
  description: string | null;
  position: number;
}

export type HelpArticleStatus = "draft" | "published";

/** An article in a list: everything but its words. */
export interface HelpArticleSummary {
  id: string;
  collectionId: string | null;
  slug: string;
  title: string;
  summary: string | null;
  status: HelpArticleStatus;
  publishedAt: string | null;
  updatedAt: string;
}

/** A whole article. Its body is plain text: blank lines part its paragraphs. */
export interface HelpArticle extends HelpArticleSummary {
  body: string;
}

/** An article search found, best first. */
export type HelpSearchHit = Pick<HelpArticleSummary, "id" | "collectionId" | "slug" | "title" | "summary">;

/** What an agent saves. No `id` makes a new one. `expectedUpdatedAt`: the copy the editor started from (a newer one is refused, `40001`). */
export interface HelpArticleInput {
  id?: string | null;
  /** The tenant of a new article. Null is the app's own; left out, the client's `tenantId`, else the app's own. An article never changes tenant. */
  tenantId?: string | null;
  collectionId?: string | null;
  slug: string;
  title: string;
  summary?: string | null;
  body: string;
  status: HelpArticleStatus;
  expectedUpdatedAt?: string | null;
}

/** An agent's queues (migration 0009): `mine` and `unassigned` hold open tickets, `all` every ticket. */
export type TicketInboxView = "mine" | "unassigned" | "all";

/** A ticket in an agent's queue. `unread` here means a message from the requester no agent has read. */
export interface AgentTicket extends Ticket {
  tenantId: string;
  severity: string | null;
  /** `email` for an email ticket; null when the support-email block isn't installed or it came from the app. */
  channel: string | null;
  /** Who an email ticket is from (support-email block): they have no login to name. */
  requesterEmail: string | null;
  requesterName: string | null;
  platform: string | null;
  device: Record<string, unknown>;
  conversationId: string | null;
  /** Who has it, a login, or null for nobody. */
  assigneeId: string | null;
  /** The latest of when it was sent and its last reply: what the queue sorts on, and the paging cursor. */
  activityAt: string;
  /** The latest words the requester can see. Never an internal note. */
  preview: string;
}

/** How many tickets each queue holds. */
export type AgentTicketCounts = Record<TicketInboxView, number>;

/** An agent's role in a tenant: `admin` also manages the tenant's agents. */
export type TicketAgentRole = "agent" | "admin";

export interface SupportReply {
  id: string;
  reportId: string;
  body: string;
  fromStaff: boolean;
  /** Written by the signed-in person. */
  mine: boolean;
  /** Who wrote it, on genesis-chat (support-chat block). Never on support_replies, where staff stay anonymous. */
  authorId?: string | null;
  createdAt: string;
  /** A staff-only internal note (support-chat block; staff only ever read them). Always false on support_replies. */
  internal?: boolean;
  /** Photos, files and voice notes (support-chat block). Empty on support_replies. */
  attachments?: SupportReplyAttachment[];
  /** Its number in the conversation (support-chat block), else null. */
  seq?: number | null;
}

/** A file on a reply, with a signed URL when it is in storage. */
export interface SupportReplyAttachment extends Omit<SupportChatAttachment, "url"> {
  /** A signed URL (or the attachment's own https URL); null when it couldn't be signed. */
  url: string | null;
  /** The URL is a signed one from this app's storage. False: an address from outside it, which loads nothing until asked. */
  stored: boolean;
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
  /** The signed-in person's reports, newest first, in every tenant. `tenantId`: only that tenant's (migration 0004). */
  myReports(options?: { limit?: number; tenantId?: string | null }): Promise<SupportReport[]>;
  /** The signed-in person's tickets, newest first (the new name for `myReports`). Needs migration 0004. */
  myTickets?(options?: { limit?: number; tenantId?: string | null }): Promise<Ticket[]>;
  /** The tenant calls go to when none is named: the client's `tenantId` as it is now, else null, the app's own. */
  currentTenant?(): Promise<string | null>;
  /** Their tickets in one help desk: the tenant given, else the client's `tenantId`, else the app's own. Needs migration 0004. */
  ticketsInTenant?(options?: { limit?: number; tenantId?: string | null }): Promise<Ticket[]>;
  /** Does the signed-in person handle tickets in this tenant (an agent, a tenant admin)? Needs migration 0004. */
  isAgent?(tenantId: string): Promise<boolean>;
  /**
   * Agents: a queue of a tenant's tickets, latest activity first. A null or missing tenant is the
   * app's own. Refused (`42501`) unless the signed-in person is an agent there. Needs migration 0009.
   */
  agentTickets?(options?: { tenantId?: string | null; view?: TicketInboxView; before?: Pick<AgentTicket, "activityAt" | "id"> | null; limit?: number }): Promise<AgentTicket[]>;
  /** Agents: one ticket of the tenant's queue, or null. Needs migration 0009. */
  agentTicket?(id: string, options?: { tenantId?: string | null }): Promise<AgentTicket | null>;
  /** Agents: how many tickets each queue holds. Needs migration 0009. */
  agentTicketCounts?(options?: { tenantId?: string | null }): Promise<AgentTicketCounts>;
  /** A help center's collections, in their order (migration 0010). Null is the app's own tenant; left out, the client's `tenantId`, else the app's own. The same for every help center call. */
  helpCollections?(options?: { tenantId?: string | null }): Promise<HelpCollection[]>;
  /** Its articles, without their bodies. `includeDrafts` is for an agent's list; others get published ones either way. */
  helpArticles?(options?: { tenantId?: string | null; collectionId?: string | null; includeDrafts?: boolean }): Promise<HelpArticleSummary[]>;
  /** One article by its slug or id, or null when the signed-in person can't read it. */
  helpArticle?(slugOrId: string, options?: { tenantId?: string | null }): Promise<HelpArticle | null>;
  /** Published articles for what someone typed, best first. */
  searchHelp?(query: string, options?: { tenantId?: string | null; limit?: number }): Promise<HelpSearchHit[]>;
  /** Agents: save an article; returns its id and the copy's time, for `expectedUpdatedAt` next. */
  saveHelpArticle?(input: HelpArticleInput): Promise<{ id: string; updatedAt: string }>;
  /** Agents: delete an article. */
  deleteHelpArticle?(id: string): Promise<void>;
  /** Agents: save a collection (no `id` makes a new one); returns its id. */
  saveHelpCollection?(input: { id?: string | null; tenantId?: string | null; title: string; description?: string | null; position?: number }): Promise<string>;
  /** Agents: delete a collection; its articles stay, in none. */
  deleteHelpCollection?(id: string): Promise<void>;
  /** Can the signed-in person ask this tenant's AI? Off until the tenant opts in. */
  helpAiEnabled?(options?: { tenantId?: string | null }): Promise<boolean>;
  /** Keeps a question for the AI and returns its id, which is all the client sends your endpoint (`answerHelpQuestion`). */
  askHelp?(question: string, options?: { tenantId?: string | null }): Promise<string>;
  /** How it ended: the answer helped (the usage count), or it went to a person, with their ticket. */
  closeHelpQuestion?(questionId: string, outcome: "resolved" | "handed_off", ticketId?: string | null): Promise<void>;
  /** Tenant admins: make a tenant's person an agent or agent admin, or remove them (`null`). Needs migration 0004. */
  setAgent?(tenantId: string, personId: string, role: TicketAgentRole | null): Promise<void>;
  report(id: string): Promise<SupportReport | null>;
  replies(reportId: string): Promise<SupportReply[]>;
  /** `internal`: a staff-only note (support-chat block, staff only). */
  reply(reportId: string, body: string, options?: { internal?: boolean }): Promise<SupportReply>;
  /**
   * `ticket`: also mark the ticket itself read. For an agent: on chat, a conversation with no
   * messages yet has no place to move, so a new ticket would stay unread.
   */
  markRead(reportId: string, options?: { ticket?: boolean }): Promise<void>;
  /**
   * Where the report's thread lives: its genesis-chat conversation when a `chat` client was given
   * and the support-chat block is installed, else support_replies.
   */
  thread(reportId: string): Promise<SupportThreadInfo>;
  /** The report's genesis-chat conversation id, or null (no chat client, no block, or not readable). */
  conversationId(reportId: string): Promise<string | null>;
  /** Live updates for the thread (chat only): `onChange` runs on each hint and each (re)join. Returns the stop. */
  subscribe(reportId: string, onChange: () => void): () => void;
  /**
   * Whether the signed-in person handles the app's own tickets (an agent of its default tenant).
   * For a business's tickets use `isAgent(tenantId)` or `handles(reportId)` (migration 0004).
   */
  isStaff(): Promise<boolean>;
  /** Staff: the report's status, and the FeatureId it is about (null keeps it, "" clears it). */
  setStatus(reportId: string, status: FeedbackStatus, featureId?: string | null): Promise<void>;
  /**
   * The person's answer once a report is marked addressed: fixed (confirmed) or not (reopened).
   * Needs migration 0003. Optional: a custom client may leave it out, so check before calling.
   */
  verify?(reportId: string, fixed: boolean, note?: string): Promise<void>;
  /**
   * Does the signed-in person handle this report (staff, or whom the app's hook names)? Needs
   * migration 0003. Optional: a custom client may leave it out, so check before calling.
   */
  handles?(reportId: string): Promise<boolean>;
  /** Staff (support-chat block): who has the report, a staff member or null. */
  assign(reportId: string, userId: string | null): Promise<void>;
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
  /**
   * A genesis-chat client (`createChatClient(supabase)`): with it, and the support-chat block's
   * migration applied, a report's thread runs on genesis-chat. Without either, support_replies.
   */
  chat?: SupportChatClient | false;
  /** Told once when a chat client was given but the block's migration isn't applied. Default `console.warn`. */
  onChatUnavailable?: (message: string) => void;
  bucket?: string;
  signedUrlSeconds?: number;
  /** For the attachment file names. Default `crypto.randomUUID`. */
  randomId?: () => string;
  /**
   * Also write a report's severity to its own `severity` column (added by migration 0003).
   * Default off. Either way it goes into the report's context as `severity`, as the intake
   * function does, which works on every schema.
   */
  severityColumn?: boolean;
  /**
   * The tenant a new ticket goes to (migration 0004): usually the viewer's current workspace.
   * Left out, the ticket goes to the app's own (default) tenant; nothing is guessed. A tenant
   * the sender isn't in, or whose help desk is off, is refused.
   */
  tenantId?: string | null | (() => string | null | Promise<string | null>);
}

const REPORT_COLUMNS =
  "id, user_id, type, title, message, status, feature_id, route, app_version, created_at, updated_at, last_staff_reply_at, last_user_reply_at, user_read_at, staff_read_at, pin:context->pin, about_label:context->>about_label";
const IDEA_COLUMNS = "id, title, body, status, feature_id, shipped_at, vote_count, created_at";

type Row = Record<string, unknown>;

/** True when there is a staff reply newer than the person's last read. */
export function isUnread(row: { lastStaffReplyAt: string | null; userReadAt: string | null }): boolean {
  if (!row.lastStaffReplyAt) return false;
  return !row.userReadAt || new Date(row.lastStaffReplyAt).getTime() > new Date(row.userReadAt).getTime();
}

/**
 * An about label as it can be shown: the reporter's (so untrusted), on one line, at most 80
 * characters, without control or direction-changing (bidi) characters. Null when nothing is left.
 */
export function cleanLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  let out = "";
  for (const ch of label) {
    const c = ch.codePointAt(0)!;
    const control = c < 0x20 || (c >= 0x7f && c < 0xa0);
    const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f || c === 0x061c;
    out += control ? " " : bidi ? "" : ch;
  }
  out = out.replace(/\s+/g, " ").trim();
  if (!out) return null;
  return out.length > 80 ? `${out.slice(0, 79).trimEnd()}…` : out;
}

/** A report's page for people: the about label with the route, else the route. */
export function pageOf(aboutLabel: string | null, route: string | null): string | null {
  const label = cleanLabel(aboutLabel);
  if (label && route) return `${label} (${route})`;
  return label || route;
}

/** A report's heading: its title, else its words (the first line, shortened), never just its kind. */
export function reportHeading(report: { title: string | null; message: string }): string {
  const title = report.title?.trim();
  if (title) return title;
  const line = report.message.trim().split("\n")[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function toReport(r: Row): SupportReport {
  const report: Omit<SupportReport, "unread"> = {
    id: String(r["id"]),
    type: r["type"] as FeedbackType,
    title: (r["title"] as string | null) ?? null,
    message: String(r["message"] ?? ""),
    status: r["status"] as FeedbackStatus,
    featureId: (r["feature_id"] as string | null) ?? null,
    route: (r["route"] as string | null) ?? null,
    pinned: r["pin"] != null,
    aboutLabel: cleanLabel(r["about_label"] as string | null),
    page: pageOf((r["about_label"] as string | null) ?? null, (r["route"] as string | null) ?? null),
    appVersion: (r["app_version"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
    lastStaffReplyAt: (r["last_staff_reply_at"] as string | null) ?? null,
    lastUserReplyAt: (r["last_user_reply_at"] as string | null) ?? null,
    userReadAt: (r["user_read_at"] as string | null) ?? null,
    staffReadAt: (r["staff_read_at"] as string | null) ?? null,
    userId: (r["user_id"] as string | null) ?? null,
  };
  return { ...report, unread: isUnread(report) };
}

function toAgentTicket(r: Row): AgentTicket {
  return {
    ...toReport(r),
    tenantId: String(r["tenant_id"]),
    severity: (r["severity"] as string | null) ?? null,
    channel: (r["channel"] as string | null) ?? null,
    requesterEmail: (r["requester_email"] as string | null) ?? null,
    requesterName: cleanLabel(r["requester_name"] as string | null),
    platform: (r["platform"] as string | null) ?? null,
    device: (r["device"] as Record<string, unknown> | null) ?? {},
    conversationId: (r["conversation_id"] as string | null) ?? null,
    assigneeId: (r["assignee_id"] as string | null) ?? null,
    activityAt: String(r["activity_at"]),
    preview: String(r["preview"] ?? ""),
    unread: r["agent_unread"] === true,
  };
}

const toCollection = (r: Row): HelpCollection => ({
  id: String(r["id"]),
  title: String(r["title"] ?? ""),
  description: (r["description"] as string | null) ?? null,
  position: Number(r["position_in_list"] ?? 0),
});

const toArticleSummary = (r: Row): HelpArticleSummary => ({
  id: String(r["id"]),
  collectionId: (r["collection_id"] as string | null) ?? null,
  slug: String(r["slug"] ?? ""),
  title: String(r["title"] ?? ""),
  summary: (r["summary"] as string | null) ?? null,
  status: r["status"] as HelpArticleStatus,
  publishedAt: (r["published_at"] as string | null) ?? null,
  updatedAt: String(r["updated_at"]),
});

function toIdea(r: Row, mine: ReadonlySet<string>, voted: ReadonlySet<string>): SupportIdea {
  return {
    id: String(r["id"]),
    title: String(r["title"] ?? ""),
    body: (r["body"] as string | null) ?? null,
    status: r["status"] as IdeaStatus,
    featureId: (r["feature_id"] as string | null) ?? null,
    shippedAt: (r["shipped_at"] as string | null) ?? null,
    voteCount: Number(r["vote_count"] ?? 0),
    voted: voted.has(String(r["id"])),
    mine: mine.has(String(r["id"])),
    createdAt: String(r["created_at"]),
  };
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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

  /** The tenant a call is for: the one given (null is the app's own), else the client's option. */
  const scope = async (given: string | null | undefined): Promise<string | null> =>
    given !== undefined ? given : ((typeof options.tenantId === "function" ? await options.tenantId() : options.tenantId) ?? null);

  const me = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  };

  // The support-chat block: learned on first use (the database function is there or not).
  const chat = options.chat || null;
  let chatInstalled: boolean | null = chat ? null : false;
  const conversations = new Map<string, string>();
  const warn = options.onChatUnavailable ?? ((message: string) => console.warn(message));

  async function thread(reportId: string): Promise<SupportThreadInfo> {
    if (!chat || chatInstalled === false) return { mode: "replies", conversationId: null };
    const known = conversations.get(reportId);
    if (known) return { mode: "chat", conversationId: known };
    const result = await supabase.rpc("support_chat_conversation", { report: reportId });
    if (result.error) {
      if (isMissingFunction(result.error)) {
        chatInstalled = false;
        warn(
          "genesis-support: a chat client was given, but the support-chat block's migrations (0005_genesis_support_chat_on_tickets.sql and 0006_genesis_support_chat_tenants.sql) aren't applied. Report threads use support_replies.",
        );
        return { mode: "replies", conversationId: null };
      }
      throw new SupportError(result.error.message, result.error.code, "thread");
    }
    chatInstalled = true;
    const id = typeof result.data === "string" && result.data ? result.data : null;
    // No conversation (not readable, or a report the block hasn't reached): support_replies still mirrors it.
    if (!id) return { mode: "replies", conversationId: null };
    conversations.set(reportId, id);
    return { mode: "chat", conversationId: id };
  }

  async function chatReply(reportId: string, m: SupportChatMessage, userId: string | null): Promise<SupportReply> {
    const paths = m.attachments.map((a) => a.path).filter((p): p is string => Boolean(p));
    const signed = paths.length && chat ? await chat.fileUrls(paths).catch(() => ({}) as Record<string, string>) : {};
    return {
      id: m.id,
      reportId,
      body: m.body,
      fromStaff: m.senderRole === "observer",
      mine: Boolean(userId) && m.senderId === userId,
      authorId: m.senderId,
      createdAt: m.createdAt,
      internal: m.visibility === "observers",
      seq: m.seq,
      // A path that doesn't sign has no URL: it never falls back to the address the message carries.
      attachments: m.attachments.map((a) => {
        const url = a.path ? (signed[a.path] ?? null) : (a.url ?? null);
        return { ...a, url, stored: Boolean(a.path && url) };
      }),
    };
  }

  const client: SupportClient = {
    async submit(record: FeedbackRecord): Promise<FeedbackDelivery> {
      const userId = await me();
      if (!userId) throw new SupportError("Sign in to send feedback.", "42501", "submit");
      const context = sanitizeContext(record.context);
      const tenantId = await scope(record.tenantId);
      const row = must<Row>(
        "submit",
        await supabase
          .from("support_reports")
          .insert({
            ...(tenantId ? { tenant_id: tenantId } : {}),
            type: record.type,
            title: record.title?.trim() ? record.title.trim().slice(0, 300) : null,
            message: record.message,
            route: context.route ?? null,
            app_version: context.appVersion ?? null,
            platform: context.platform ?? null,
            device: context.device ?? {},
            // Severity, as the intake function keeps it: always in context, and also in its own
            // column when the app says migration 0003 added it.
            context: record.severity ? { ...(context.extra ?? {}), severity: record.severity } : (context.extra ?? {}),
            ...(record.severity && options.severityColumn ? { severity: record.severity } : {}),
          })
          .select("id")
          .single(),
      );
      const id = String(row["id"]);
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

    async myReports({ limit = 50, tenantId } = {}) {
      const userId = await me();
      if (!userId) return [];
      let query = supabase.from("support_reports").select(REPORT_COLUMNS).eq("user_id", userId);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const rows = must<Row[]>("myReports", await query.order("created_at", { ascending: false }).limit(limit));
      return rows.map(toReport);
    },

    async report(id) {
      const row = must<Row | null>("report", await supabase.from("support_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle());
      return row ? toReport(row) : null;
    },

    async replies(reportId) {
      const where = await thread(reportId);
      if (where.mode === "chat" && chat) {
        const [page, userId] = await Promise.all([chat.messages(where.conversationId, { limit: 200 }), me()]);
        const shown = page.messages.filter((m) => m.kind === "text" && !m.deletedAt);
        return Promise.all(shown.map((m) => chatReply(reportId, m, userId)));
      }
      // Who wrote a reply isn't readable (staff stay anonymous): on the person's own report, theirs are the non-staff ones.
      const rows = must<Row[]>(
        "replies",
        await supabase.from("support_replies").select("id, report_id, body, from_staff, created_at").eq("report_id", reportId).order("created_at", { ascending: true }),
      );
      return rows.map((r) => ({
        id: String(r["id"]),
        reportId: String(r["report_id"]),
        body: String(r["body"] ?? ""),
        fromStaff: r["from_staff"] === true,
        mine: r["from_staff"] !== true,
        createdAt: String(r["created_at"]),
      }));
    },

    async reply(reportId, body, { internal = false } = {}) {
      const where = await thread(reportId);
      if (where.mode === "chat" && chat) {
        const [sent, userId] = await Promise.all([
          chat
            .send({ conversationId: where.conversationId, clientId: randomUuid(), body, visibility: internal ? "observers" : "everyone" })
            .catch((error: { message?: string; code?: string }) => {
              throw new SupportError(error?.message ?? "Not sent", error?.code, "reply");
            }),
          me(),
        ]);
        return chatReply(reportId, sent, userId);
      }
      if (internal) throw new SupportError("Internal notes need the support-chat block.", "0A000", "reply");
      const row = must<Row>(
        "reply",
        await supabase.from("support_replies").insert({ report_id: reportId, body }).select("id, report_id, body, from_staff, created_at").single(),
      );
      return { id: String(row["id"]), reportId: String(row["report_id"]), body: String(row["body"]), fromStaff: row["from_staff"] === true, mine: true, createdAt: String(row["created_at"]) };
    },

    async markRead(reportId, { ticket = false } = {}) {
      const where = await thread(reportId);
      if (where.mode === "chat" && chat) {
        // The migration carries the conversation's read place to the report.
        await chat.markRead(where.conversationId);
        if (ticket) must("markRead", await supabase.rpc("support_mark_read", { report: reportId }));
        return;
      }
      must("markRead", await supabase.rpc("support_mark_read", { report: reportId }));
    },

    thread,

    async conversationId(reportId) {
      return (await thread(reportId)).conversationId;
    },

    subscribe(reportId, onChange) {
      let stopped = false;
      let stop = () => {};
      void (async () => {
        const where = await thread(reportId);
        if (where.mode !== "chat" || !chat || stopped) return;
        const sub = chat.subscribeConversation(where.conversationId, (await me()) ?? "", { onSignal: () => onChange(), onJoin: () => onChange() });
        if (stopped) sub.unsubscribe();
        else stop = () => sub.unsubscribe();
      })().catch(() => undefined);
      return () => {
        stopped = true;
        stop();
      };
    },

    async isStaff() {
      return must<boolean | null>("isStaff", await supabase.rpc("support_is_staff")) === true;
    },

    async myTickets(opts) {
      return client.myReports(opts);
    },
    async isAgent(tenantId) {
      return must<boolean | null>("isAgent", await supabase.rpc("support_is_agent", { tenant: tenantId })) === true;
    },
    async setAgent(tenantId, personId, role) {
      must("setAgent", await supabase.rpc("support_set_agent", { tenant: tenantId, person: personId, role }));
    },

    async agentTickets({ tenantId = null, view = "all", before = null, limit = 50 } = {}) {
      const rows = must<Row[]>(
        "agentTickets",
        await supabase.rpc("support_agent_tickets", { tenant: tenantId, inbox_view: view, before_at: before?.activityAt ?? null, before_id: before?.id ?? null, max_rows: limit }),
      );
      return (rows ?? []).map(toAgentTicket);
    },
    async agentTicket(id, { tenantId = null } = {}) {
      const rows = must<Row[]>("agentTicket", await supabase.rpc("support_agent_tickets", { tenant: tenantId, only_id: id }));
      return rows?.[0] ? toAgentTicket(rows[0]) : null;
    },
    async agentTicketCounts({ tenantId = null } = {}) {
      const rows = must<Row[]>("agentTicketCounts", await supabase.rpc("support_agent_ticket_counts", { tenant: tenantId }));
      const count = (view: TicketInboxView) => Number((rows ?? []).find((r) => r["inbox_view"] === view)?.["tickets"] ?? 0);
      return { mine: count("mine"), unassigned: count("unassigned"), all: count("all") };
    },

    currentTenant: () => scope(undefined),
    async ticketsInTenant({ limit = 50, tenantId } = {}) {
      const tenant = (await scope(tenantId)) ?? must<string>("ticketsInTenant", await supabase.rpc("support_default_tenant"));
      return client.myReports({ limit, tenantId: tenant });
    },
    async helpCollections({ tenantId } = {}) {
      return (must<Row[]>("helpCollections", await supabase.rpc("support_help_collections", { tenant: await scope(tenantId) })) ?? []).map(toCollection);
    },
    async helpArticles({ tenantId, collectionId = null, includeDrafts = false } = {}) {
      return (must<Row[]>("helpArticles", await supabase.rpc("support_help_articles", { tenant: await scope(tenantId), collection: collectionId, include_drafts: includeDrafts })) ?? []).map(toArticleSummary);
    },
    async helpArticle(slugOrId, { tenantId } = {}) {
      const row = (must<Row[]>("helpArticle", await supabase.rpc("support_help_article", { tenant: await scope(tenantId), article: slugOrId })) ?? [])[0];
      return row ? { ...toArticleSummary(row), body: String(row["body"] ?? "") } : null;
    },
    async searchHelp(query, { tenantId, limit = 10 } = {}) {
      return (must<Row[]>("searchHelp", await supabase.rpc("support_search_articles", { tenant: await scope(tenantId), query, max_rows: limit })) ?? []).map((r) => {
        const { id, collectionId, slug, title, summary } = toArticleSummary(r);
        return { id, collectionId, slug, title, summary };
      });
    },
    async saveHelpArticle(input) {
      const saved = must<Row | Row[]>(
        "saveHelpArticle",
        await supabase.rpc("support_save_article", {
            article: input.id ?? null,
            tenant: await scope(input.tenantId),
            collection: input.collectionId ?? null,
            slug: input.slug,
            title: input.title,
            summary: input.summary ?? null,
            body: input.body,
            status: input.status,
            expected_updated_at: input.expectedUpdatedAt ?? null,
        }),
      );
      const row = (Array.isArray(saved) ? saved[0] : saved) as Row;
      return { id: String(row["saved_id"]), updatedAt: String(row["saved_at"]) };
    },
    async deleteHelpArticle(id) {
      must("deleteHelpArticle", await supabase.rpc("support_delete_article", { article: id }));
    },
    async saveHelpCollection(input) {
      return String(
        must(
          "saveHelpCollection",
          await supabase.rpc("support_save_collection", {
            collection: input.id ?? null,
            tenant: await scope(input.tenantId),
            title: input.title,
            description: input.description ?? null,
            list_position: input.position ?? 0,
          }),
        ),
      );
    },
    async deleteHelpCollection(id) {
      must("deleteHelpCollection", await supabase.rpc("support_delete_collection", { collection: id }));
    },
    async helpAiEnabled({ tenantId } = {}) {
      return must<boolean | null>("helpAiEnabled", await supabase.rpc("support_ai_enabled", { tenant: await scope(tenantId) })) === true;
    },
    async askHelp(question, { tenantId } = {}) {
      return String(must("askHelp", await supabase.rpc("support_ask", { tenant: await scope(tenantId), question })));
    },
    async closeHelpQuestion(questionId, outcome, ticketId = null) {
      must("closeHelpQuestion", await supabase.rpc("support_close_question", { question: questionId, outcome, ticket: ticketId }));
    },

    async verify(reportId, fixed, note) {
      must("verify", await supabase.rpc("support_verify_report", { report: reportId, fixed, note: note ?? null }));
    },
    async handles(reportId) {
      return Boolean(must("handles", await supabase.rpc("support_handles", { report: reportId })));
    },
    async setStatus(reportId, status, featureId = null) {
      must("setStatus", await supabase.rpc("support_set_report_status", { report: reportId, status, feature: featureId }));
    },

    async assign(reportId, userId) {
      must("assign", await supabase.rpc("support_assign_report", { report: reportId, assignee: userId }));
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
        rows.map((r) => String(r["path"])),
        signedUrlSeconds,
      );
      const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl] as const));
      return rows.map((r) => ({
        id: String(r["id"]),
        path: String(r["path"]),
        contentType: String(r["content_type"]),
        width: (r["width"] as number | null) ?? null,
        height: (r["height"] as number | null) ?? null,
        url: urls.get(String(r["path"])) ?? null,
      }));
    },

    async ideas({ limit = 100, statuses } = {}) {
      const userId = await me();
      let query = supabase.from("support_ideas").select(IDEA_COLUMNS).neq("status", "hidden");
      if (statuses?.length) query = query.in("status", statuses);
      const rows = must<Row[]>("ideas", await query.order("vote_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit));
      const votes = userId ? must<Row[]>("ideas", await supabase.from("support_idea_votes").select("idea_id").eq("user_id", userId)) : [];
      const voted = new Set(votes.map((v) => String(v["idea_id"])));
      const mineIds = userId ? must<unknown[]>("ideas", await supabase.rpc("support_my_idea_ids")) : [];
      const mine = new Set((mineIds ?? []).map((v) => String(typeof v === "object" && v !== null ? Object.values(v)[0] : v)));
      return rows.map((r) => toIdea(r, mine, voted));
    },

    async suggestIdea({ title, body }) {
      const row = must<Row>("suggestIdea", await supabase.from("support_ideas").insert({ title: title.trim(), body: body?.trim() || null }).select(IDEA_COLUMNS).single());
      return toIdea(row, new Set([String(row["id"])]), new Set());
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
      const ids = (pick: string) => new Set(rows.filter((r) => r[pick] === true).map((r) => String(r["id"])));
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
