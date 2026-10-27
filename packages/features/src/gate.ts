/**
 * The feature gate: one answer to "is this feature on here?" for UI, server
 * code, agents and (for status and entitlement) the database.
 *
 * Checks run in a fixed order and the first "no" wins:
 *
 *   1. status       the feature has shipped (beta, live or deprecated)
 *   2. platform     it has shipped on this platform
 *   3. tenant       the tenant has not switched it off
 *   4. flag         each of its boolean release or permission flags is true
 *   5. entitlement  a paid feature (`access: { plan }`) has an active entitlement
 *
 * A feature that `requires` other features in the registry (a module's parts
 * require the module) is also off while any of them is off: after its own
 * status and platform, each required feature is asked the same way, and the
 * first "no" comes back with `via` naming it. So switching a module off, or not
 * paying for it, turns off every part with it, and the upsell names the module's
 * plan.
 *
 * Entitlement is last on purpose: an "upgrade to unlock" answer is only given
 * when paying is the one thing missing, so an upsell never promises a feature
 * that a switch or a flag would still keep off.
 *
 * The registry comes from code (features.ts and flags.json). Everything that
 * changes at runtime (entitlements, switches, flag values) comes in through
 * {@link GateContext}, read once per request or session on the server. Role
 * and row rights are not the gate's business: "may this person" stays with
 * roles and row security.
 *
 * No zod, React, Node built-ins or DOM globals here: this file ships to
 * browsers, extension service workers, phones and edge functions.
 */
import type {
  FeatureAccess,
  FeatureStatus,
  FlagKind,
  FlagValue,
} from "./types";
import { statusOn } from "./status";
import type { FeaturePlatform } from "./platforms";

/** The statuses in which a feature is on. A deprecated feature still works until it is retired. @stability Beta */
export const SHIPPED_STATUSES: readonly FeatureStatus[] = [
  "beta",
  "live",
  "deprecated",
];

/**
 * Why a feature is off: the first check that said no. `unknown` is an id that
 * isn't in the registry (or not in a snapshot).
 *
 * @stability Beta
 */
export type GateReason =
  "unknown" | "status" | "platform" | "tenant" | "flag" | "entitlement";

/**
 * The gate's answer for one feature. `unlock` is set when the reason is
 * `entitlement`: the plan that turns it on, so the UI can show an upgrade
 * instead of hiding the feature.
 *
 * @stability Beta
 */
export interface GateAnswer {
  on: boolean;
  reason?: GateReason;
  unlock?: { plan: string };
  /** The flag that turned it off, when the reason is `flag`. Server side only: snapshots leave it out. */
  flag?: string;
  /** The required feature that turned it off (a module its part needs), when the "no" came from one. */
  via?: string;
}

/** The fields of a feature the gate reads. A `FeatureDef` fits. @stability Beta */
export interface GateFeature {
  status: FeatureStatus;
  apps: readonly string[];
  platforms?: Partial<Record<FeaturePlatform, FeatureStatus>>;
  access?: FeatureAccess;
  /** Ids this feature needs; those in the registry must be on too. */
  requires?: readonly string[];
}

/** The fields of a flag the gate reads. A `FlagDef` fits. @stability Beta */
export interface GateFlag {
  feature: string;
  kind: FlagKind;
  default: FlagValue;
}

/** What the gate decides from: the registry, as code defines it. @stability Beta */
export interface GateRegistry {
  features: { readonly [id: string]: GateFeature };
  flags?: { readonly [name: string]: GateFlag };
}

/**
 * A set of ids: a list, a Set or a test. Not any iterable: an iterator would
 * be used up by the first feature asked, and a bare string would count as its
 * characters.
 *
 * @stability Beta
 */
export type IdSet =
  readonly string[] | ReadonlySet<string> | ((id: string) => boolean);

/**
 * Where and for whom the gate is asked: the platform, plus the tenant's
 * runtime state. Leave out what the app doesn't have: no `entitlements` means
 * no paid feature is on, no `off` means no switch is off, no `flags` means
 * every flag has its default.
 *
 * @stability Beta
 */
