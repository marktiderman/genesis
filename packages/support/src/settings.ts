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
  type SettingValueOf,
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
  messenger: { type: "boolean", default: onOnOff, scope: "tenant", requires: ["support.inbox"], summary: "The messenger (Home, Messages, Help) on web and phone." },
  agentDesk: { type: "boolean", default: onOnOff, requires: ["support.inbox"], summary: "The staff side: the agent inbox on the web and the phone." },
  helpCenter: { type: "boolean", default: onOnOff, scope: "tenant", summary: "Help articles in collections, searchable, with an admin editor." },
  aiAnswers: { type: "boolean", default: onOffOff, scope: "tenant", requires: ["support.helpCenter"], feature: "support-helpdesk-ai", needs: "secret:ANTHROPIC_API_KEY", store: "edge", planned: true, summary: "Planned (nothing reads it yet): AI answers that cite the help center and hand off to a person (needs the person's consent and a provider key)." },
  ideas: { type: "boolean", default: onOnOff, summary: "The idea board with votes, and the ideas the person asked for that shipped." },
  chatThreads: { type: "boolean", default: onOnOff, feature: "support-chat", planned: true, summary: "Planned (nothing reads it yet): A report's thread runs on genesis-chat: live, with files, an assignee and internal notes." },
  email: { type: "boolean", default: onOffOff, feature: "support-email", needs: "secret:RESEND_API_KEY", store: "edge", summary: "Email is a ticket channel: inbound mail opens or continues a ticket, replies go out threaded." },
  replyByEmail: { type: "boolean", default: onOffOff, requires: ["support.email"], needs: "secret:SUPPORT_REPLY_SIGNING_SECRET", store: "server-env", summary: "Reply by email: a signed Reply-To per recipient, quoted text stripped, auto-replies ignored." },
  desks: { type: "boolean", default: onOffOff, requires: ["support.agentDesk"], summary: "Desks: each tenant's own help desk, switched on per tenant, with escalate, return and move between desks." },
  staffAlerts: { type: "boolean", default: onOnOff, summary: "Tell staff about a new report (the app's notifiers: email, push, webhook)." },
  githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", store: "edge", setup: "github.issues", summary: "owner/name: open a GitHub issue for each new report. Not set, no issues." },
  githubIssueDetail: { type: "string", default: "summary", options: ["summary", "full"], summary: "What an issue carries: the summary only, or (private repositories only) the dump's detail too." },
  webhookUrl: { type: "string", default: null, needs: "secret:SUPPORT_WEBHOOK_SIGNING_SECRET", store: "edge", summary: "A signed POST for each new report. Not set, no webhook." },
  contactEmail: { type: "string", default: null, summary: "Where people can write when the app can't help (shown in Help and on error screens)." },
  contactUrl: { type: "string", default: null, summary: "A support page, shown beside the contact email." },
  agentListScan: { type: "boolean", default: false, summary: "Agents' assignee lists check every login, not only agent rows and the app's private.genesis_support_staff_list(): slow on a big app." },
  replyExpectation: { type: "string", default: null, scope: "tenant", summary: "How soon people hear back, after \"We usually reply\" (\"within a few hours\")." },
  verifyPrompt: { type: "boolean", default: false, summary: "When someone else marks a report fixed, ask its person in the thread to check the fix (at most once an hour). Off unless turned on." },
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

/** A spec's default may be `null` ("not set"), plainly or for some preset. */
type NullableDefault<D> = D extends null ? true : D extends { readonly max: infer A; readonly standard: infer B; readonly min: infer C } ? (null extends A | B | C ? true : false) : false;

/** The value one spec holds: its type's value, narrowed to its options, or null when it may be unset. */
type SpecValue<S extends SettingSpec> =
  | (S extends { readonly options: readonly (infer O)[] } ? O : SettingValueOf<S["type"]>)
  | (NullableDefault<S["default"]> extends true ? null : never);

/** One namespace's values, from its specs. */
type SpecValues<Specs extends { readonly [key: string]: SettingSpec }> = { -readonly [K in keyof Specs]: SpecValue<Specs[K]> };

/** Support's settings, typed: derived from the specs above, so a key is declared once. @stability Beta */
export interface SupportSettingValues {
  support: SpecValues<typeof SUPPORT_SETTING_SPECS>;
  diagnostics: SpecValues<typeof DIAGNOSTICS_SETTING_SPECS>;
  shake: SpecValues<typeof SHAKE_SETTING_SPECS>;
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

/** One address, checked in one pass (no backtracking): one "@", no spaces or brackets, a dot in the domain, not at its ends. */
function looksLikeEmail(text: string): boolean {
  if (text.length > 254) return false;
  let at = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 0x20 || c === 0x3c || c === 0x3e || c === 0x7f) return false;
    if (c === 0x40) {
      if (at !== -1) return false;
      at = i;
    }
  }
  const dot = text.lastIndexOf(".");
  return at > 0 && dot > at + 1 && dot < text.length - 1;
}

/** An https page with a host (`https://acme.test/help`), else null. */
function httpsPage(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t || t.length > 2048 || !/^https:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && u.hostname ? t : null;
  } catch {
    return null;
  }
}

/**
 * A `mailto:` link for an address, with the characters that would start its query or fragment (or
 * escape) encoded (RFC 6068): `help?desk@acme.test` stays one mailbox.
 *
 * @stability Beta
 */
export function mailtoHref(email: string): string {
  return `mailto:${email.replace(/[%?#&/]/g, (c) => encodeURIComponent(c))}`;
}

/** Where people can write when the app can't help: `support.contactEmail` and `support.contactUrl`. @stability Beta */
export interface SupportContactInfo {
  email: string | null;
  url: string | null;
}

/**
 * The contact fallback from the settings (`support.contactEmail`, `support.contactUrl`): an email
 * address that looks like one and an https page, or null with neither. Shown in Help and on error
 * screens.
 *
 * @stability Beta
 */
export function supportContact(input?: SupportSettingsInput | null): SupportContactInfo | null {
  const s = supportSettingValues(input).support;
  const email = s.contactEmail?.trim() && looksLikeEmail(s.contactEmail.trim()) ? s.contactEmail.trim() : null;
  const url = httpsPage(s.contactUrl);
  return email || url ? { email, url } : null;
}
