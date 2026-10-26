/**
 * The feature gate: one answer to "is this feature on here?" for UI, server
 * code, agents and (for status and entitlement) the database.
 *
 * Checks run in a fixed order and the first "no" wins:
 *
 *   1. status       the feature has shipped (beta, live or deprecated)
 *   2. platform     it has shipped on this platform
 *   3. entitlement  a paid feature (`access: { plan }`) has an active entitlement
 *   4. tenant       the tenant has not switched it off
 *   5. flag         none of its boolean release or permission flags is false
 *
 * The registry comes from code (features.ts and flags.json). Everything that
 * changes at runtime (entitlements, switches, flag values) comes in through
 * {@link GateContext}, read once per request or session on the server. Role
 * and row rights are not the gate's business: "may this person" stays with
 * roles and row security.
 *
 * No zod here: this file ships to browsers, phones and edge functions.
 */
import type {
  FeatureAccess,
  FeatureStatus,
  FlagKind,
  FlagValue,
} from "./model";
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
 * isn't in the registry.
 *
 * @stability Beta
 */
export type GateReason =
  "unknown" | "status" | "platform" | "entitlement" | "tenant" | "flag";

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
  /** The flag that turned it off, when the reason is `flag`. */
  flag?: string;
}

/** The fields of a feature the gate reads. A `FeatureDef` fits. @stability Beta */
export interface GateFeature {
  status: FeatureStatus;
  apps: readonly string[];
  platforms?: Partial<Record<FeaturePlatform, FeatureStatus>>;
  access?: FeatureAccess;
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

/** A set of ids, given as a list, a Set or a test. */
export type IdSet = Iterable<string> | ((id: string) => boolean);

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

function has(set: IdSet | undefined, id: string): boolean {
  if (!set) return false;
  if (typeof set === "function") return set(id);
  if (set instanceof Set) return set.has(id);
  for (const item of set) if (item === id) return true;
  return false;
}

function flagValue(
  flags: GateContext["flags"],
  name: string,
): FlagValue | undefined {
  if (!flags) return undefined;
  return typeof flags === "function" ? flags(name) : flags[name];
}

/**
 * Is feature `id` on for this context? Returns the first check that said no
 * as `reason`, and for a paid feature the plan that unlocks it.
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
  const def = Object.hasOwn(registry.features, id)
    ? registry.features[id]
    : undefined;
  if (!def) return { on: false, reason: "unknown" };
  if (!SHIPPED_STATUSES.includes(def.status))
    return { on: false, reason: "status" };
  const here = statusOn(def, context.platform);
  if (!here || !SHIPPED_STATUSES.includes(here))
    return { on: false, reason: "platform" };
  const access = def.access ?? "all";
  if (access !== "all" && !has(context.entitlements, id))
    return { on: false, reason: "entitlement", unlock: { plan: access.plan } };
  if (has(context.off, id)) return { on: false, reason: "tenant" };
  for (const [name, flag] of Object.entries(registry.flags ?? {})) {
    if (
      flag.feature !== id ||
      !GATING_KINDS.includes(flag.kind) ||
      typeof flag.default !== "boolean"
    )
      continue;
    const value = flagValue(context.flags, name) ?? flag.default;
    if (value === false) return { on: false, reason: "flag", flag: name };
  }
  return { on: true };
}

/**
 * Every feature's answer for one context, by id: what a server hands a client
 * once per session, so the client never decides on its own. Pass `ids` to
 * answer for some features only.
 *
 * @stability Beta
 */
export type GateSnapshot = { readonly [id: string]: GateAnswer };

/** @stability Beta */
export function gateSnapshot(
  registry: GateRegistry,
  context: GateContext,
  ids?: Iterable<string>,
): GateSnapshot {
  const snapshot: Record<string, GateAnswer> = {};
  for (const id of ids ?? Object.keys(registry.features))
    snapshot[id] = featureOn(registry, context, id);
  return snapshot;
}

/** An id missing from a snapshot is off, as an unknown feature. @stability Beta */
export function fromSnapshot(snapshot: GateSnapshot, id: string): GateAnswer {
  return (
    (Object.hasOwn(snapshot, id) ? snapshot[id] : undefined) ?? {
      on: false,
      reason: "unknown",
    }
  );
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
  constructor(feature: string, answer: GateAnswer) {
    super(
      answer.reason === "entitlement" && answer.unlock
        ? `${feature} needs the ${answer.unlock.plan} plan`
        : `${feature} is off (${answer.reason ?? "unknown"})`,
    );
    this.name = "FeatureOff";
    this.feature = feature;
    this.reason = answer.reason ?? "unknown";
    if (answer.unlock) this.unlock = answer.unlock;
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
  const answer = featureOn(registry, context, id);
  if (!answer.on) throw new FeatureOff(id, answer);
}
