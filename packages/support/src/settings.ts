/**
 * Support's settings, declared with genesis-config (`defineSettings`): every switch and number
 * support, the context dump and shake to report read, with a default for each preset (`max`, the
 * default, turns everything on; `standard` leaves out AI answers, email and desks; `min` is the
 * feedback form and the dump).
 *
 * Three namespaces, because a key is `namespace.key` (one level):
 *
 * - `support.*`: the features (the feedback form, the person's inbox, the messenger, the agent
 *   desk, the help center, AI answers, the idea board, chat threads, email, desks, staff alerts),
 *   the GitHub issue sink and webhook, and the contact fallback;
 * - `diagnostics.*`: the context dump (on, when it goes, its size, how long it's kept, how many an
 *   hour);
 * - `shake.*`: shake to report (on or off for each person, and how hard).
 *
 * The same declarations are in this package's package.json (`genesis.settings`), so the CLI's
 * doctor checks an app's genesis.config.json without running the package; a test keeps the two
 * the same.
 *
 * Reading them: `createSupport`, `createDiagnostics`, `FeedbackPanel` and the server handler take
 * `settings` (what `resolveSettings` returned, or the values alone) and read their keys through
 * {@link supportSettingValues}. An explicit option still wins over a setting, so existing code
 * keeps working; with neither, the `max` preset applies (zero config is everything on).
 */
import {
  defineSettings,
  resolveSettings,
  settingsCatalogue,
  settingValueProblem,
  type ResolvedSettings,
  type SettingsCatalogue,
  type SettingsDeclaration,
  type SettingsLayers,
  type SettingSpec,
} from "@marktiderman/genesis-config/settings";

const onOffOff = { max: true, standard: false, min: false } as const;
const onOnOff = { max: true, standard: true, min: false } as const;

/** `support.*`, as declared (and as package.json `genesis.settings` repeats it). @stability Beta */
export const SUPPORT_SETTING_SPECS = {
  feedback: { type: "boolean", default: true, feature: "support-feedback", summary: "The feedback form (bug, idea, question, praise) with a marked-up screenshot." },
  screenshots: { type: "boolean", default: true, requires: ["support.feedback"], summary: "Offer to include a screenshot with feedback (the person still chooses)." },
  pins: { type: "boolean", default: true, requires: ["support.feedback"], summary: "Web: pin feedback to a place on the page." },
  severity: { type: "boolean", default: false, requires: ["support.feedback"], summary: "Ask how bad a bug is (Minor, Annoying, Blocks me, Broken). Off unless turned on." },
  inbox: { type: "boolean", default: onOnOff, summary: "The person's reports, with staff replies and the unread badge." },
  messenger: { type: "boolean", default: onOnOff, scope: "tenant", requires: ["support.inbox"], summary: "Planned (nothing reads it yet): The messenger (Home, Messages, Help) on web and phone." },
  agentDesk: { type: "boolean", default: onOnOff, requires: ["support.inbox"], summary: "Planned (nothing reads it yet): The staff side: the agent inbox on the web and the phone." },
  helpCenter: { type: "boolean", default: onOnOff, scope: "tenant", summary: "Planned (nothing reads it yet): Help articles in collections, searchable, with an admin editor." },
  aiAnswers: { type: "boolean", default: onOffOff, scope: "tenant", requires: ["support.helpCenter"], feature: "support-helpdesk-ai", needs: "secret:ANTHROPIC_API_KEY", store: "edge", summary: "Planned (nothing reads it yet): AI answers that cite the help center and hand off to a person (needs the person's consent and a provider key)." },
  ideas: { type: "boolean", default: onOnOff, summary: "The idea board with votes, and the ideas the person asked for that shipped." },
  chatThreads: { type: "boolean", default: onOnOff, feature: "support-chat", summary: "Planned (nothing reads it yet): A report's thread runs on genesis-chat: live, with files, an assignee and internal notes." },
  email: { type: "boolean", default: onOffOff, feature: "support-email", needs: "secret:RESEND_API_KEY", store: "edge", summary: "Planned (nothing reads it yet): Email is a ticket channel: inbound mail opens or continues a ticket, replies go out threaded." },
  replyByEmail: { type: "boolean", default: onOffOff, requires: ["support.email"], needs: "secret:SUPPORT_REPLY_SIGNING_SECRET", store: "server-env", summary: "Planned (nothing reads it yet): Reply by email: a signed Reply-To per recipient, quoted text stripped, auto-replies ignored." },
  desks: { type: "boolean", default: onOffOff, requires: ["support.agentDesk"], summary: "Planned (nothing reads it yet): Desks: each tenant's own help desk, switched on per tenant, with escalate, return and move between desks." },
  staffAlerts: { type: "boolean", default: onOnOff, summary: "Planned (nothing reads it yet): Tell staff about a new report (the app's notifiers: email, push, webhook)." },
  githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", store: "edge", summary: "Planned (nothing reads it yet): owner/name: open a GitHub issue for each new report. Not set, no issues." },
  githubIssueDetail: { type: "string", default: "summary", options: ["summary", "full"], summary: "Planned (nothing reads it yet): What an issue carries: the summary only, or (private repositories only) the dump's detail too." },
  webhookUrl: { type: "string", default: null, needs: "secret:SUPPORT_WEBHOOK_SIGNING_SECRET", store: "edge", summary: "Planned (nothing reads it yet): A signed POST for each new report. Not set, no webhook." },
  contactEmail: { type: "string", default: null, summary: "Planned (nothing reads it yet): Where people can write when the app can't help (shown in Help and on error screens)." },
  contactUrl: { type: "string", default: null, summary: "Planned (nothing reads it yet): A support page, shown beside the contact email." },
  agentListScan: { type: "boolean", default: false, summary: "Agents' assignee lists check every login, not only agent rows and the app's private.genesis_support_staff_list(): slow on a big app." },
  replyExpectation: { type: "string", default: null, scope: "tenant", summary: "How soon people hear back, after \"We usually reply\" (\"within a few hours\")." },
} as const satisfies Record<string, SettingSpec>;

