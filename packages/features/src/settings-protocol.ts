/**
 * `@marktiderman/genesis-config/settings-protocol`: the wire between the Settings screen and the
 * host that serves it. One UI, two hosts (config-layer §4):
 *
 * - the **CLI host** (`genesis setup`, the localhost wizard) reads and writes the files, and the
 *   database through the developer's linked project;
 * - the **app host** (the platform-admin Settings screen) writes the database layer only.
 *
 * One endpoint, `POST`, JSON in and out, a bearer token in a header (never a cookie), every request
 * `{ v, op, … }`. What a host can do is its {@link SettingsCapabilities}; the screen hides or
 * disables every write the host can't do, and the host refuses it anyway.
 *
 * Secrets travel by name and status only: no type here has a field for a secret's value.
 *
 * No zod, React, Node built-ins or DOM globals beyond `fetch`'s types: it ships to browsers, the
 * CLI and edge functions alike.
 */
import {
  SETTINGS_LAYERS,
  type ResolvedSettings,
  type SecretStore,
  type SettingDef,
  type SettingsLayer,
  type SettingsLayerValues,
  type SettingsPreset,
} from "./settings";

/** Bumped on any incompatible change; a host rejects other versions with `version`. @stability Beta */
export const SETTINGS_PROTOCOL_VERSION = 1;

/**
 * What the host serving the screen can do. The screen shows a write only when its capability is
 * true; the host checks again.
 *
 * - `writeFiles`: genesis.config.json and the app's files (the CLI host).
 * - `writeDatabase`: the `genesis_settings` table (both hosts).
 * - `setSecrets`: put a secret in its store, per store (`{ vault: true }`), or `true` for every
 *   store. The CLI host sets them through the developer's own CLIs; the app host may set and
 *   rotate Vault secrets only (`setSecret`, write-only), when it says so.
 * - `runCli`: run `supabase`, `gh`, `eas` and the package manager (the CLI host).
 * - `agent`: "Fix with Claude" (the CLI host, when the Agent SDK is installed).
 * - `proposeChanges`: open a pull request for a file-layer change (`propose`). Optional; off when absent.
 *
 * @stability Beta
 */
export interface SettingsCapabilities {
  writeFiles: boolean;
  writeDatabase: boolean;
  setSecrets: boolean | SecretStoreCapabilities;
  runCli: boolean;
  agent: boolean;
  proposeChanges?: boolean;
}

/** Which secret stores a host can write. A store left out can't be written. @stability Beta */
export type SecretStoreCapabilities = { readonly [S in SecretStore]?: boolean };

const SECRET_STORES: readonly SecretStore[] = ["vault", "edge", "server-env", "ci"];

/** Whether the host can write a secret in this store. @stability Beta */
export function canSetSecret(capabilities: Pick<SettingsCapabilities, "setSecrets">, store: SecretStore): boolean {
  const s = capabilities.setSecrets;
  return typeof s === "boolean" ? s : s?.[store] === true;
}

/** Nothing: a read-only screen. @stability Beta */
export const NO_SETTINGS_CAPABILITIES: Readonly<SettingsCapabilities> = Object.freeze({
  writeFiles: false,
  writeDatabase: false,
  setSecrets: false,
  runCli: false,
  agent: false,
  proposeChanges: false,
});

/**
 * The most the app host may do: the database layer, and Vault secrets when the host reports it can.
 * Pass it as the screen's `capabilities` prop: it is a mask, so Vault is offered only when the host
 * itself says `setSecrets: { vault: true }`.
 *
 * @stability Beta
 */
export const APP_HOST_CAPABILITIES: Readonly<SettingsCapabilities> = Object.freeze({
  ...NO_SETTINGS_CAPABILITIES,
  writeDatabase: true,
  setSecrets: Object.freeze({ vault: true }),
});

