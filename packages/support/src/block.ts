/**
 * The support block as a `defineBlock` declaration: what it adds to an app
 * (two Settings rows, its routes, migration 0006) and what it means for the
 * stores' privacy forms. Platform-neutral; `createSupport` (native) builds
 * on it, and a web app can resolve it with `resolveBlocks` too.
 */
import { defineBlock, type BlockContributions, type BlockSettingsRow } from "@marktiderman/genesis-features/blocks";
import { resolveSupportCopy, type SupportCopyOverrides } from "./copy";

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
}

export function supportPaths(basePath = "/support"): SupportPaths {
  const base = basePath.replace(/\/$/, "") || "/support";
  return {
    inbox: base,
    feedback: `${base}/new`,
    thread: (id) => `${base}/${encodeURIComponent(id)}`,
    ideas: `${base}/ideas`,
    shipped: `${base}/shipped`,
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
        { id: "support-send-feedback", section, title: copy.settings.sendFeedback, href: paths.feedback, order: 10, testID: "genesis-support-send-feedback" },
        { id: "support-help", section, title: copy.settings.help, href: paths.inbox, order: 20, testID: "genesis-support-help", useSubtitle: options.useHelpSubtitle },
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
    migrations: [{ package: PACKAGE, file: "migrations/0006_genesis_support.sql", test: "migrations/tests/0006_genesis_support.test.sql" }],
    privacy: {
      collects: [
        { type: "user id", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "customer support", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "other user content", purposes: ["app functionality", "product personalization"], linked: true, tracking: false },
        { type: "photos or videos", purposes: ["app functionality"], linked: true, tracking: false },
        { type: "other diagnostic data", purposes: ["app functionality"], linked: true, tracking: false },
      ],
      notes: [
        "Feedback is sent only when the person taps Send; a screenshot only when they keep it, after they can hide parts of it.",
        "Reports, screenshots and replies are visible to the person and the app's support staff only, and go when the person deletes them or their account.",
        "Feedback includes the app version, the screen's path (never its query string), the platform and basic device facts.",
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
