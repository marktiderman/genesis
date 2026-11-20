/**
 * `@marktiderman/genesis-supabase/settings/server`: the app host of the Settings screen
 * (`<GenesisSettings>` from `@marktiderman/genesis-config/settings/react`). One Fetch handler that
 * answers every op of the settings protocol (`@marktiderman/genesis-config/settings-protocol`)
 * from the app's own Supabase, as the signed-in person: it calls the database with the caller's
 * own access token, so row level security and every admin check in the migrations (0020–0024)
 * decide what they may read and write. It never holds the service-role key.
 *
 * Who sees what (the database decides; the handler asks `genesis_settings_viewer`):
 * - a **platform admin** sees every key, the health findings, secrets, upgrades, the whole history
 *   and every pending proposal, and writes the database layer, Vault secrets and decisions;
 * - a **tenant admin** (with `tenant` in the request) sees and writes that tenant's `scope: "tenant"`
 *   keys, and proposes a database-layer value for one the app locked;
 * - **anyone else signed in** sees and writes their own `scope: "person"` keys, and proposes too.
 *
 * The catalogue comes from the app manifest (`genesis settings sync` / `writeAppManifest` on every
 * deploy), the same one `set_genesis_setting` checks values against, so the screen and the
 * database never disagree about a key.
 *
 * ```ts
 * // app/api/genesis/settings/route.ts (Next.js); `genesis settings init` writes it
 * import { createSettingsHandler } from "@marktiderman/genesis-supabase/settings/server";
 * const handler = createSettingsHandler({ supabaseUrl: process.env.SUPABASE_URL!, supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY!, app: { name: "Acme" } });
 * export const POST = handler;
 * ```
 *
 * Requests: `POST`, JSON, `Authorization: Bearer <the person's Supabase access token>`, and an
 * `Origin` the handler allows (the request's own origin by default): a page on another site can't
 * drive it, even though the token, not a cookie, is the credential.
 *
 * A secret's value (`setSecret`) goes from the request body to `set_genesis_vault_secret` as a
 * parameter and nowhere else: it is never logged, never in an answer, and redacted from any error.
 *
 * @stability Beta
 * @packageDocumentation
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  catalogueFromManifest,
  resolveSettings,
  settingsSecrets,
  type ResolvedSettings,
  type SettingsCatalogue,
  type SettingsLayerValues,
  type SettingsPreset,
} from "@marktiderman/genesis-config/settings";
import {
  SETTINGS_OPS,
  SETTINGS_PROTOCOL_VERSION,
  type SettingsAuditEntry,
  type SettingsAuditPage,
  type SettingsCapabilities,
  type SettingsErrorCode,
  type SettingsFinding,
  type SettingsPlan,
  type SettingsProposalEntry,
  type SettingsSecretStatus,
  type SettingsState,
  type SettingsUpgrades,
  type SettingsViewer,
  type UpgradeDistance,
} from "@marktiderman/genesis-config/settings-protocol";
import { SupabaseQueryError, type PostgrestErrorLike } from "./index";
import { clearGenesisSetting, readSettingsLayers, setGenesisSetting, type GenesisSettingLayer, type StoredSettingsLayers } from "./settings";

/** The parts of a Supabase client the handler uses. A `SupabaseClient` fits. */
export interface SettingsHostClient {
  auth: { getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  // Loose on purpose, as in ./settings: an app's generated types may not list these functions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, ...rest: any[]) => PromiseLike<{ data: unknown; error: PostgrestErrorLike | null }>;
}

type FetchLike = (input: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Pick<Response, "ok" | "json">>;

/** @stability Beta */
export interface SettingsHandlerOptions {
  /** The project's URL. */
  supabaseUrl: string;
  /** The publishable (anon) key. Never the service-role key: every call runs as the signed-in person. */
  supabaseKey: string;
  /** What the screen shows about the app. */
  app: { name: string; slug?: string; platforms?: readonly ("web" | "ios" | "android")[] };
  /** The origins allowed to call it. Default: the request's own origin only. */
  origins?: readonly string[];
  /** Where the Upgrades tab reads each package's latest release. Default `https://registry.npmjs.org`. */
  registry?: string;
  /** Called with a failure the caller sees only as "the settings host failed" (never with a secret's value). */
  onError?: (error: unknown) => void;
  /** Test seams. */
  createClient?: (url: string, key: string, accessToken: string) => SettingsHostClient;
  fetch?: FetchLike;
}

/** The capabilities this host reports for each viewer. */
const PLATFORM_CAPABILITIES: SettingsCapabilities = Object.freeze({
  writeFiles: false,
  writeDatabase: true,
  setSecrets: Object.freeze({ vault: true }),
  runCli: false,
  agent: false,
  proposeChanges: false,
}) as SettingsCapabilities;
const SCOPED_CAPABILITIES: SettingsCapabilities = Object.freeze({
  writeFiles: false,
  writeDatabase: true,
  setSecrets: false,
  runCli: false,
  agent: false,
  proposeChanges: true,
}) as SettingsCapabilities;

const MAX_BODY = 64 * 1024;
const MAX_SECRET = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLEAR_FIX = "database.clear:";
const UPGRADES_TTL_MS = 60 * 60 * 1000;

class HostError extends Error {
  constructor(
    readonly code: SettingsErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** A database refusal as the protocol's error: the RPCs' own messages are written for people. */
function fromDatabase(error: SupabaseQueryError): HostError {
  const message = error.message.replace(/^[a-z_]+: /, "");
  switch (error.code) {
    case "42501":
      return new HostError("forbidden", message, 403);
    case "22023":
      return /\block(ed|s)\b/.test(message) ? new HostError("locked", message, 409) : new HostError("bad_request", message, 400);
    case "22004":
      return new HostError("bad_request", message, 400);
    case "P0002":
      return new HostError("not_found", message, 404);
    case "55000":
      return new HostError("error", message, 503);
    default:
      return new HostError("error", "The settings host failed.", 500);
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `1.2.3` against `1.4.0`: how far behind. Anything that isn't a plain version is `unknown`. */
export function upgradeDistance(current: string, latest: string): UpgradeDistance {
  const parse = (v: string) => /^[~^=v]*(\d+)\.(\d+)\.(\d+)/.exec(v.trim())?.slice(1, 4).map(Number);
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return "unknown";
  if (b[0]! > a[0]!) return "major";
  if (b[0]! < a[0]!) return "current";
  if (b[1]! > a[1]!) return "minor";
  if (b[1]! < a[1]!) return "current";
  return b[2]! > a[2]! ? "patch" : "current";
}

interface Viewer {
  platformAdmin: boolean;
  tenantAdmin: boolean;
  preset: SettingsPreset;
  reportedAt: string | null;
  catalogue: SettingsCatalogue;
  catalogueProblems: Array<{ key: string; message: string }>;
  packages: Record<string, string>;
  viewer: SettingsViewer;
}

interface AuditRow {
  seq: string;
  at: string;
  kind: "setting" | "secret";
  layer: "database" | "tenant" | "person" | null;
  subject: string;
  old_value: unknown;
  new_value: unknown;
  old_locked: boolean | null;
  new_locked: boolean | null;
  cleared: boolean;
  actor: string | null;
  actor_email: string | null;
}

interface ProposalRow {
  id: number | string;
  key: string;
  value: unknown;
  locked: boolean;
  reason: string | null;
  proposed_by: string;
  proposed_by_email: string | null;
  proposed_at: string;
  status: SettingsProposalEntry["status"];
  decided_by: string | null;
  decided_at: string | null;
}

/** The handler for the Settings screen's endpoint. See the module header. @stability Beta */
export function createSettingsHandler(options: SettingsHandlerOptions): (request: Request) => Promise<Response> {
  const makeClient =
    options.createClient ??
    ((url: string, key: string, accessToken: string) =>
      createSupabaseClient(url, key, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as SettingsHostClient);
  const fetchFn: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const registry = (options.registry ?? "https://registry.npmjs.org").replace(/\/+$/, "");
  let upgradesCache: { at: number; key: string; value: SettingsUpgrades } | null = null;

  /** One RPC: its data, or the database's refusal as the protocol's error. */
  async function call<T>(client: SettingsHostClient, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw fromDatabase(new SupabaseQueryError(error));
    return data as T;
  }

  /** Runs a helper from ./settings, with its database refusal mapped the same way. */
  async function db<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw fromDatabase(err);
      if (err instanceof TypeError) throw new HostError("bad_request", err.message, 400);
      throw err;
    }
  }

  async function viewerOf(client: SettingsHostClient, tenant: string | undefined): Promise<Viewer> {
    const raw = await call<Record<string, unknown>>(client, "genesis_settings_viewer", { tenant: tenant ?? null });
    const { catalogue, problems } = catalogueFromManifest(raw?.catalogue);
    const platformAdmin = raw?.platformAdmin === true;
    const tenantAdmin = raw?.tenantAdmin === true && tenant !== undefined;
    const packages = isObject(raw?.packages) ? Object.fromEntries(Object.entries(raw.packages).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
    return {
      platformAdmin,
      tenantAdmin,
      preset: (["max", "standard", "min"].includes(String(raw?.preset)) ? raw?.preset : "max") as SettingsPreset,
      reportedAt: typeof raw?.reportedAt === "string" ? raw.reportedAt : null,
      catalogue,
      catalogueProblems: problems,
      packages,
      viewer: platformAdmin ? { scope: "platform" } : tenantAdmin ? { scope: "tenant", tenant: tenant! } : { scope: "person" },
    };
  }

  /** A layer with only the keys this viewer's catalogue has. */
  const visible = (layer: SettingsLayerValues, catalogue: SettingsCatalogue): SettingsLayerValues =>
    Object.fromEntries(Object.entries(layer).filter(([key]) => Object.prototype.hasOwnProperty.call(catalogue.keys, key)));

  const resolve = (v: Viewer, stored: StoredSettingsLayers): ResolvedSettings =>
    resolveSettings(v.catalogue, {
      preset: stored.preset,
      file: visible(stored.file, v.catalogue),
      database: visible(stored.database, v.catalogue),
      tenant: visible(stored.tenant, v.catalogue),
      person: visible(stored.person, v.catalogue),
    });

  function findingsOf(v: Viewer, resolved: ResolvedSettings, secrets: readonly SettingsSecretStatus[]): SettingsFinding[] {
    const out: Omit<SettingsFinding, "id">[] = [];
    if (!v.reportedAt) {
      const instructions = "Run `genesis settings sync` on every deploy, after the migrations (or call writeAppManifest from your server at start). Until the manifest is written, no setting can be changed.";
      out.push({ rule: "settings-manifest-missing", level: "error", message: "The app manifest hasn't been written yet, so the database knows no settings.", fix: { id: "manual:settings-manifest-missing", kind: "manual", instructions } });
    }
    if (v.catalogueProblems.length) {
      out.push({
        rule: "settings-manifest-stale",
        level: "warn",
        message: `The app manifest can't describe ${v.catalogueProblems.length === 1 ? "one key" : `${v.catalogueProblems.length} keys`}, so the screen leaves ${v.catalogueProblems.length === 1 ? "it" : "them"} out: ${v.catalogueProblems.map((p) => p.message).join("; ")}`,
        fix: { id: "manual:settings-manifest-stale", kind: "manual", instructions: "Write the manifest again with this release: `genesis settings sync`." },
      });
    }
    for (const p of resolved.problems) {
      const clearable = p.layer === "database" && p.kind !== "requires";
      out.push({
        rule: `setting-${p.kind}`,
        level: p.kind === "requires" || p.kind === "preset" ? "warn" : "error",
        message: p.message,
        subject: p.key,
        ...(clearable
          ? { fix: { id: `${CLEAR_FIX}${p.key}`, kind: "auto" as const, title: `clear ${p.key} from the database layer`, databaseOnly: true } }
          : p.kind === "preset"
            ? { fix: { id: "manual:setting-preset", kind: "manual" as const, instructions: "Set `preset` in genesis.config.json to max, standard or min, then deploy." } }
            : {}),
      });
    }
    for (const s of secrets) {
      if (s.store === "vault" && s.status === "missing") {
        out.push({ rule: "secret-missing", level: "warn", message: `${s.name} isn't in Vault yet (needed by ${s.neededBy.join(", ")}).`, subject: s.name, fix: { id: "manual:secret-missing", kind: "manual", instructions: `Set ${s.name} on the Secrets tab.` } });
      }
    }
    return out.map((f, i) => ({ id: `f${i}`, ...f }));
  }

  async function secretsOf(client: SettingsHostClient, v: Viewer): Promise<SettingsSecretStatus[]> {
    const declared = settingsSecrets(v.catalogue);
    if (!declared.length) return [];
    const rows = await call<Array<{ name: string; is_set: boolean; last_rotated: string | null }>>(client, "genesis_vault_secret_status", {});
    const vault = new Map((rows ?? []).map((r) => [r.name, r]));
    const byName = new Map<string, SettingsSecretStatus & { neededBy: string[] }>();
    for (const s of declared) {
      const known = byName.get(s.name);
      if (known) {
        known.neededBy.push(s.key);
        continue;
      }
      const row = s.store === "vault" ? vault.get(s.name) : undefined;
      byName.set(s.name, {
        name: s.name,
        store: s.store,
        // Only Vault is in the database; the other stores (Edge Function secrets, the server's
        // environment, CI) can't be read from here, so their status is unknown, never guessed.
        status: s.store === "vault" ? (row?.is_set ? "set" : "missing") : "unknown",
        ...(row?.last_rotated ? { lastRotated: row.last_rotated } : {}),
        neededBy: [s.key],
      });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function upgradesOf(v: Viewer, refresh: boolean): Promise<SettingsUpgrades> {
    const names = Object.keys(v.packages).sort();
    const key = JSON.stringify(v.packages);
    if (!refresh && upgradesCache && upgradesCache.key === key && Date.now() - upgradesCache.at < UPGRADES_TTL_MS) return upgradesCache.value;
    const packages = await Promise.all(
      names.map(async (name) => {
        const current = v.packages[name]!;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetchFn(`${registry}/${name.replace("/", "%2F")}/latest`, { headers: { accept: "application/json" }, signal: controller.signal });
          const body = res.ok ? ((await res.json()) as { version?: unknown }) : null;
          const latest = typeof body?.version === "string" ? body.version : undefined;
          return { name, current, ...(latest ? { latest } : {}), distance: latest ? upgradeDistance(current, latest) : ("unknown" as const) };
        } catch {
          return { name, current, distance: "unknown" as const };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const value: SettingsUpgrades = { packages, checkedAt: new Date().toISOString() };
    upgradesCache = { at: Date.now(), key, value };
    return value;
  }

  function auditEntry(row: AuditRow): SettingsAuditEntry {
    const actor = row.actor_email ?? row.actor ?? undefined;
    if (row.kind === "secret") {
      return { id: row.seq, at: row.at, ...(actor ? { actor } : {}), action: "secret", subject: row.subject, summary: "Set in Vault" };
    }
    return {
      id: row.seq,
      at: row.at,
      ...(actor ? { actor } : {}),
      action: row.cleared ? "clear" : "set",
      subject: row.subject,
      ...(row.layer ? { layer: row.layer } : {}),
      before: row.old_value,
      ...(row.cleared ? {} : { after: row.new_value }),
      ...(row.new_locked ? { locked: true } : {}),
    };
  }

  async function auditPage(client: SettingsHostClient, v: Viewer, cursor: string | undefined, limit: number): Promise<SettingsAuditPage> {
    let before: { at: string; seq: string } | null = null;
    if (cursor !== undefined) {
      const m = /^([^|]{1,40})\|([dsv]:\d{19})$/.exec(cursor);
      if (!m || Number.isNaN(Date.parse(m[1]!))) throw new HostError("bad_request", "That cursor isn't one this host gave out.", 400);
      before = { at: m[1]!, seq: m[2]! };
    }
    const rows = await call<AuditRow[]>(client, "genesis_settings_audit", {
      tenant: v.viewer.scope === "tenant" ? v.viewer.tenant : null,
      before_at: before?.at ?? null,
      before_seq: before?.seq ?? null,
      max_rows: limit + 1,
    });
    const list = rows ?? [];
    const page = list.slice(0, limit);
    const last = page[page.length - 1];
    return { entries: page.map(auditEntry), ...(list.length > limit && last ? { next: `${last.at}|${last.seq}` } : {}) };
  }

  async function proposalsOf(client: SettingsHostClient): Promise<SettingsProposalEntry[]> {
    const rows = await call<ProposalRow[]>(client, "genesis_setting_proposals", { max_rows: 100 });
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      key: r.key,
      value: r.value,
      ...(r.locked ? { locked: true } : {}),
      ...(r.reason ? { reason: r.reason } : {}),
      proposedBy: r.proposed_by_email ?? r.proposed_by,
      proposedAt: r.proposed_at,
      status: r.status,
      ...(r.decided_by ? { decidedBy: r.decided_by } : {}),
      ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
    }));
  }

  /** The plan for clearing one bad database-layer value; its hash covers what is stored now. */
  async function clearPlan(client: SettingsHostClient, v: Viewer, fixId: string): Promise<{ plan: SettingsPlan; key: string }> {
    const key = fixId.slice(CLEAR_FIX.length);
    if (!fixId.startsWith(CLEAR_FIX) || !Object.prototype.hasOwnProperty.call(v.catalogue.keys, key)) {
      throw new HostError("not_found", `This host has no fix ${fixId}: it applies only fixes that clear a bad value from the database layer.`, 404);
    }
    const stored = await db(() => readSettingsLayers(client));
    const entry = stored.database[key];
    const problem = resolve(v, stored).problems.find((p) => p.key === key && p.layer === "database" && p.kind !== "requires");
    if (!entry || !problem) throw new HostError("not_found", `${key} has no bad value in the database layer: nothing to fix.`, 404);
    const hash = await sha256(JSON.stringify({ fixId, entry }));
    return {
      key,
      plan: {
        fixId,
        summary: `Removes ${key} from the database layer (${problem.message}). It takes its value from the layers below again.`,
        hash,
        files: [],
        commands: [],
        secrets: [],
        layers: ["database"],
      },
    };
  }

  const text = (body: Record<string, unknown>, key: string, max = 200): string => {
    const v = body[key];
    if (typeof v !== "string" || !v || v.length > max) throw new HostError("bad_request", `"${key}" must be non-empty text`, 400);
    return v;
  };

  const platformOnly = (v: Viewer, what: string) => {
    if (v.viewer.scope !== "platform") throw new HostError("forbidden", `Only platform admins ${what}.`, 403);
  };

  const declaredKey = (v: Viewer, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(v.catalogue.keys, key)) throw new HostError("not_found", `${key} isn't a setting you can see here.`, 404);
  };

  async function route(client: SettingsHostClient, body: Record<string, unknown>): Promise<unknown> {
    const tenant = body.tenant === undefined ? undefined : text(body, "tenant", 36);
    if (tenant !== undefined && !UUID.test(tenant)) throw new HostError("bad_request", `"tenant" must be a tenant id`, 400);
    const op = body.op;
    if (typeof op !== "string" || !(SETTINGS_OPS as readonly string[]).includes(op)) {
      // The protocol: an op this host doesn't know (one a newer screen sends) is `unsupported`.
      throw new HostError("unsupported", `This host doesn't know the op ${JSON.stringify(op)}.`, 501);
    }
    const v = await viewerOf(client, tenant);
    switch (op) {
      case "state": {
        const limit = isObject(body.audit) && typeof body.audit.limit === "number" ? Math.max(1, Math.min(100, Math.trunc(body.audit.limit))) : 25;
        const stored = await db(() => readSettingsLayers(client, tenant !== undefined ? { tenantId: tenant } : {}));
        const resolved = resolve(v, stored);
        const platform = v.viewer.scope === "platform";
        const secrets = platform ? await secretsOf(client, v) : [];
        const [audit, proposals, upgrades] = await Promise.all([auditPage(client, v, undefined, limit), proposalsOf(client), platform ? upgradesOf(v, false) : Promise.resolve(undefined)]);
        const layers = v.viewer.scope === "tenant" ? { tenant: visible(stored.tenant, v.catalogue) } : v.viewer.scope === "person" ? { person: visible(stored.person, v.catalogue) } : {
          file: visible(stored.file, v.catalogue),
          database: visible(stored.database, v.catalogue),
          ...(tenant !== undefined ? { tenant: visible(stored.tenant, v.catalogue) } : {}),
          person: visible(stored.person, v.catalogue),
        };
        const genesisVersion = v.packages["@marktiderman/genesis"];
        const state: SettingsState = {
          app: { name: options.app.name, ...(options.app.slug ? { slug: options.app.slug } : {}), host: "app", preset: resolved.preset, ...(genesisVersion ? { genesisVersion } : {}), ...(options.app.platforms ? { platforms: options.app.platforms } : {}) },
          catalogue: Object.values(v.catalogue.keys).sort((a, b) => a.key.localeCompare(b.key)),
          resolved,
          layers,
          findings: platform ? findingsOf(v, resolved, secrets) : [],
          secrets,
          capabilities: platform ? PLATFORM_CAPABILITIES : SCOPED_CAPABILITIES,
          ...(upgrades ? { upgrades } : {}),
          audit,
          viewer: v.viewer,
          proposals,
        };
        return state;
      }
      case "setValue":
      case "clearValue": {
        const key = text(body, "key");
        const layer = body.layer;
        if (layer === "file") {
          throw new HostError("unsupported", "This screen writes the app's database. genesis.config.json changes in the repository: genesis setup (the localhost wizard), the CLI, or a pull request.", 501);
        }
        if (layer !== "database" && layer !== "tenant" && layer !== "person") throw new HostError("bad_request", `"layer" must be database, tenant or person`, 400);
        if (layer === "database") platformOnly(v, "change the app's own values");
        if (layer === "tenant" && tenant === undefined) throw new HostError("bad_request", `the tenant layer needs "tenant"`, 400);
        declaredKey(v, key);
        const target = { layer: layer as GenesisSettingLayer, ...(tenant !== undefined ? { tenant } : {}) };
        if (op === "clearValue") {
          await db(() => clearGenesisSetting(client, key, target));
          return { ok: true };
        }
        if (!("value" in body)) throw new HostError("bad_request", `"value" is required`, 400);
        if (body.locked !== undefined && typeof body.locked !== "boolean") throw new HostError("bad_request", `"locked" must be true or false`, 400);
        await db(() => setGenesisSetting(client, { key, value: body.value, ...target, ...(body.locked === true ? { locked: true } : {}) }));
        return { ok: true };
      }
      case "plan": {
        platformOnly(v, "apply fixes");
        return { plan: (await clearPlan(client, v, text(body, "fixId"))).plan };
      }
      case "apply": {
        platformOnly(v, "apply fixes");
        const fixId = text(body, "fixId");
        const expect = text(body, "expect", 64);
        const { plan, key } = await clearPlan(client, v, fixId).catch((err: unknown) => {
          // The bad value went since the plan was made: what was approved no longer matches.
          if (err instanceof HostError && err.code === "not_found" && fixId.startsWith(CLEAR_FIX)) throw new HostError("stale_plan", "The database layer changed after this plan was made, so nothing was written. Plan it again.", 409);
          throw err;
        });
        if (plan.hash !== expect) throw new HostError("stale_plan", "The database layer changed after this plan was made, so nothing was written. Plan it again.", 409);
        await db(() => clearGenesisSetting(client, key, { layer: "database" }));
        const after = await db(() => readSettingsLayers(client));
        const verified = !Object.prototype.hasOwnProperty.call(after.database, key);
        return { result: { fixId, verified, message: verified ? `Removed ${key} from the database layer.` : `${key} is still in the database layer.` } };
      }
      case "upgrades":
        platformOnly(v, "check for upgrades");
        return upgradesOf(v, body.refresh === true);
      case "audit": {
        const limit = typeof body.limit === "number" ? Math.max(1, Math.min(100, Math.trunc(body.limit))) : 25;
        return auditPage(client, v, body.cursor === undefined ? undefined : text(body, "cursor", 80), limit);
      }
      case "propose": {
        const key = text(body, "key");
        declaredKey(v, key);
        if (!("value" in body)) throw new HostError("bad_request", `"value" is required`, 400);
        if (body.locked !== undefined && typeof body.locked !== "boolean") throw new HostError("bad_request", `"locked" must be true or false`, 400);
        const reason = body.reason === undefined ? null : text(body, "reason", 1000);
        const id = await call<number | string>(client, "propose_genesis_setting", { key, value: body.value === undefined ? null : body.value, locked: body.locked === true, reason });
        return { id: String(id) };
      }
      case "decideProposal": {
        platformOnly(v, "decide proposals");
        const id = text(body, "id", 20);
        if (!/^\d+$/.test(id)) throw new HostError("bad_request", `"id" must be a proposal id`, 400);
        if (typeof body.approve !== "boolean") throw new HostError("bad_request", `"approve" must be true or false`, 400);
        await call(client, "decide_genesis_setting_proposal", { proposal: Number(id), approve: body.approve });
        return { ok: true };
      }
      case "setSecret": {
        platformOnly(v, "set secrets");
        const name = text(body, "name", 100);
        if (body.store !== "vault") throw new HostError("bad_request", "This host sets Vault secrets only.", 400);
        if (!settingsSecrets(v.catalogue).some((s) => s.name === name && s.store === "vault")) throw new HostError("bad_request", `${name} isn't a Vault secret any installed package declares.`, 400);
        const value = body.value;
        if (typeof value !== "string" || !value.trim() || value.length > MAX_SECRET) throw new HostError("bad_request", `The value must be 1 to ${MAX_SECRET} characters, not only spaces.`, 400);
        await call(client, "set_genesis_vault_secret", { name, value });
        return { ok: true };
      }
    }
    throw new HostError("unsupported", `This host doesn't know the op ${JSON.stringify(op)}.`, 501);
  }

  function originAllowed(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return false;
    const allowed = options.origins ?? [new URL(request.url).origin];
    return allowed.includes(origin);
  }

  return async function handleSettings(request: Request): Promise<Response> {
    // Every string this request carried that must never be shown: a secret's value.
    let secret: string | null = null;
    const redact = (s: string) => (secret ? s.split(secret).join("•••") : s);
    try {
      if (request.method !== "POST") throw new HostError("bad_request", "POST only.", 405);
      if (!originAllowed(request)) throw new HostError("forbidden", "This endpoint answers its own site only.", 403);
      if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) throw new HostError("bad_request", "Send JSON (content-type: application/json).", 415);
      const auth = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!auth) throw new HostError("unauthenticated", "Sign in to change settings.", 401);
      const raw = await request.text();
      if (raw.length > MAX_BODY) throw new HostError("bad_request", "The request is too large.", 413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HostError("bad_request", "The body isn't JSON.", 400);
      }
      if (!isObject(body)) throw new HostError("bad_request", "The body must be an object.", 400);
      if (body.op === "setSecret" && typeof body.value === "string" && body.value) secret = body.value;
      if (body.v !== SETTINGS_PROTOCOL_VERSION) throw new HostError("version", `This host speaks settings protocol ${SETTINGS_PROTOCOL_VERSION}.`, 400);
      const client = makeClient(options.supabaseUrl, options.supabaseKey, auth[1]!);
      const { data, error } = await client.auth.getUser(auth[1]!);
      if (error || !data?.user?.id) throw new HostError("unauthenticated", "Your sign-in has expired: sign in again.", 401);
      return json(200, await route(client, body));
    } catch (err) {
      if (err instanceof HostError) return json(err.status, { error: { code: err.code, message: redact(err.message) } });
      if (options.onError) {
        const safe = err instanceof Error ? Object.assign(new Error(redact(err.message)), { name: err.name }) : new Error(redact(String(err)));
        options.onError(safe);
      }
      return json(500, { error: { code: "error", message: "The settings host failed." } });
    } finally {
      secret = null;
    }
  };
}