/**
 * Both sets at once: a write is allowed only when both allow it. The screen narrows the host's
 * capabilities with its own `capabilities` prop this way; a prop can never widen what the host
 * reports. A key the prop leaves out doesn't narrow; only `false` does.
 *
 * @stability Beta
 */
export function intersectCapabilities(a: SettingsCapabilities, b?: Partial<SettingsCapabilities>): SettingsCapabilities {
  if (!b) return { ...a };
  const both = (x: boolean, y: boolean | undefined) => x === true && y !== false;
  let setSecrets: SettingsCapabilities["setSecrets"];
  if (typeof a.setSecrets === "boolean" && (b.setSecrets === undefined || typeof b.setSecrets === "boolean")) {
    setSecrets = both(a.setSecrets, b.setSecrets);
  } else {
    const out: { [S in SecretStore]?: boolean } = {};
    for (const store of SECRET_STORES) {
      const allowed = canSetSecret(a, store) && (b.setSecrets === undefined || canSetSecret({ setSecrets: b.setSecrets }, store));
      if (allowed) out[store] = true;
    }
    const count = Object.keys(out).length;
    // No store left is `false` (an empty object would read as truthy); every store is `true`.
    setSecrets = count === 0 ? false : count === SECRET_STORES.length ? true : out;
  }
  return {
    writeFiles: both(a.writeFiles, b.writeFiles),
    writeDatabase: both(a.writeDatabase, b.writeDatabase),
    setSecrets,
    runCli: both(a.runCli, b.runCli),
    agent: both(a.agent, b.agent),
    proposeChanges: both(a.proposeChanges === true, b.proposeChanges),
  };
}

/** Which host is serving: the localhost wizard or the app's own screen. @stability Beta */
export type SettingsHost = "cli" | "app";

/** What the screen shows about the app. @stability Beta */
export interface SettingsAppFacts {
  name: string;
  slug?: string;
  host: SettingsHost;
  preset: SettingsPreset;
  /** The installed `@marktiderman/genesis-*` release, when known. */
  genesisVersion?: string;
  platforms?: readonly ("web" | "ios" | "android")[];
}

/**
 * How a finding is fixed. `auto`: planned and applied by Genesis. `guided`: a setup step the
 * person walks through. `manual`: instructions only.
 *
 * @stability Beta
 */
export type SettingsFixKind = "auto" | "guided" | "manual";

/** A finding's fix, by reference (the plan is made on request, never sent with the state). @stability Beta */
export interface SettingsFixRef {
  /** The fix id `plan` and `apply` take, e.g. `upgrade.release`, or `manual:<rule>`. */
  id: string;
  kind: SettingsFixKind;
  title?: string;
  /** A guided fix's setup step id (`genesis setup --step <id>`). */
  step?: string;
  /** Where a guided step opens, when the host has a page for it. */
  href?: string;
  /** A manual fix's instructions (plain text, may hold several lines). */
  instructions?: string;
  /**
   * An automatic fix that writes the database layer and nothing else (no files, no commands, no
   * secrets): the app host can apply it with `writeDatabase`.
   */
  databaseOnly?: boolean;
}

/** @stability Beta */
export type SettingsFindingLevel = "error" | "warn" | "info";

/** One doctor finding. @stability Beta */
export interface SettingsFinding {
  /** Stable within one `state`: the screen keys rows and test ids on it. */
  id: string;
  rule: string;
  level: SettingsFindingLevel;
  message: string;
  file?: string;
  line?: number;
  /** The setting key or package the finding is about. */
  subject?: string;
  fix?: SettingsFixRef;
}

/** @stability Beta */
export type SecretState = "set" | "missing" | "unknown";

/** One secret the app needs, by name: never its value. @stability Beta */
export interface SettingsSecretStatus {
  name: string;
  store: SecretStore;
  status: SecretState;
  /** ISO time it was last set, when the store says. */
  lastRotated?: string;
  /** The setting keys (or block functions) that need it. */
  neededBy: readonly string[];
}

