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
 * - `setSecrets`: put a secret in its store (the CLI host, through the developer's own CLIs).
 * - `runCli`: run `supabase`, `gh`, `eas` and the package manager (the CLI host).
 * - `agent`: "Fix with Claude" (the CLI host, when the Agent SDK is installed).
 * - `proposeChanges`: open a pull request for a file-layer change (`propose`). Optional; off when absent.
 *
 * @stability Beta
 */
export interface SettingsCapabilities {
  writeFiles: boolean;
  writeDatabase: boolean;
  setSecrets: boolean;
  runCli: boolean;
  agent: boolean;
  proposeChanges?: boolean;
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

/** The app host's capabilities: the database layer and nothing else. @stability Beta */
export const APP_HOST_CAPABILITIES: Readonly<SettingsCapabilities> = Object.freeze({
  ...NO_SETTINGS_CAPABILITIES,
  writeDatabase: true,
});

/**
 * Both sets at once: a write is allowed only when both allow it. The screen narrows the host's
 * capabilities with its own `capabilities` prop this way; a prop can never widen what the host
 * reports.
 *
 * @stability Beta
 */
export function intersectCapabilities(a: SettingsCapabilities, b?: Partial<SettingsCapabilities>): SettingsCapabilities {
  if (!b) return { ...a };
  return {
    writeFiles: a.writeFiles && b.writeFiles === true,
    writeDatabase: a.writeDatabase && b.writeDatabase === true,
    setSecrets: a.setSecrets && b.setSecrets === true,
    runCli: a.runCli && b.runCli === true,
    agent: a.agent && b.agent === true,
    proposeChanges: a.proposeChanges === true && b.proposeChanges === true,
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
  | { op: "propose"; key: string; value: unknown; locked?: boolean };

/** A request on the wire. @stability Beta */
export type SettingsWireRequest = SettingsRequest & { v: number };

/** The ops, for a host's router. @stability Beta */
export const SETTINGS_OPS = ["state", "setValue", "clearValue", "plan", "apply", "upgrades", "audit", "propose"] as const;
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
}

/**
 * Why a request failed.
 *
 * - `bad_request`: the body or a value is wrong (`details` may name the key).
 * - `unauthenticated` / `forbidden`: no token, or not a platform admin.
 * - `unsupported`: the host can't do it (a capability it doesn't have).
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
}

/** @stability Beta */
export interface SettingsClientOptions {
  /** The endpoint the host serves, e.g. `/api/genesis/settings` or the wizard's `http://127.0.0.1:4400/api`. */
  baseUrl: string;
  /** The bearer token, or a function that returns it (the wizard's session token, the admin's access token). */
  token: string | (() => string | null | Promise<string | null>);
}

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Pick<Response, "ok" | "status" | "headers" | "text">>;

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
  async function call<O extends SettingsOp>(body: Extract<SettingsRequest, { op: O }>): Promise<SettingsResponses[O]> {
    const token = typeof options.token === "function" ? await options.token() : options.token;
    if (!token) throw new SettingsProtocolError("unauthenticated", "Sign in to change settings.");
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchFn(options.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ v: SETTINGS_PROTOCOL_VERSION, ...body }),
      });
    } catch (error) {
      throw new SettingsProtocolError("error", `The settings host couldn't be reached (${error instanceof Error ? error.message : String(error)}).`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type)) {
      throw new SettingsProtocolError(response.ok ? "error" : codeForStatus(response.status), `The settings host answered ${response.status} without JSON.`, response.status);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new SettingsProtocolError("error", `The settings host answered ${response.status} with JSON it couldn't read.`, response.status);
    }
    if (!response.ok) {
      const error = (payload as Partial<SettingsErrorResponse> | null)?.error;
      const code = error && ERROR_CODES.includes(error.code) ? error.code : codeForStatus(response.status);
      const message = typeof error?.message === "string" ? error.message : `The settings host answered ${response.status}.`;
      throw new SettingsProtocolError(code, message, response.status, error?.details);
    }
    if (typeof payload !== "object" || payload === null) {
      throw new SettingsProtocolError("error", "The settings host answered with something other than an object.", response.status);
    }
    return payload as SettingsResponses[O];
  }

  return {
    state: (params) => call({ op: "state", ...(params?.auditLimit !== undefined ? { audit: { limit: params.auditLimit } } : {}) }),
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