/** `diagnostics.*`: the context dump. @stability Beta */
export const DIAGNOSTICS_SETTING_SPECS = {
  enabled: { type: "boolean", default: true, summary: "The context dump (genesis.diagnostics/1) in the app's own Supabase." },
  dumpOnShake: { type: "boolean", default: true, requires: ["diagnostics.enabled"], summary: "Send a dump when the phone is shaken." },
  dumpOnFeedback: { type: "boolean", default: true, requires: ["diagnostics.enabled"], summary: "Send a dump with every piece of feedback, linked by its id." },
  sendFromSettings: { type: "boolean", default: true, requires: ["diagnostics.enabled"], summary: "\"Send diagnostics\" for everyone (Settings, the Development screen)." },
  offlineQueue: { type: "boolean", default: true, requires: ["diagnostics.enabled"], summary: "Keep a dump that couldn't be sent and try again when back online." },
  maxBytes: { type: "number", integer: true, default: 262_144, min: 65_536, max: 524_288, summary: "A dump's size, JSON before gzip; over it the oldest entries go first. At most 512 KB, the most the database stores." },
  perHour: { type: "number", integer: true, default: 10, min: 1, max: 100, summary: "Dumps one person may send in an hour." },
  retentionDays: { type: "number", integer: true, default: 90, min: 7, max: 365, summary: "Days a dump is kept before the cleanup removes it." },
} as const satisfies Record<string, SettingSpec>;

/** `shake.*`: shake to report. @stability Beta */
export const SHAKE_SETTING_SPECS = {
  enabled: { type: "boolean", default: true, scope: "person", summary: "Shake the phone to report a problem. Each person can turn it off." },
  threshold: { type: "number", default: 2.3, min: 1.2, max: 8, summary: "Acceleration, in g, that counts as a jolt." },
  jolts: { type: "number", integer: true, default: 2, min: 1, max: 10, summary: "Jolts needed within the window." },
  windowMs: { type: "number", integer: true, default: 1000, min: 200, max: 5000, summary: "The window the jolts must fall in, in milliseconds." },
  cooldownMs: { type: "number", integer: true, default: 3000, min: 500, max: 60_000, summary: "Quiet time after a shake, in milliseconds." },
} as const satisfies Record<string, SettingSpec>;