/** How far a package is behind its latest release. @stability Beta */
export type UpgradeDistance = "current" | "patch" | "minor" | "major" | "unknown";

/** @stability Beta */
export interface SettingsPackageUpgrade {
  name: string;
  current: string;
  latest?: string;
  distance: UpgradeDistance;
  /** An advisory affects the installed version. */
  advisory?: boolean;
  /** The changelog lines that matter to this app. */
  notes?: string;
  notesUrl?: string;
}

/** @stability Beta */
export interface SettingsUpgrades {
  packages: readonly SettingsPackageUpgrade[];
  /** ISO time of the registry check. */
  checkedAt?: string;
  /** The check used its cache: the network was off. */
  offline?: boolean;
  /** The upgrade fix (`upgrade.release`), when there is something to upgrade. */
  fix?: SettingsFixRef;
}

/** @stability Beta */
export type SettingsAuditAction = "set" | "clear" | "fix" | "upgrade" | "secret";

/** One change in the history. Secrets appear by name only. @stability Beta */
export interface SettingsAuditEntry {
  id: string;
  /** ISO time. */
  at: string;
  /** Who made it: an email, a user id or `cli`. */
  actor?: string;
  action: SettingsAuditAction;
  /** The setting key, fix id, package or secret name. */
  subject: string;
  layer?: SettingsLayer;
  before?: unknown;
  after?: unknown;
  locked?: boolean;
  summary?: string;
}

/** A page of the history, newest first. @stability Beta */
export interface SettingsAuditPage {
  entries: readonly SettingsAuditEntry[];
  /** Pass to `audit` for the next page; absent on the last. */
  next?: string;
}

/**
 * What `state` returns: everything the screen draws.
 *
 * `layers` are the raw file and database layers (what each holds for a key, and whether it is
 * locked there), so the screen can tell "set here" from "inherited", and offer to clear a layer's
 * own value.
 *
 * @stability Beta
 */
export interface SettingsState {
  app: SettingsAppFacts;
  /** The catalogue's keys (`SettingDef`, serialised). */
  catalogue: readonly SettingDef[];
  resolved: ResolvedSettings;
  layers: { file?: SettingsLayerValues; database?: SettingsLayerValues };
  findings: readonly SettingsFinding[];
  secrets: readonly SettingsSecretStatus[];
  capabilities: SettingsCapabilities;
  upgrades?: SettingsUpgrades;
  audit?: SettingsAuditPage;
}

/** A file a fix writes. `diff` is unified, for the screen; the host keeps the content. @stability Beta */
export interface SettingsPlanFile {
  path: string;
  why: string;
  diff?: string;
  /** The file is new. */
  created?: boolean;
}

/** A command a fix runs. Secrets reach a command on stdin, never in `args`. @stability Beta */
export interface SettingsPlanCommand {
  tool: string;
  args: readonly string[];
  why: string;
}

/**
 * A fix's plan, as the screen shows it before anything is written. `hash` goes back to `apply` as
 * `expect`: the host re-plans and refuses (`stale_plan`) when anything changed in between.
 *
 * @stability Beta
 */
export interface SettingsPlan {
  fixId: string;
  summary: string;
  hash: string;
  files: readonly SettingsPlanFile[];
  commands: readonly SettingsPlanCommand[];
  /** The secrets it needs, by name. */
  secrets: readonly string[];
  /** The settings layers it writes (a fix that only seeds `genesis_settings` writes `database`). */
  layers?: readonly SettingsWriteLayer[];
  /** Steps the person does by hand after it. */
  manual?: string;
}

/** What `apply` returns. @stability Beta */
export interface SettingsApplyResult {
  fixId: string;
  /** The fix's own check passed after it ran. */
  verified: boolean;
  message?: string;
  /** A pull request it opened (the upgrade fix). */
  pullRequestUrl?: string;
}

