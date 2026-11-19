/**
 * The support block as a `defineBlock` declaration: what it adds to an app
 * (two Settings rows, its routes, migrations 0006, 0003 and 0004) and what it means for the
 * stores' privacy forms. Platform-neutral; `createSupport` (native) builds
 * on it, and a web app can resolve it with `resolveBlocks` too.
 */
import { defineBlock, type BlockContributions, type BlockSettingsRow } from "@marktiderman/genesis-config/blocks";
import { resolveSupportCopy, type SupportCopyOverrides } from "./copy";
import { SUPPORT_CHAT_BLOCK_ID } from "./chat";

/** The FeatureId of the support block (features.ts). */
export const SUPPORT_BLOCK_ID = "support-feedback";

/** Where the block's screens live, under `basePath`. */
export interface SupportPaths {
  /** Help: the person's reports and links to the idea board. */
  inbox: string;
  /** The feedback form. */
  feedback: string;
  /** One report's thread: `thread(id)`. */
  thread: (id: string) => string;
  ideas: string;
  shipped: string;
  /** The messenger's Home (the support-helpdesk block). */
  home: string;
  /** Start a conversation (the support-helpdesk block). */
  newMessage: string;
  /** The help center (the support-helpdesk block). */
  help: string;
  /** One article: `article(slug)`. */
  article: (slug: string) => string;
  /** An agent's queues (the help desk, on the phone). */
  agent: string;
  /** One ticket, as an agent: `agentThread(id)`. */
  agentThread: (id: string) => string;
}

export function supportPaths(basePath = "/support"): SupportPaths {
  const base = basePath.replace(/\/$/, "") || "/support";
  return {
    inbox: base,
    feedback: `${base}/new`,
    thread: (id) => `${base}/${encodeURIComponent(id)}`,
    ideas: `${base}/ideas`,
    shipped: `${base}/shipped`,
    home: `${base}/home`,
    newMessage: `${base}/message`,
    help: `${base}/help`,
    article: (slug) => `${base}/help/${encodeURIComponent(slug)}`,
    agent: `${base}/agent`,
    agentThread: (id) => `${base}/agent/${encodeURIComponent(id)}`,
  };
}

export interface SupportBlockOptions {
  /** Default `/support`. The app owns the route files under it. */
  basePath?: string;
  copy?: SupportCopyOverrides;
  /** The Settings rows' section (default `support`), or `false` for none. */
  settings?: false | { section?: string };
  /** A subtitle hook for the Help row (an unread count). Called on every Settings render. */
  useHelpSubtitle?: () => string | null | undefined;
  /** `false` leaves the idea board out. Default on. */
  ideas?: boolean;
  /** `false` leaves the "Send feedback" row out (the `support.feedback` setting). Default on. */
  feedback?: boolean;
  /** `false` leaves the "Help" row (the person's reports) out (the `support.inbox` setting). Default on. */
  inbox?: boolean;
  /** The block's other FeatureIds it needs (default `["account"]`: a signed-in person). */
  requires?: readonly string[];
}

const PACKAGE = "@marktiderman/genesis-supabase";

