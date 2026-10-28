/**
 * Blocks: a feature an app adds whole (account, push, observability, support,
 * updates), declared once with what it needs and what it contributes. The app
 * shell, the navigation tree and Settings consume contributions by FeatureId;
 * the app still owns where they go.
 *
 * Platform-neutral and free of zod, so it ships to phones:
 * `@marktiderman/genesis-features/blocks` (also re-exported from the root).
 */
import { cycleProblems, dependencyOrder, requirementProblem } from "./graph";
import { FEATURE_PLATFORMS, type FeaturePlatform } from "./platforms";
import type { ContentPackSectionValidator } from "./content-packs";

/**
 * A navigation entry a block offers. The app's nav tree places it (by the
 * block's FeatureId and this id); a block never decides where it goes.
 * `id`, `label` and `path` match genesis-core's `NavigationNode`.
 *
 * @stability Beta
 */
export interface BlockNavItem {
  /** Unique across every enabled block. */
  id: string;
  label: string;
  path: string;
  /** An icon name the app's icon set knows. */
  icon?: string;
  /** Lower first. Default 0. */
  order?: number;
}

/**
 * A Settings row a block offers, placed in the section with id `section`
 * (`"account"`, `"about"`, or one of the app's own; an unknown id becomes a
 * new section at the end).
 *
 * @stability Beta
 */
export interface BlockSettingsRow {
  /** Unique across every enabled block. */
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  /**
   * A hook giving a subtitle that changes (a version, a count). It is called
   * on every render of the Settings screen, in block order, so the set of
   * blocks must not change while the app runs (shells read them once).
   */
  useSubtitle?: () => string | null | undefined;
  /** Where tapping the row goes, as a path. */
  href?: string;
  /** Lower first within its section. Default 0. */
  order?: number;
  testID?: string;
}

/**
 * A screen a block's feature needs the app to route to. On file-based
 * routers the app owns the route file; this is the declaration a check (or
 * a deep-link allowlist) reads.
 *
 * @stability Beta
 */
export interface BlockRoute {
  path: string;
  /** What the screen is for, in a few words. */
  description?: string;
  /** `true` when only a signed-in person can open it. */
  signedIn?: boolean;
}

/**
 * A SQL migration a block needs, shipped in a package: copy it into the
 * app's `supabase/migrations/` under a timestamped name.
 *
 * @stability Beta
 */
export interface BlockMigration {
  /** The npm package that ships it, e.g. `@marktiderman/genesis-supabase`. */
  package: string;
  /** Its path in the package, e.g. `migrations/0002_genesis_app_release_policy.sql`. */
  file: string;
  /** Its pgTAP test in the package, if any. */
  test?: string;
}

/**
 * One kind of data a block collects, for the App Store privacy label and the
 * Play data safety form.
 *
 * @stability Beta
 */
export interface BlockDataUse {
  /** What, in the stores' words: `"email address"`, `"user id"`, `"crash data"`. */
  type: string;
  /** Why: `"app functionality"`, `"analytics"`, … */
  purposes: readonly string[];
  /** Tied to the person's identity. */
  linked: boolean;
  /** Used to track the person across other companies' apps. */
  tracking: boolean;
}

/** What a block means for privacy. @stability Beta */
export interface BlockPrivacy {
  collects?: readonly BlockDataUse[];
  /** Anything a reviewer or a privacy policy should say, one sentence each. */
  notes?: readonly string[];
}

/**
 * What a block adds to an app. Every key is optional. `S` is what a slot is
 * filled with on the consuming platform (a React component on native and web).
 *
 * @stability Beta
 */
export interface BlockContributions<S = unknown> {
  nav?: readonly BlockNavItem[];
  settings?: readonly BlockSettingsRow[];
  routes?: readonly BlockRoute[];
  /**
   * Fills for the host shell's slots, by slot name (e.g. `fatal` on
   * `GenesisNativeApp`). The app's own `slots` always win over a block's.
   */
  slots?: Readonly<Record<string, S>>;
  migrations?: readonly BlockMigration[];
  /** Agent skills that come with it: repo or package paths to a `SKILL.md`. */
  skills?: readonly string[];
  privacy?: BlockPrivacy;
  /**
   * Checks this block's section of a content pack (`sections[<block id>]`):
   * returns every problem with its items. `defineContentPack` and
   * `contentPackProblems` run it when given the block.
   */
  contentSection?: ContentPackSectionValidator;
}

/**
 * One block. `id` is the block's FeatureId: the same id as its entry in the
 * feature registry.
 *
 * @stability Beta
 */