/** What `propose` returns: a pull request, or the change to make by hand. @stability Beta */
export interface SettingsProposal {
  pullRequestUrl?: string;
  /** The genesis.config.json fragment to commit. */
  snippet: string;
}

/** The layers a person can write from the screen. @stability Beta */
export type SettingsWriteLayer = "file" | "database";

/**
 * Every request. `audit` takes a cursor from the last page; `upgrades` with `refresh` skips the
 * host's cache.
 *
 * @stability Beta
 */
export type SettingsRequest =
  | { op: "state"; audit?: { limit?: number } }
  | { op: "setValue"; key: string; value: unknown; locked?: boolean; layer: SettingsWriteLayer }
  | { op: "clearValue"; key: string; layer: SettingsWriteLayer }
  | { op: "plan"; fixId: string }
  | { op: "apply"; fixId: string; expect: string }
  | { op: "upgrades"; refresh?: boolean }
  | { op: "audit"; cursor?: string; limit?: number }
  | { op: "propose"; key: string; value: unknown; locked?: boolean }
  | { op: "setSecret"; name: string; store: "vault"; value: string };

/** A request on the wire. @stability Beta */
export type SettingsWireRequest = SettingsRequest & { v: number };

/** The ops, for a host's router. @stability Beta */
export const SETTINGS_OPS = ["state", "setValue", "clearValue", "plan", "apply", "upgrades", "audit", "propose", "setSecret"] as const;
/** @stability Beta */
export type SettingsOp = (typeof SETTINGS_OPS)[number];

/** What each op answers. @stability Beta */
export interface SettingsResponses {
  state: SettingsState;
  setValue: { ok: true };
  clearValue: { ok: true };
  plan: { plan: SettingsPlan };
  apply: { result: SettingsApplyResult };
  upgrades: SettingsUpgrades;
  audit: SettingsAuditPage;
  propose: SettingsProposal;
  setSecret: { ok: true };
}

/**
 * Why a request failed.
 *
 * - `bad_request`: the body or a value is wrong (`details` may name the key).
 * - `unauthenticated` / `forbidden`: no token, or not a platform admin.
 * - `unsupported`: the host can't do it (a capability it doesn't have), or doesn't know the op: a
 *   host answers an op it doesn't know (one a newer screen sends) with `unsupported`, never `bad_request`.
 * - `locked`: a lower layer locked the key.
 * - `stale_plan`: `apply`'s `expect` no longer matches a fresh plan; plan again.
 * - `not_found`: no such key or fix.
 * - `version`: a protocol version the host doesn't speak.
 * - `error`: anything else.
 *
 * @stability Beta
 */
export type SettingsErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "unsupported"
  | "locked"
  | "stale_plan"
  | "not_found"
  | "version"
  | "error";

/** The body of a failed response. @stability Beta */
export interface SettingsErrorResponse {
  error: { code: SettingsErrorCode; message: string; details?: { [key: string]: unknown } };
}