/** The block's contributions, for any platform. */
export function supportContributions(options: SupportBlockOptions = {}): BlockContributions<never> {
  const copy = resolveSupportCopy(options.copy);
  const paths = supportPaths(options.basePath);
  const section = options.settings === false ? null : (options.settings?.section ?? "support");
  const settings: BlockSettingsRow[] = section
    ? [
        ...(options.feedback === false ? [] : [{ id: "support-send-feedback", section, title: copy.settings.sendFeedback, href: paths.feedback, order: 10, testID: "genesis-support-send-feedback" }]),
        ...(options.inbox === false
          ? []
          : [{ id: "support-help", section, title: copy.settings.help, href: paths.inbox, order: 20, testID: "genesis-support-help", ...(options.useHelpSubtitle ? { useSubtitle: options.useHelpSubtitle } : {}) }]),
      ]
    : [];
  const routes = [
    { path: paths.inbox, description: "the person's reports and staff replies", signedIn: true },
    { path: paths.feedback, description: "send feedback, with a screenshot", signedIn: true },
    { path: `${paths.inbox}/[id]`, description: "one report's conversation", signedIn: true },
    ...(options.ideas === false
      ? []
      : [
          { path: paths.ideas, description: "the idea board, with votes", signedIn: true },
          { path: paths.shipped, description: "ideas the person asked for that shipped", signedIn: true },
        ]),
  ];
  return {
    settings,
    routes,
    migrations: [
      { package: PACKAGE, file: "migrations/0006_genesis_support.sql", test: "migrations/tests/0006_genesis_support.test.sql" },
      // Severity, the verify loop and report handlers, after 0006.
      { package: "@marktiderman/genesis-support", file: "migrations/0003_genesis_support_findings.sql", test: "migrations/tests/0003_genesis_support_findings.test.sql" },
      // Zero config: a stand-in default tenant for 0004, where the app has none (0023 drops it).
      { package: "@marktiderman/genesis-support", file: "migrations/0021_genesis_support_default_hooks.sql", test: "migrations/tests/0023_genesis_support_hook_defaults.test.sql" },
      // Tickets and tenants: the rename, tenant_id, agents (needs the default-tenant hook: 0021's stand-in, or the app's).
      { package: "@marktiderman/genesis-support", file: "migrations/0004_genesis_support_tickets.sql", test: "migrations/tests/0004_genesis_support_tickets.test.sql" },
      // Zero config in Genesis's own wrappers: the reserved tenant and platform admins as staff, where the app has no hooks.
      { package: "@marktiderman/genesis-support", file: "migrations/0023_genesis_support_hook_defaults.sql", test: "migrations/tests/0023_genesis_support_hook_defaults.test.sql" },
      // The Data Studio's keys after the rename, and an agent's unread count.
      { package: "@marktiderman/genesis-support", file: "migrations/0016_genesis_support_ticket_fixes.sql", test: "migrations/tests/0016_genesis_support_ticket_fixes.test.sql" },
      // The context dump's table (createDiagnostics): own rows, staff read, 10 an hour, 90 days.
      { package: "@marktiderman/genesis-support", file: "migrations/0019_genesis_support_diagnostics.sql", test: "migrations/tests/0019_genesis_support_diagnostics.test.sql" },
      // The dump's hourly limit and retention from the diagnostics.* settings.
      { package: "@marktiderman/genesis-support", file: "migrations/0020_genesis_support_settings.sql", test: "migrations/tests/0020_genesis_support_settings.test.sql" },
      // support.message, support.reply and support.verify through genesis-notifications (support.staffAlerts).
      { package: "@marktiderman/genesis-support", file: "migrations/0025_genesis_support_notifications.sql", test: "migrations/tests/0025_genesis_support_notifications.test.sql" },
    ],
    privacy: {
      collects: [
        { type: "user ID", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "customer support", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "other user content", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "photos or videos", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "other diagnostic data", purposes: ["app functionality"], linked: true, tracking: false },
      ],
      notes: [
        "Feedback is sent only when the person taps Send, and a screenshot only when they include it, after they can hide parts of it.",
        "Reports, screenshots and replies are visible only to the person, the app's support staff and anyone the app names to handle the report, and go when the person deletes them or their account.",
        "Feedback includes the app version, the screen's path (never its query string; private-looking segments are replaced), the platform and basic device facts.",
        "With diagnostics on, a context dump goes with each piece of feedback, on a shake and when the person taps Send diagnostics: the build and update, device facts (model, OS, locale, time zone, screen, network type, permission states), the recent screens as paths, flags in effect, and recent errors, breadcrumbs and console lines. The person is an id and a role only; emails, phone numbers, tokens, keys and query strings are removed on the device and again on the server. A dump never carries a screenshot. Dumps are capped at 256 KB, limited to 10 an hour, readable only by the person and the app's support staff, and deleted after 90 days.",
      ],
    },
  };
}

/** The platform-neutral declaration. */
export function defineSupportBlock(options: SupportBlockOptions = {}) {
  return defineBlock({
    id: SUPPORT_BLOCK_ID,
    requires: options.requires ?? ["account"],
    contributes: supportContributions(options),
  });
}

/**
 * The support-chat block: a report's conversation runs on genesis-chat. It adds no screens of
 * its own (the support block's thread route renders the conversation); it brings migrations
 * `0005_genesis_support_chat_on_tickets.sql`, `0006_genesis_support_chat_tenants.sql`,
 * `0009_genesis_support_inbox.sql`, `0013_genesis_support_queues.sql`, `0014_genesis_support_agent_tools.sql`
 * and `0015_genesis_support_agent_tools_bounds.sql` from this package, after support 0004 and genesis-chat's migrations.
 */
export function defineSupportChatBlock(options: { requires?: readonly string[] } = {}) {
  return defineBlock({
    id: SUPPORT_CHAT_BLOCK_ID,
    requires: options.requires ?? [SUPPORT_BLOCK_ID, "chat"],
    contributes: {
      migrations: [
        // 0001 written for public.tickets and safe to re-run (apps that applied 0001 keep it), then tenancy.
        { package: "@marktiderman/genesis-support", file: "migrations/0005_genesis_support_chat_on_tickets.sql", test: "migrations/tests/0001_genesis_support_chat.test.sql" },
        { package: "@marktiderman/genesis-support", file: "migrations/0006_genesis_support_chat_tenants.sql", test: "migrations/tests/0006_genesis_support_chat_tenants.test.sql" },
        // The agent inbox's read path.
        { package: "@marktiderman/genesis-support", file: "migrations/0009_genesis_support_inbox.sql", test: "migrations/tests/0009_genesis_support_inbox.test.sql" },
        // Pending tickets, active queues, a requester's earlier conversations.
        { package: "@marktiderman/genesis-support", file: "migrations/0013_genesis_support_queues.sql", test: "migrations/tests/0013_genesis_support_queues.test.sql" },
        // Mentions in notes, saved replies, reports.
        { package: "@marktiderman/genesis-support", file: "migrations/0014_genesis_support_agent_tools.sql", test: "migrations/tests/0014_genesis_support_agent_tools.test.sql" },
        // Bounds: the report labels open tickets in one call or at most 1,000; mentions end with the agent.
        { package: "@marktiderman/genesis-support", file: "migrations/0015_genesis_support_agent_tools_bounds.sql", test: "migrations/tests/0015_genesis_support_agent_tools_bounds.test.sql" },
        // The queue as a list a provider pages and counts (no cap of its own); after 0013's queues.
        { package: "@marktiderman/genesis-support", file: "migrations/0018_genesis_support_agent_queue.sql", test: "migrations/tests/0018_genesis_support_agent_queue.test.sql" },
        // Names for agents: the tenant's agents, who wrote, the requester's tenants.
        { package: "@marktiderman/genesis-support", file: "migrations/0022_genesis_support_staff_tools.sql", test: "migrations/tests/0022_genesis_support_staff_tools.test.sql" },
      ],
    },
  });
}