/** @stability Beta */
export const supportSettings = defineSettings("support", SUPPORT_SETTING_SPECS);
/** @stability Beta */
export const diagnosticsSettings = defineSettings("diagnostics", DIAGNOSTICS_SETTING_SPECS);
/** @stability Beta */
export const shakeSettings = defineSettings("shake", SHAKE_SETTING_SPECS);

/** Every declaration this package makes, for the app's catalogue. @stability Beta */
export const SUPPORT_SETTINGS_DECLARATIONS: readonly SettingsDeclaration[] = [supportSettings, diagnosticsSettings, shakeSettings];

let catalogue: SettingsCatalogue | null = null;

/** Support's keys alone as a catalogue (an app builds one catalogue from every package's declarations). @stability Beta */
export function supportSettingsCatalogue(): SettingsCatalogue {
  return (catalogue ??= settingsCatalogue(SUPPORT_SETTINGS_DECLARATIONS));
}

/** Resolve support's keys alone, through the given layers. No layers: the `max` preset. @stability Beta */
export function resolveSupportSettings(layers: SettingsLayers = {}): ResolvedSettings {
  return resolveSettings(supportSettingsCatalogue(), layers);
}

/**
 * What a support function takes as `settings`: what `resolveSettings` (or genesis-supabase's
 * `resolveAppSettings`) returned, with keys from other packages too, or the values alone by full key.
 *
 * @stability Beta
 */
export type SupportSettingsInput = Pick<ResolvedSettings, "values"> | { readonly [key: string]: unknown };

/** Support's settings, typed. @stability Beta */
export interface SupportSettingValues {
  support: {
    feedback: boolean;
    screenshots: boolean;
    pins: boolean;
    severity: boolean;
    inbox: boolean;
    messenger: boolean;
    agentDesk: boolean;
    helpCenter: boolean;
    aiAnswers: boolean;
    ideas: boolean;
    chatThreads: boolean;
    email: boolean;
    replyByEmail: boolean;
    desks: boolean;
    staffAlerts: boolean;
    githubRepo: string | null;
    githubIssueDetail: "summary" | "full";
    webhookUrl: string | null;
    contactEmail: string | null;
    contactUrl: string | null;
    agentListScan: boolean;
    replyExpectation: string | null;
  };
  diagnostics: {
    enabled: boolean;
    dumpOnShake: boolean;
    dumpOnFeedback: boolean;
    sendFromSettings: boolean;
    offlineQueue: boolean;
    maxBytes: number;
    perHour: number;
    retentionDays: number;
  };
  shake: {
    enabled: boolean;
    threshold: number;
    jolts: number;
    windowMs: number;
    cooldownMs: number;
  };
}

function valuesOf(input: SupportSettingsInput | null | undefined): { readonly [key: string]: unknown } {
  if (!input) return {};
  // A ResolvedSettings (or `{ values }`): no full key is ever called `values` (keys are `namespace.key`).
  const maybe = own(input as { readonly [key: string]: unknown }, "values");
  if (typeof maybe === "object" && maybe !== null && !Array.isArray(maybe)) return maybe as { readonly [key: string]: unknown };
  return input as { readonly [key: string]: unknown };
}

function own(values: { readonly [key: string]: unknown }, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/**
 * Support's settings as typed values. A key the input doesn't have, or has with a value that
 * doesn't fit (a hand-written map), takes its `max` default, so a partial map is safe. No input:
 * every key at `max` (zero config).
 *
 * ```ts
 * const s = supportSettingValues(resolved);
 * if (s.support.ideas) …
 * ```
 *
 * @stability Beta
 */
export function supportSettingValues(input?: SupportSettingsInput | null): SupportSettingValues {
  const values = valuesOf(input);
  const out: Record<string, Record<string, unknown>> = { support: {}, diagnostics: {}, shake: {} };
  for (const decl of SUPPORT_SETTINGS_DECLARATIONS) {
    for (const def of Object.values(decl.keys)) {
      const name = def.key.slice(decl.namespace.length + 1);
      const v = own(values, def.key);
      out[decl.namespace]![name] = v !== undefined && settingValueProblem(def, v) === null ? v : def.defaults.max;
    }
  }
  return out as unknown as SupportSettingValues;
}