/** A failed request, as the client throws it. @stability Beta */
export class SettingsProtocolError extends Error {
  readonly code: SettingsErrorCode;
  readonly status: number;
  readonly details?: { [key: string]: unknown };
  constructor(code: SettingsErrorCode, message: string, status = 0, details?: { [key: string]: unknown }) {
    super(message);
    this.name = "SettingsProtocolError";
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

const ERROR_CODES: readonly SettingsErrorCode[] = ["bad_request", "unauthenticated", "forbidden", "unsupported", "locked", "stale_plan", "not_found", "version", "error"];

function codeForStatus(status: number): SettingsErrorCode {
  if (status === 400 || status === 422) return "bad_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "stale_plan";
  return "error";
}

/** The Settings screen's view of its host. A fake one is a plain object. @stability Beta */
export interface SettingsClient {
  state(params?: { auditLimit?: number }): Promise<SettingsState>;
  setValue(params: { key: string; value: unknown; locked?: boolean; layer: SettingsWriteLayer }): Promise<void>;
  clearValue(params: { key: string; layer: SettingsWriteLayer }): Promise<void>;
  plan(fixId: string): Promise<SettingsPlan>;
  apply(fixId: string, expect: string): Promise<SettingsApplyResult>;
  upgrades(params?: { refresh?: boolean }): Promise<SettingsUpgrades>;
  audit(params?: { cursor?: string; limit?: number }): Promise<SettingsAuditPage>;
  propose(params: { key: string; value: unknown; locked?: boolean }): Promise<SettingsProposal>;
  /**
   * Set or rotate a Vault secret. Write-only: the host stores it and never returns it, and the
   * screen forgets it once sent. Optional: a host without it can't set secrets from the screen.
   */
  setSecret?(params: { name: string; store: "vault"; value: string }): Promise<void>;
}

/** The client's own error messages, for a translation. @stability Beta */
export interface SettingsClientMessages {
  signIn: string;
  unreachable: (detail: string) => string;
  timedOut: (seconds: number) => string;
  notJson: (status: number) => string;
  badJson: (status: number) => string;
  notObject: string;
  status: (status: number) => string;
  badState: (what: string) => string;
}

/** @stability Beta */
export const SETTINGS_CLIENT_MESSAGES: SettingsClientMessages = {
  signIn: "Sign in to change settings.",
  unreachable: (detail) => `The settings host couldn't be reached (${detail}).`,
  timedOut: (seconds) => `The settings host didn't answer within ${seconds} seconds.`,
  notJson: (status) => `The settings host answered ${status} without JSON.`,
  badJson: (status) => `The settings host answered ${status} with JSON it couldn't read.`,
  notObject: "The settings host answered with something other than an object.",
  status: (status) => `The settings host answered ${status}.`,
  badState: (what) => `The settings host's state is missing ${what}.`,
};

/** @stability Beta */
export interface SettingsClientOptions {
  /** The endpoint the host serves, e.g. `/api/genesis/settings` or the wizard's `http://127.0.0.1:4400/api`. */
  baseUrl: string;
  /** The bearer token, or a function that returns it (the wizard's session token, the admin's access token). */
  token: string | (() => string | null | Promise<string | null>);
  /** Give up on a request after this long. Default 30 000 ms. */
  timeoutMs?: number;
  /** The client's error messages. */
  messages?: Partial<SettingsClientMessages>;
}

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; credentials: "omit" },
) => Promise<Pick<Response, "ok" | "status" | "headers" | "text">>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** What a state must hold for the screen to draw it; the first thing missing, or null. */
function stateProblem(v: Record<string, unknown>): string | null {
  for (const key of ["catalogue", "findings", "secrets"] as const) if (!Array.isArray(v[key])) return key;
  if (!isObject(v.capabilities)) return "capabilities";
  if (!isObject(v.app)) return "app";
  const resolved = v.resolved;
  if (!isObject(resolved) || !isObject(resolved.values) || !isObject(resolved.sources)) return "resolved";
  if (v.layers !== undefined && !isObject(v.layers)) return "layers";
  return null;
}

/**
 * A {@link SettingsClient} over `fetch`. JSON only: a response that isn't JSON is an error, so a
 * login page or a proxy's HTML never reaches the screen as data.
 *
 * ```ts
 * const client = createSettingsClient(fetch, { baseUrl: "/api/genesis/settings", token: () => session.access_token });
 * ```
 *
 * @stability Beta
 */