export interface GateContext {
  platform: FeaturePlatform;
  /** Feature ids the tenant holds an active entitlement for. */
  entitlements?: IdSet;
  /** Feature ids the tenant switched off. */
  off?: IdSet;
  /** Flag values for this tenant, by flag name. A missing flag has its default. */
  flags?:
    | { readonly [name: string]: FlagValue | undefined }
    | ((name: string) => FlagValue | undefined);
}

/** Flag kinds that can turn a feature off. Experiments and ops flags pick a variant; they don't gate. */
const GATING_KINDS: readonly FlagKind[] = ["release", "permission"];

type Test = (id: string) => boolean;

function toTest(set: IdSet | undefined, name: string): Test {
  if (set === undefined) return () => false;
  if (typeof set === "function") return set;
  if (typeof set === "string")
    throw new TypeError(
      `GateContext.${name} must be a list, a Set or a function, not a string`,
    );
  if (Array.isArray(set)) {
    const ids = new Set<string>(set);
    return (id) => ids.has(id);
  }
  if (set instanceof Set) return (id) => set.has(id);
  throw new TypeError(
    `GateContext.${name} must be a list, a Set or a function`,
  );
}

function flagValue(
  flags: GateContext["flags"],
  name: string,
): FlagValue | undefined {
  if (!flags) return undefined;
  if (typeof flags === "function") return flags(name);
  return Object.hasOwn(flags, name) ? flags[name] : undefined;
}

interface Prepared {
  registry: GateRegistry;
  context: GateContext;
  entitled: Test;
  off: Test;
}

function prepare(registry: GateRegistry, context: GateContext): Prepared {
  return {
    registry,
    context,
    entitled: toTest(context.entitlements, "entitlements"),
    off: toTest(context.off, "off"),
  };
}

function answer(prepared: Prepared, id: string, seen: ReadonlySet<string> = new Set()): GateAnswer {
  const { registry, context, entitled, off } = prepared;
  const def = Object.hasOwn(registry.features, id)
    ? registry.features[id]
    : undefined;
  if (!def) return { on: false, reason: "unknown" };
  if (!SHIPPED_STATUSES.includes(def.status))
    return { on: false, reason: "status" };
  const here = statusOn(def, context.platform);
  if (!here || !SHIPPED_STATUSES.includes(here))
    return { on: false, reason: "platform" };
  // What it requires must be on too: a module's parts go off with the module.
  // Ids outside the registry (blocks, infrastructure) don't gate; a cycle is cut.
  for (const need of def.requires ?? []) {
    if (need === id || seen.has(need) || !Object.hasOwn(registry.features, need)) continue;
    const parent = answer(prepared, need, new Set([...seen, id]));
    if (!parent.on) return { ...parent, via: parent.via ?? need };
  }
  if (off(id)) return { on: false, reason: "tenant" };
  for (const [name, flag] of Object.entries(registry.flags ?? {})) {
    if (
      flag.feature !== id ||
      !GATING_KINDS.includes(flag.kind) ||
      typeof flag.default !== "boolean"
    )
      continue;
    // On only when exactly true: a malformed value ("false", 0, null) keeps the feature off.
    if ((flagValue(context.flags, name) ?? flag.default) !== true)
      return { on: false, reason: "flag", flag: name };
  }
  const access = def.access ?? "all";
  if (access !== "all" && !entitled(id))
    return { on: false, reason: "entitlement", unlock: { plan: access.plan } };
  return { on: true };
}

/**
 * Is feature `id` on for this context? Returns the first check that said no
 * as `reason`, and for a paid feature the plan that unlocks it. An unknown id
 * is off with reason `unknown`; it never throws for one.
 *
 * ```ts
 * const answer = featureOn({ features, flags }, { platform: "web", entitlements, off }, "form-webhook-delivery");
 * // { on: false, reason: "entitlement", unlock: { plan: "pro" } }
 * ```
 *
 * @stability Beta
 */
export function featureOn(
  registry: GateRegistry,
  context: GateContext,
  id: string,
): GateAnswer {
  return answer(prepare(registry, context), id);
}

/**
 * Every shipped feature's answer for one context: what a server hands a
 * client, so the client never decides on its own. Plain JSON, safe to store
 * (an extension's session storage, a cache) and to compare by `version`.
 *
 * It lists only features that have shipped somewhere (beta, live or
 * deprecated) and leaves out flag names; anything missing reads as off.
 *
 * @stability Beta
 */