export interface BlockDef<Id extends string = string, S = unknown> {
  readonly id: Id;
  /**
   * What must be on with it: other blocks' ids, or features the app owns that
   * aren't blocks. A requirement that is a block must be enabled (and on this
   * platform); one that isn't a block must be listed in `enabled`. A
   * requirement that is neither is an error, so a forgotten block is loud.
   */
  readonly requires?: readonly string[];
  readonly contributes?: BlockContributions<S>;
  /** Where it runs. Default every platform. */
  readonly platforms?: readonly FeaturePlatform[];
}

/** Thrown by {@link defineBlock} and {@link resolveBlocks}; lists every problem at once. @stability Beta */
export class BlockError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid blocks:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "BlockError";
  }
}

// The feature registry's id rule (model.ts), repeated so this file stays free of zod.
const ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

const CONTRIBUTION_KEYS = ["nav", "settings", "routes", "slots", "migrations", "skills", "privacy", "contentSection"] as const;

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

function blockProblems(block: BlockDef<string, unknown>): string[] {
  const { id } = block;
  const problems: string[] = [];
  if (typeof id !== "string" || !ID.test(id)) problems.push(`${String(id)}: a block id is a feature id: lowercase letters and digits, joined by -, _ or .`);
  for (const req of block.requires ?? []) {
    if (req === id) problems.push(`${id}.requires: a block can't require itself`);
    else if (!ID.test(req)) problems.push(`${id}.requires: "${req}" is not a feature id`);
  }
  for (const p of block.platforms ?? []) {
    if (!(FEATURE_PLATFORMS as readonly string[]).includes(p)) problems.push(`${id}.platforms: "${p}" is not one of ${FEATURE_PLATFORMS.join(", ")}`);
  }
  if (block.platforms && block.platforms.length === 0) problems.push(`${id}.platforms: an empty list runs nowhere; leave it out for every platform`);
  const c = block.contributes ?? {};
  for (const key of Object.keys(c)) {
    if (!(CONTRIBUTION_KEYS as readonly string[]).includes(key)) problems.push(`${id}.contributes.${key}: not a contribution (${CONTRIBUTION_KEYS.join(", ")})`);
  }
  for (const d of duplicates((c.nav ?? []).map((n) => n.id))) problems.push(`${id}.contributes.nav: "${d}" appears twice`);
  for (const d of duplicates((c.settings ?? []).map((r) => r.id))) problems.push(`${id}.contributes.settings: "${d}" appears twice`);
  for (const d of duplicates((c.routes ?? []).map((r) => r.path))) problems.push(`${id}.contributes.routes: "${d}" appears twice`);
  for (const n of c.nav ?? []) if (!n.id || !n.label || !n.path) problems.push(`${id}.contributes.nav: every entry needs an id, a label and a path`);
  for (const r of c.settings ?? []) if (!r.id || !r.section || !r.title) problems.push(`${id}.contributes.settings: every row needs an id, a section and a title`);
  for (const m of c.migrations ?? []) if (!m.package || !m.file) problems.push(`${id}.contributes.migrations: every migration needs a package and a file`);
  return problems;
}

/**
 * Declare a block. Validates it (id, requirements, platforms, contribution
 * keys and duplicate ids within the block) and returns it frozen, so a
 * typo fails where the block is written rather than where it is used:
 *
 * ```ts
 * export const supportBlock = defineBlock({
 *   id: "support",
 *   requires: ["account"],
 *   platforms: ["web", "native"],
 *   contributes: {
 *     settings: [{ id: "contact-support", section: "about", title: "Contact support", href: "/support" }],
 *     routes: [{ path: "/support", signedIn: true }],
 *     migrations: [{ package: "@acme/support", file: "migrations/0001_support.sql" }],
 *   },
 * });
 * ```
 *
 * To check `id` against the app's registry at compile time, give the
 * FeatureId: `defineBlock<FeatureId>({ … })`. `S` is what slots are filled
 * with, inferred from `contributes.slots` (a component on native and web).
 *
 * @stability Beta
 */
export function defineBlock<const Id extends string, S = never>(block: BlockDef<Id, S>): BlockDef<Id, S> {
  const problems = blockProblems(block as BlockDef<string, unknown>);
  if (problems.length) throw new BlockError(problems);
  return Object.freeze(block);
}

/** Which blocks are on: ids, a predicate, or (left out) every block given. @stability Beta */
export type EnabledBlocks = Iterable<string> | ((id: string) => boolean);