export function createSettingsClient(fetchFn: FetchLike, options: SettingsClientOptions): SettingsClient {
  const m: SettingsClientMessages = { ...SETTINGS_CLIENT_MESSAGES, ...options.messages };
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function call<O extends SettingsOp>(body: Extract<SettingsRequest, { op: O }>): Promise<SettingsResponses[O]> {
    const token = typeof options.token === "function" ? await options.token() : options.token;
    if (!token) throw new SettingsProtocolError("unauthenticated", m.signIn);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let response: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      response = await fetchFn(options.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ v: SETTINGS_PROTOCOL_VERSION, ...body }),
        signal: controller.signal,
        // The bearer token is the only credential: no cookies, so no cross-site request forgery.
        credentials: "omit",
      });
      text = await response.text();
    } catch (error) {
      if (timedOut) throw new SettingsProtocolError("error", m.timedOut(Math.round(timeoutMs / 1000)));
      throw new SettingsProtocolError("error", m.unreachable(error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type)) {
      throw new SettingsProtocolError(response.ok ? "error" : codeForStatus(response.status), m.notJson(response.status), response.status);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new SettingsProtocolError("error", m.badJson(response.status), response.status);
    }
    if (!response.ok) {
      const error = (payload as Partial<SettingsErrorResponse> | null)?.error;
      const code = error && ERROR_CODES.includes(error.code) ? error.code : codeForStatus(response.status);
      const message = typeof error?.message === "string" ? error.message : m.status(response.status);
      throw new SettingsProtocolError(code, message, response.status, error?.details);
    }
    if (!isObject(payload)) throw new SettingsProtocolError("error", m.notObject, response.status);
    return payload as SettingsResponses[O];
  }

  return {
    async state(params) {
      const state = await call({ op: "state", ...(params?.auditLimit !== undefined ? { audit: { limit: params.auditLimit } } : {}) });
      const missing = stateProblem(state as unknown as Record<string, unknown>);
      if (missing) throw new SettingsProtocolError("error", m.badState(missing));
      return { ...state, layers: state.layers ?? {} };
    },
    async setValue({ key, value, locked, layer }) {
      await call({ op: "setValue", key, value, layer, ...(locked !== undefined ? { locked } : {}) });
    },
    async clearValue({ key, layer }) {
      await call({ op: "clearValue", key, layer });
    },
    plan: async (fixId) => (await call({ op: "plan", fixId })).plan,
    apply: async (fixId, expect) => (await call({ op: "apply", fixId, expect })).result,
    upgrades: (params) => call({ op: "upgrades", ...(params?.refresh ? { refresh: true } : {}) }),
    audit: (params) => call({ op: "audit", ...(params?.cursor !== undefined ? { cursor: params.cursor } : {}), ...(params?.limit !== undefined ? { limit: params.limit } : {}) }),
    propose: ({ key, value, locked }) => call({ op: "propose", key, value, ...(locked !== undefined ? { locked } : {}) }),
    async setSecret({ name, value }) {
      await call({ op: "setSecret", name, store: "vault", value });
    },
  };
}

/** Why a key can't be written in a layer from this screen. @stability Beta */
export type SettingWriteRefusal =
  | "build"
  | "capability"
  | "locked";

/** Where a key can be written from this screen, or why it can't. @stability Beta */
export interface SettingWritability {
  /** The layers the screen may write, low to high. Empty when it can write none. */
  layers: SettingsWriteLayer[];
  /** Why a layer is missing: the host can't write it, the key applies at build, or a lower layer locked it. */
  refused: Partial<Record<SettingsWriteLayer, SettingWriteRefusal>>;
}

const LAYER_INDEX = new Map<SettingsLayer, number>(SETTINGS_LAYERS.map((layer, i) => [layer, i]));

/**
 * The write rules, in one place, for the screen and a host's handler alike:
 *
 * - a key that applies at build time is written only in the file layer;
 * - the file layer needs `writeFiles`, the database layer `writeDatabase`;
 * - a key locked by a layer below the target can't be changed there (the lock's own layer can).
 *
 * The app host (`writeDatabase` only) therefore writes runtime keys in the database layer and
 * shows build keys read-only, with "change in repo".
 *
 * @stability Beta
 */