export interface GateSnapshot {
  /** The answers, by feature id. */
  readonly answers: { readonly [id: string]: GateAnswer };
  /** When the server made it (ISO 8601). Refresh after your own time limit. */
  readonly at: string;
  /** The registry version it was made from, when known (the build's version). */
  readonly version?: string | number;
}

/** @stability Beta */
export interface GateSnapshotOptions {
  /** Answer for these features only. */
  ids?: Iterable<string>;
  /** The registry version, carried into the snapshot. */
  version?: string | number;
  /** The time to stamp (default now). */
  at?: Date;
}

/** @stability Beta */
export function gateSnapshot(
  registry: GateRegistry,
  context: GateContext,
  options: GateSnapshotOptions = {},
): GateSnapshot {
  const prepared = prepare(registry, context);
  const ids =
    options.ids === undefined
      ? Object.keys(registry.features).filter((id) =>
          SHIPPED_STATUSES.includes(registry.features[id]!.status),
        )
      : Array.from(options.ids);
  const answers: Record<string, GateAnswer> = {};
  for (const id of ids) {
    const { flag: _flag, ...rest } = answer(prepared, id);
    answers[id] = rest;
  }
  return {
    answers,
    at: (options.at ?? new Date()).toISOString(),
    ...(options.version === undefined ? {} : { version: options.version }),
  };
}

/**
 * Whether a snapshot is older than `maxAgeMs`: refresh it then. A client
 * (an extension worker, a tab left open) keeps a snapshot, replaces it when it
 * is stale, after sign-in or a tenant switch, and right after a refusal.
 *
 * @stability Beta
 */
export function isSnapshotStale(snapshot: GateSnapshot, maxAgeMs: number, now: Date = new Date()): boolean {
  const at = Date.parse(snapshot?.at);
  // Too old, unreadable, or dated in the future (a wrong clock or a forged copy): refresh.
  return Number.isNaN(at) || Math.abs(now.getTime() - at) > maxAgeMs;
}

/** One feature's answer from a snapshot. An id missing from it is off, as an unknown feature. @stability Beta */
export function fromSnapshot(snapshot: GateSnapshot, id: string): GateAnswer {
  // A stored snapshot may be from an older shape, or damaged: missing answers mean off.
  const answers: GateSnapshot["answers"] | undefined = snapshot?.answers;
  return (answers && Object.hasOwn(answers, id) ? answers[id] : undefined) ?? { on: false, reason: "unknown" };
}

/**
 * Thrown by {@link requireFeature} when a feature is off. Servers map it to a
 * refusal that carries the reason (HTTP 403, or 402 for `entitlement`).
 *
 * @stability Beta
 */
export class FeatureOff extends Error {
  readonly feature: string;
  readonly reason: GateReason;
  readonly unlock?: { plan: string };
  /** The required feature that turned it off, when one did. */
  readonly via?: string;
  constructor(feature: string, answer: GateAnswer) {
    const through = answer.via ? ` (through ${answer.via})` : "";
    super(
      answer.reason === "entitlement" && answer.unlock
        ? `${feature} needs the ${answer.unlock.plan} plan${through}`
        : `${feature} is off (${answer.reason ?? "unknown"}${answer.via ? ` via ${answer.via}` : ""})`,
    );
    this.name = "FeatureOff";
    this.feature = feature;
    this.reason = answer.reason ?? "unknown";
    if (answer.unlock) this.unlock = answer.unlock;
    if (answer.via) this.via = answer.via;
  }

  /** The HTTP status for this refusal: 402 when a plan unlocks it, else 403. */
  get status(): 402 | 403 {
    return this.reason === "entitlement" ? 402 : 403;
  }
}

/**
 * Refuse unless the feature is on: call it at the top of every server
 * function and route that belongs to a feature.
 *
 * ```ts
 * requireFeature({ features, flags }, await gateContext(tenant), "form-webhook-delivery");
 * ```
 *
 * @stability Beta
 */
export function requireFeature(
  registry: GateRegistry,
  context: GateContext,
  id: string,
): void {
  const result = featureOn(registry, context, id);
  if (!result.on) throw new FeatureOff(id, result);
}