/** @stability Beta */
export interface ResolveBlocksOptions {
  /** Keep only blocks that run here. A required block that doesn't is a missing requirement. */
  platform?: FeaturePlatform;
  /**
   * The app's feature registry (`features` from `defineFeatures`): every block
   * id and requirement must be one of its ids.
   */
  features?: Readonly<Record<string, unknown>>;
  /**
   * A block whose requirement is off: `throw` (default: a set-up mistake, found
   * at launch) or `drop` it, and every block needing it, listing each in
   * `dropped` (for switches that change at run time, such as a tenant turning
   * a feature off).
   */
  missing?: "throw" | "drop";
  /**
   * The host's slot names (e.g. `GenesisNativeApp`'s). A block filling any
   * other slot is an error, so a typo doesn't fill nothing silently.
   */
  slots?: readonly string[];
}

/** A contribution with the FeatureId of the block it came from. @stability Beta */
export type Contributed<T, Id extends string = string> = T & { readonly feature: Id };

/** @stability Beta */
export interface ResolvedBlocks<B extends BlockDef<string, unknown> = BlockDef> {
  /** The enabled blocks, in dependency order (a block after what it requires). */
  readonly blocks: readonly B[];
  readonly ids: ReadonlySet<B["id"]>;
  has(id: string): boolean;
  /** One block's contributions, or `undefined` when it isn't on. */
  contributionsOf(id: B["id"]): NonNullable<B["contributes"]> | undefined;
  /** Nav entries by `order`, then block order. Place them in the app's tree by `feature` and `id`. */
  readonly nav: readonly Contributed<BlockNavItem, B["id"]>[];
  /** Settings rows by `order`, then block order. */
  readonly settings: readonly Contributed<BlockSettingsRow, B["id"]>[];
  readonly routes: readonly Contributed<BlockRoute, B["id"]>[];
  /** Slot fills by slot name. Two blocks filling one slot is an error. */
  readonly slots: Readonly<Record<string, SlotOf<B>>>;
  readonly migrations: readonly Contributed<BlockMigration, B["id"]>[];
  readonly skills: readonly Contributed<{ path: string }, B["id"]>[];
  readonly privacy: readonly Contributed<BlockPrivacy, B["id"]>[];
  /** With `missing: "drop"`: blocks left out, and the requirements that were off. */
  readonly dropped: readonly { id: B["id"]; missing: readonly string[] }[];
}

type SlotOf<B> = B extends BlockDef<string, infer S> ? S : never;

function enabledPredicate(enabled: EnabledBlocks | undefined): ((id: string) => boolean) | undefined {
  if (enabled === undefined) return undefined;
  if (typeof enabled === "function") return enabled;
  const set = new Set(enabled);
  return (id) => set.has(id);
}

const byOrder = <T extends { order?: number }>(items: { item: T; at: number }[]) =>
  items.sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0) || a.at - b.at).map((x) => x.item);

/**
 * The blocks that are on, checked and merged:
 *
 * - every block is valid ({@link defineBlock}'s checks, for blocks built by hand) and its id is unique;
 * - `requires` has no cycles, and with `features`, names real features;
 * - every enabled block's requirements are on (see {@link ResolveBlocksOptions.missing});
 * - no two enabled blocks contribute the same nav id, settings row id, route path or slot.
 *
 * `enabled` left out means every block given is on (and no app feature that
 * isn't a block). Throws a {@link BlockError} listing every problem at once.
 *
 * @stability Beta
 */