export function settingWritability(def: Pick<SettingDef, "applies">, source: { lockedBy?: SettingsLayer } | undefined, capabilities: SettingsCapabilities): SettingWritability {
  const layers: SettingsWriteLayer[] = [];
  const refused: SettingWritability["refused"] = {};
  for (const layer of ["file", "database"] as const) {
    if (layer === "database" && def.applies === "build") {
      refused[layer] = "build";
      continue;
    }
    if (!(layer === "file" ? capabilities.writeFiles : capabilities.writeDatabase)) {
      refused[layer] = "capability";
      continue;
    }
    const lockedBy = source?.lockedBy;
    if (lockedBy && (LAYER_INDEX.get(lockedBy) ?? 0) < (LAYER_INDEX.get(layer) ?? 0)) {
      refused[layer] = "locked";
      continue;
    }
    layers.push(layer);
  }
  return { layers, refused };
}

/**
 * The genesis.config.json fragment for one key: its value, or `{ value, locked: true }`. What
 * "change in repo" shows, and what `propose` commits.
 *
 * @stability Beta
 */
export function settingFileSnippet(key: string, value: unknown, locked?: boolean): string {
  const entry = locked ? { value, locked: true } : value;
  return JSON.stringify({ settings: { [key]: entry } }, null, 2);
}

/**
 * The layer the screen writes by default: the database when the value already comes from there
 * (and the screen can write it), else the file layer when it can (reviewed like code), else the
 * database. Otherwise, writing the database from the CLI host is an explicit choice.
 *
 * @stability Beta
 */
export function preferredWriteLayer(writable: Pick<SettingWritability, "layers">, source?: { layer: SettingsLayer }): SettingsWriteLayer | undefined {
  if (source?.layer === "database" && writable.layers.includes("database")) return "database";
  return writable.layers.includes("file") ? "file" : writable.layers[0];
}

/** Every secret name the app knows: the state's secrets and each catalogue key's `needs`. @stability Beta */
export function secretNames(catalogue: readonly Pick<SettingDef, "secret">[], secrets: readonly Pick<SettingsSecretStatus, "name">[]): Set<string> {
  const names = new Set<string>();
  for (const s of secrets) names.add(s.name);
  for (const def of catalogue) if (def.secret) names.add(def.secret.name);
  return names;
}

/**
 * Whether an audit entry's `before` and `after` may be drawn: only for a `set` or `clear` of a
 * catalogue key that needs no secret and isn't itself a secret's name. Everything else (a fix, an
 * upgrade, a secret, a subject the catalogue doesn't know) shows its subject and summary only, so
 * a value a host forgot to redact never reaches the screen through the history.
 *
 * @stability Beta
 */
export function auditValuesVisible(
  entry: Pick<SettingsAuditEntry, "action" | "subject">,
  catalogue: readonly Pick<SettingDef, "key" | "secret">[],
  names: ReadonlySet<string>,
): boolean {
  if (entry.action !== "set" && entry.action !== "clear") return false;
  if (names.has(entry.subject)) return false;
  const def = catalogue.find((d) => d.key === entry.subject);
  return def !== undefined && def.secret === undefined;
}

/**
 * A link the screen may follow: `http:`, `https:` or a path on the same site (`/…`, `./…`, `../…`,
 * `#…`, `?…`), never `javascript:`, `data:` or a protocol-relative `//host`. Undefined otherwise.
 *
 * @stability Beta
 */
export function safeHref(href: string | undefined): string | undefined {
  if (typeof href !== "string") return undefined;
  const h = href.trim();
  // A browser drops tabs and newlines in a URL, so `/\t/evil.test` would become `//evil.test`.
  if (!h || /[\u0000-\u001F\u007F]/.test(h)) return undefined;
  if (/^(?:\/(?![/\\])|\.\.?\/|#|\?)/.test(h)) return h;
  try {
    const url = new URL(h);
    return url.protocol === "http:" || url.protocol === "https:" ? h : undefined;
  } catch {
    return undefined;
  }
}