/** The support-email block's id. */
export const SUPPORT_EMAIL_BLOCK_ID = "support-email" as const;

/**
 * The support-email block: email is a ticket channel (ADR 0011). It brings migration
 * `0002_genesis_support_email.sql` from this package, after 0006; the server half is
 * `@marktiderman/genesis-support/email` with genesis-notifications' inbound router and sender.
 */
export function defineSupportEmailBlock(options: { requires?: readonly string[] } = {}) {
  return defineBlock({
    id: SUPPORT_EMAIL_BLOCK_ID,
    requires: options.requires ?? [SUPPORT_BLOCK_ID],
    contributes: {
      migrations: [
        // 0002 written for public.tickets and safe to re-run (apps that applied 0002 keep it), then tenancy.
        { package: "@marktiderman/genesis-support", file: "migrations/0007_genesis_support_email_on_tickets.sql", test: "migrations/tests/0002_genesis_support_email.test.sql" },
        { package: "@marktiderman/genesis-support", file: "migrations/0008_genesis_support_email_tenants.sql", test: "migrations/tests/0008_genesis_support_email_tenants.test.sql" },
      ],
      privacy: {
        notes: [
          "Keeps each support email's addresses, subject, text, Message-IDs and SPF/DKIM/DMARC results with its ticket; attachments are listed by name, type and size, not stored. Deleting a ticket deletes its emails.",
        ],
      },
    },
  });
}

/** The help desk block's id: the messenger, the help center and its AI answers, with the agent inbox. */
export const SUPPORT_HELPDESK_BLOCK_ID = "support-helpdesk" as const;

/**
 * The support-helpdesk block: what a tenant's help desk adds to support and its chat threads. It
 * brings migrations `0010_genesis_support_help_center.sql`, `0017_genesis_support_help_answers.sql`
 * and `0024_genesis_support_desks.sql` (desks). Its screens are components and hooks the
 * app routes to: `SupportMessengerLauncher`, `SupportAgentInbox` and `SupportHelpCenterAdmin` on the
 * web (`/web-chat`), the messenger's hooks on the phone (`/native`).
 */
export function defineSupportHelpdeskBlock(options: { basePath?: string; requires?: readonly string[] } = {}) {
  const paths = supportPaths(options.basePath);
  return defineBlock({
    id: SUPPORT_HELPDESK_BLOCK_ID,
    requires: options.requires ?? [SUPPORT_BLOCK_ID, SUPPORT_CHAT_BLOCK_ID],
    contributes: {
      routes: [
        { path: paths.home, description: "the messenger's Home: search, the latest conversation, articles", signedIn: true },
        { path: paths.newMessage, description: "start a conversation with support", signedIn: true },
        { path: paths.help, description: "the help center", signedIn: true },
        { path: `${paths.help}/[slug]`, description: "one help article", signedIn: true },
      ],
      migrations: [
        { package: "@marktiderman/genesis-support", file: "migrations/0010_genesis_support_help_center.sql", test: "migrations/tests/0010_genesis_support_help_center.test.sql" },
        // A question routed elsewhere keeps no answer.
        { package: "@marktiderman/genesis-support", file: "migrations/0017_genesis_support_help_answers.sql", test: "migrations/tests/0017_genesis_support_help_answers.test.sql" },
        // Desks: each tenant's own help desk, switched on by its admins; escalate, return and move (after the chat block's 0022).
        { package: "@marktiderman/genesis-support", file: "migrations/0024_genesis_support_desks.sql", test: "migrations/tests/0024_genesis_support_desks.test.sql" },
      ],
      privacy: {
        notes: ["With AI answers on, a question the person chooses to ask and its answer are kept with their account and readable by the tenant's agents, and the question and the tenant's published articles go to the AI vendor. People agree first, unless the app's terms cover it. A question the app's safety protocol routes elsewhere isn't kept."],
      },
    },
  });
}