export function resolveBlocks<B extends BlockDef<string, unknown>>(
  blocks: readonly B[],
  enabled?: EnabledBlocks,
  options: ResolveBlocksOptions = {},
): ResolvedBlocks<B> {
  const { platform, features, missing = "throw", slots: slotNames } = options;
  const problems: string[] = [];
  const byId = new Map<string, B>();
  for (const block of blocks) {
    problems.push(...blockProblems(block));
    if (byId.has(block.id)) problems.push(`${block.id}: two blocks have this id`);
    else byId.set(block.id, block);
  }
  const isFeature = features ? (id: string) => Object.hasOwn(features, id) : undefined;
  if (isFeature) for (const id of byId.keys()) if (!isFeature(id)) problems.push(`${id}: not a feature in the registry`);
  const graph = Object.fromEntries([...byId].map(([id, b]) => [id, { requires: b.requires }]));
  // Self-requirements are already reported by blockProblems; here, unknown ids and cycles.
  const known = { noun: "block", isKnown: (req: string) => byId.has(req) || !isFeature || isFeature(req) };
  for (const [id, node] of Object.entries(graph)) {
    for (const req of node.requires ?? []) {
      if (req !== id && requirementProblem(graph, id, req, known)) problems.push(`${id}.requires: "${req}" is neither a block nor a feature in the registry`);
    }
  }
  problems.push(...cycleProblems(graph));
  if (problems.length) throw new BlockError(problems);

  const isOn = enabledPredicate(enabled);
  const runsHere = (b: B) => !platform || !b.platforms || b.platforms.includes(platform);
  const active = new Set<string>();
  for (const [id, b] of byId) if ((!isOn || isOn(id)) && runsHere(b)) active.add(id);

  // In dependency order, so dropping a block also drops what needs it.
  const order = dependencyOrder(graph);
  const dropped: { id: B["id"]; missing: string[] }[] = [];
  for (const id of order) {
    if (!active.has(id)) continue;
    const off = (byId.get(id)!.requires ?? []).filter((req) => {
      if (byId.has(req)) return !active.has(req);
      return !isOn || !isOn(req);
    });
    if (!off.length) continue;
    if (missing === "drop") {
      active.delete(id);
      dropped.push({ id, missing: off });
      continue;
    }
    for (const req of off) {
      const why = !byId.has(req)
        ? isOn
          ? "is not enabled"
          : "is not one of the blocks given (pass it, or list the app feature in enabled)"
        : !runsHere(byId.get(req)!)
          ? `doesn't run on ${platform}`
          : "is off";
      problems.push(`${id}.requires: "${req}" ${why}; turn it on or turn ${id} off`);
    }
  }
  if (problems.length) throw new BlockError(problems);

  const on = order.filter((id) => active.has(id)).map((id) => byId.get(id)!);
  const nav: { item: Contributed<BlockNavItem, B["id"]>; at: number }[] = [];
  const settings: { item: Contributed<BlockSettingsRow, B["id"]>; at: number }[] = [];
  const routes: Contributed<BlockRoute, B["id"]>[] = [];
  const migrations: Contributed<BlockMigration, B["id"]>[] = [];
  const skills: Contributed<{ path: string }, B["id"]>[] = [];
  const privacy: Contributed<BlockPrivacy, B["id"]>[] = [];
  const slots: Record<string, SlotOf<B>> = {};
  const owner = { nav: new Map<string, string>(), settings: new Map<string, string>(), routes: new Map<string, string>(), slots: new Map<string, string>() };
  const claim = (kind: keyof typeof owner, key: string, id: string, what: string) => {
    const first = owner[kind].get(key);
    if (first !== undefined) problems.push(`${id}.contributes.${kind}: ${what} "${key}" is already contributed by ${first}`);
    else owner[kind].set(key, id);
    return first === undefined;
  };
  on.forEach((block, at) => {
    const feature = block.id;
    const c = block.contributes ?? {};
    for (const n of c.nav ?? []) if (claim("nav", n.id, feature, "the nav entry")) nav.push({ item: { ...n, feature }, at });
    for (const r of c.settings ?? []) if (claim("settings", r.id, feature, "the settings row")) settings.push({ item: { ...r, feature }, at });
    for (const r of c.routes ?? []) if (claim("routes", r.path, feature, "the route")) routes.push({ ...r, feature });
    for (const [name, fill] of Object.entries(c.slots ?? {})) {
      if (slotNames && !slotNames.includes(name)) {
        problems.push(`${feature}.contributes.slots: "${name}" is not a slot here (${slotNames.join(", ")})`);
        continue;
      }
      if (claim("slots", name, feature, "the slot")) slots[name] = fill as SlotOf<B>;
    }
    for (const m of c.migrations ?? []) migrations.push({ ...m, feature });
    for (const path of c.skills ?? []) skills.push({ path, feature });
    if (c.privacy) privacy.push({ ...c.privacy, feature });
  });
  if (problems.length) throw new BlockError(problems);

  const ids = new Set(on.map((b) => b.id)) as ReadonlySet<B["id"]>;
  return Object.freeze({
    blocks: Object.freeze(on),
    ids,
    has: (id: string) => ids.has(id as B["id"]),
    contributionsOf: (id: B["id"]) => (ids.has(id) ? ((byId.get(id)!.contributes ?? {}) as NonNullable<B["contributes"]>) : undefined),
    nav: Object.freeze(byOrder(nav)),
    settings: Object.freeze(byOrder(settings)),
    routes: Object.freeze(routes),
    slots: Object.freeze(slots),
    migrations: Object.freeze(migrations),
    skills: Object.freeze(skills),
    privacy: Object.freeze(privacy),
    dropped: Object.freeze(dropped),
  });
}
