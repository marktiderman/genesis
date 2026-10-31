import { z } from "zod";
import { cycleProblems, requirementProblem } from "./graph";
import { FEATURE_PLATFORMS, type FeaturePlatform } from "./platforms";
import { statusOn } from "./status";
import type { PackageLayer } from "./packages";
import { FEATURE_STATUSES, FLAG_KINDS, type FeatureAccess, type FeatureStatus, type FlagKind, type FlagValue } from "./types";

// The plain types live in their own zod-free file, shared with the gate.
export { FEATURE_STATUSES, FLAG_KINDS, type FeatureAccess, type FeatureStatus, type FlagKind, type FlagValue };



/**
 * When a planned or building feature is due, without dates: the roadmap's
 * three columns.
 *
 * @stability Beta
 */
export const FEATURE_HORIZONS = ["now", "next", "later"] as const;

/** @stability Beta */
export type FeatureHorizon = (typeof FEATURE_HORIZONS)[number];

/**
 * Who may see a feature listed. `public` features with a `tagline` go on
 * marketing output; `client:<name>` is one customer's own feature.
 *
 * @stability Beta
 */
export type FeatureVisibility = "internal" | "customer" | "public" | `client:${string}`;


/**
 * Pointers from a feature to where it lives. `code` paths are relative to the
 * repository root and `genesis features check` fails when one doesn't exist.
 *
 * @stability Beta
 */
export interface FeatureLinks {
  /** Files or folders that implement the feature, relative to the repo root. */
  code?: readonly string[];
  /** Docs: a repo-relative path or a URL. */
  docs?: readonly string[];
  /** The tracking issue: a URL, `#123` or `owner/repo#123`. */
  issue?: string;
}

// Where a feature runs: in its own file so the zod-free blocks entry shares it.
export { FEATURE_PLATFORMS, type FeaturePlatform };

/**
 * What kind of thing a feature is, from smallest to largest, so an agent
 * looking for a building block can tell an element from a whole block:
 * `token`, `element` (one component), `pattern` (a composed component with
 * slots), `layout` (a page or screen shell), `hook`, `provider` (data or
 * context), `block` (a feature an app adds whole: UI, data and server),
 * `service` (server code) and `tool` (CLI, CI, devtools).
 *
 * A feature's layer is not declared: it is its package's layer (see
 * {@link featurePackageLayer} and `PACKAGE_LAYERS`).
 *
 * @stability Beta
 */
export const FEATURE_KINDS = ["token", "element", "pattern", "layout", "hook", "provider", "block", "service", "tool"] as const;

/** @stability Beta */
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** @deprecated Use `FEATURE_KINDS`. Removed at the next major. */
export const FEATURE_LAYERS = FEATURE_KINDS;

/** @deprecated Use `FeatureKind`. Removed at the next major. */
export type FeatureLayer = FeatureKind;

/** @deprecated Use `"element"`. Accepted until the next major. */
export type DeprecatedFeatureLayer = "primitive";

/**
 * A kind written in the deprecated `layer` field, with its old name
 * `"primitive"` mapped to `"element"`.
 *
 * @stability Beta
 */
export function featureLayer(layer: FeatureKind | DeprecatedFeatureLayer | undefined): FeatureKind | undefined {
  return layer === "primitive" ? "element" : layer;
}

/**
 * A feature's kind: `kind`, or else the deprecated `layer` field (read until
 * the next major).
 *
 * @stability Beta
 */
export function featureKind(def: Pick<FeatureDef, "kind" | "layer">): FeatureKind | undefined {
  return def.kind ?? featureLayer(def.layer);
}

/** A picture or video for a marketing page. @stability Beta */
export interface FeatureMedia {
  image?: string;
  video?: string;
  alt: string;
}

/**
 * One feature. The object key in {@link defineFeatures} is its id: permanent,
 * never reused, and renamed only through `aliases`.
 *
 * @stability Beta
 */
export interface FeatureDef {
  name: string;
  /** One sentence for the team: what it does for whom. */
  summary: string;
  status: FeatureStatus;
  /** Who answers for it: a person, a team or an agent session's name. */
  owner: string;
  /** Which of the repo's apps or surfaces carry it, e.g. `["web"]`. */
  apps: readonly string[];
  /** Who it is for, e.g. `["client", "coach"]`. */
  audience: readonly string[];
  /** Roadmap column. Only on planned (required) or building features. */
  horizon?: FeatureHorizon;
  /** Default `customer`. */
  visibility?: FeatureVisibility;
  /** Default `all`. */
  access?: FeatureAccess;
  /** One testable sentence each. Required on beta and live features. */
  acceptance?: readonly string[];
  /** Ids this feature had before. An old id can't be reused. */
  aliases?: readonly string[];
  /** When someone last checked this entry against the product: `YYYY-MM-DD`. */
  reviewedAt?: string;
  /** Who is building it right now. Only on building features. */
  claimedBy?: string;
  /** When it first shipped or started: `YYYY-MM-DD` or `YYYY-MM`. */
  since?: string;
  links?: FeatureLinks;
  /** One line of benefit, for customers. Needed for marketing output. */
  tagline?: string;
  /** A group on a marketing page. */
  category?: string;
  media?: FeatureMedia;
  /** A hero item on a marketing page. */
  highlight?: boolean;
  /** What kind of thing it is. */
  kind?: FeatureKind;
  /**
   * @deprecated Use `kind` (same values; `"primitive"` means `"element"`). Read until the
   * next major, when `layer` is the owning package's layer, derived and never written.
   */
  layer?: FeatureKind | DeprecatedFeatureLayer;
  /**
   * Status per platform, when it differs from `status`: `{ web: "live", native: "planned" }`.
   * A platform left out doesn't have it.
   */
  platforms?: Partial<Record<FeaturePlatform, FeatureStatus>>;
  /** What to import, per platform, e.g. `{ web: "@marktiderman/genesis-ui/settings-row" }`. */
  entry?: Partial<Record<FeaturePlatform, string>>;
  /** Other words people use for it, so `find` matches them: `["chat", "dm"]`. */
  keywords?: readonly string[];
  /** The feature this one is a variant of. */
  extends?: string;
  /** Features it needs. A beta or live feature can't require an idea, a planned or a retired one. */
  requires?: readonly string[];
  /** What it adds to an app, e.g. `["nav item", "settings row", "table: threads"]`. */
  contributes?: readonly string[];
  /** The parts an app can replace or drop through `slots`. */
  slots?: readonly string[];
}




/**
 * One flag. `feature` names the {@link FeatureDef} it belongs to; a feature's
 * flags are found by reverse lookup ({@link flagsForFeature}) and never
 * written on the feature itself.
 *
 * @stability Beta
 */
export interface FlagDef<F extends string = string> {
  feature: F;
  kind: FlagKind;
  owner: string;
  default: FlagValue;
  /** Where it can be set, e.g. `["platform", "practice", "user"]`. */
  scopes: readonly string[];
  description?: string;
  /** `YYYY-MM-DD`. Required on release and experiment flags; `check` fails after it. */
  expires?: string;
  /** What to do when you flip it: a repo path or a URL. Required on ops flags. */
  runbook?: string;
  /**
   * Flags are grouped by feature: one flag per feature by default. Every flag
   * after a feature's first must say why it is a separate flag.
   */
  splitReason?: string;
}

/** The id type of a features object: `type FeatureId = FeatureIdOf<typeof features>`. */
export type FeatureIdOf<T> = Extract<keyof T, string>;

/** A features object as {@link defineFeatures} returns it. */
export type Features<Id extends string = string> = { readonly [K in Id]: FeatureDef };

/** A flags object as {@link defineFlags} returns it. */
export type Flags<F extends string = string> = { readonly [name: string]: FlagDef<F> };

const ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_OR_DAY = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const URL_RE = /^https?:\/\/\S+$/;
const ISSUE = /^(https?:\/\/\S+|([\w.-]+\/[\w.-]+)?#\d+)$/;

const text = z.string().trim().min(1);
const day = z.string().regex(DAY, "must be YYYY-MM-DD");

/** A repo-relative path that stays inside the repo. */
const repoPath = text.refine(
  (p) => !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split(/[\\/]/).includes(".."),
  { message: "must be a path relative to the repo root, without .." },
);
const pathOrUrl = z.union([z.string().regex(URL_RE), repoPath]);

const linksSchema = z
  .object({
    code: z.array(repoPath).optional(),
    docs: z.array(pathOrUrl).optional(),
    issue: z.string().regex(ISSUE, "must be a URL, #123 or owner/repo#123").optional(),
  })
  .strict();

const visibilitySchema = z.union([
  z.enum(["internal", "customer", "public"]),
  z.string().regex(/^client:\S+$/, "must be internal, customer, public or client:<name>"),
]);

/** `{ web?, native?, server?, cli? }`, each holding `value`. (Not `z.partialRecord`, which zod 3 lacks.) */
const perPlatform = <T extends z.ZodTypeAny>(value: T) =>
  z.object(Object.fromEntries(FEATURE_PLATFORMS.map((p) => [p, value.optional()])) as Record<FeaturePlatform, z.ZodOptional<T>>).strict();

/** The Zod schema for one {@link FeatureDef}, field by field. Cross-field rules live in {@link featureProblems}. */
export const featureSchema = z
  .object({
    name: text,
    summary: text,
    status: z.enum(FEATURE_STATUSES),
    owner: text,
    apps: z.array(text).min(1),
    audience: z.array(text).min(1),
    horizon: z.enum(FEATURE_HORIZONS).optional(),
    visibility: visibilitySchema.optional(),
    access: z.union([z.literal("all"), z.object({ plan: text }).strict()]).optional(),
    acceptance: z.array(text).optional(),
    aliases: z.array(z.string().regex(ID, "must be a feature id")).optional(),
    reviewedAt: day.optional(),
    claimedBy: text.optional(),
    since: z.string().regex(MONTH_OR_DAY, "must be YYYY-MM-DD or YYYY-MM").optional(),
    links: linksSchema.optional(),
    tagline: text.optional(),
    category: text.optional(),
    media: z
      .object({ image: pathOrUrl.optional(), video: pathOrUrl.optional(), alt: text })
      .strict()
      .optional(),
    highlight: z.boolean().optional(),
    kind: z.enum(FEATURE_KINDS).optional(),
    layer: z.enum([...FEATURE_KINDS, "primitive"]).optional(),
    platforms: perPlatform(z.enum(FEATURE_STATUSES)).optional(),
    entry: perPlatform(text).optional(),
    keywords: z.array(text).optional(),
    extends: z.string().regex(ID, "must be a feature id").optional(),
    requires: z.array(z.string().regex(ID, "must be a feature id")).optional(),
    contributes: z.array(text).optional(),
    slots: z.array(text).optional(),
  })
  .strict();

const flagValue: z.ZodType<FlagValue> = z.union([z.boolean(), z.string(), z.number(), z.record(z.string(), z.unknown())]);

/** The Zod schema for one {@link FlagDef}. Cross-flag rules live in {@link defineFlags}. */
export const flagSchema = z
  .object({
    feature: text,
    kind: z.enum(FLAG_KINDS),
    owner: text,
    default: flagValue,
    scopes: z.array(text).min(1),
    description: text.optional(),
    expires: day.optional(),
    runbook: pathOrUrl.optional(),
    splitReason: text.optional(),
  })
  .strict();

/** Thrown by {@link defineFeatures} and {@link defineFlags}; lists every problem at once. */
export class FeatureRegistryError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid feature registry:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "FeatureRegistryError";
  }
}

function issues(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${[prefix, ...i.path].join(".")}: ${i.message}`);
}

/** The rules between one feature's fields, as problem strings. */
function featureProblems(id: string, def: FeatureDef): string[] {
  const problems: string[] = [];
  const early = def.status === "planned" || def.status === "building";
  if (def.horizon && !early) problems.push(`${id}.horizon: only planned and building features are on the roadmap`);
  if (def.status === "planned" && !def.horizon) problems.push(`${id}.horizon: a planned feature needs now, next or later`);
  if ((def.status === "beta" || def.status === "live") && !def.acceptance?.length) {
    problems.push(`${id}.acceptance: a ${def.status} feature needs at least one testable sentence`);
  }
  if (def.claimedBy && def.status !== "building") problems.push(`${id}.claimedBy: only a building feature can be claimed`);
  if (def.media && !def.media.image && !def.media.video) problems.push(`${id}.media: needs an image or a video`);
  if (def.kind && def.layer && featureLayer(def.layer) !== def.kind) {
    problems.push(`${id}.layer: says ${def.layer} but kind says ${def.kind}; drop layer (deprecated), kind replaces it`);
  }
  return problems;
}

/**
 * The one source of truth for a repo's features. Validates every entry and
 * returns the same object, so running code reads it directly and the key type
 * becomes the repo's `FeatureId`:
 *
 * ```ts
 * export const features = defineFeatures({
 *   tasks: { name: "Tasks", summary: "…", status: "live", owner: "mark", apps: ["web"], audience: ["client"],
 *            acceptance: ["A client can tick off a task their coach added."] },
 * });
 * export type FeatureId = FeatureIdOf<typeof features>;
 * ```
 *
 * @stability Beta
 */
export function defineFeatures<const T extends Record<string, FeatureDef>>(features: T): T {
  const problems: string[] = [];
  const invalid = new Set<string>();
  const owners = new Map<string, string>();
  for (const [id, def] of Object.entries(features)) {
    if (!ID.test(id)) problems.push(`${id}: the id must be lowercase letters and digits, joined by -, _ or .`);
    const parsed = featureSchema.safeParse(def);
    if (!parsed.success) {
      problems.push(...issues(id, parsed.error));
      invalid.add(id);
      continue;
    }
    problems.push(...featureProblems(id, def));
    for (const name of [id, ...(def.aliases ?? [])]) {
      const other = owners.get(name);
      if (other !== undefined) problems.push(`${id}: "${name}" is already ${other === name ? "a feature id" : `an alias of ${other}`}`);
      else owners.set(name, id);
    }
  }
  problems.push(...relationProblems(features, invalid));
  if (problems.length) throw new FeatureRegistryError(problems);
  return Object.freeze(features);
}

const UNSHIPPED: readonly FeatureStatus[] = ["idea", "planned", "retired"];

/** `extends` and `requires` name real, distinct features; `requires` has no cycles; shipped features need shipped ones. */
function relationProblems(features: Record<string, FeatureDef>, skip: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const has = (id: string) => Object.hasOwn(features, id);
  for (const [id, def] of Object.entries(features)) {
    // A schema-invalid entry is already reported; its fields can't be trusted here.
    if (skip.has(id)) continue;
    if (def.extends !== undefined) {
      if (def.extends === id) problems.push(`${id}.extends: a feature can't extend itself`);
      else if (!has(def.extends)) problems.push(`${id}.extends: "${def.extends}" is not a feature`);
    }
    // Itself and unknown ids: the same checks `resolveBlocks` runs on blocks.
    for (const req of def.requires ?? []) {
      const problem = requirementProblem(features, id, req, { noun: "feature" });
      if (problem) problems.push(problem);
      else if (!skip.has(req) && (def.status === "beta" || def.status === "live") && UNSHIPPED.includes(features[req]!.status)) {
        problems.push(`${id}.requires: a ${def.status} feature can't require "${req}", which is ${features[req]!.status}`);
      }
    }
  }
  problems.push(...cycleProblems(features, skip));
  return problems;
}

/**
 * Flags, each tied to a feature of `features`. An unknown `feature` is a type
 * error, and at runtime:
 * - every flag needs an `owner`, a `kind`, a `default` and its `scopes`;
 * - `release` and `experiment` flags need an `expires` date, `ops` flags a `runbook`;
 * - a feature's second (third, …) flag needs a `splitReason`, because flags
 *   are grouped by feature unless there's a stated reason to split.
 *
 * `permission` flags are accepted here so the app still runs, and refused by
 * `genesis features check`.
 *
 * @stability Beta
 */
export function defineFlags<F extends string, const T extends Record<string, FlagDef<NoInfer<F>>>>(
  features: { readonly [K in F]: FeatureDef },
  flags: T,
): T {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const [name, def] of Object.entries(flags)) {
    const parsed = flagSchema.safeParse(def);
    if (!parsed.success) {
      problems.push(...issues(name, parsed.error));
      continue;
    }
    const flag = parsed.data;
    if (!Object.hasOwn(features, flag.feature)) problems.push(`${name}.feature: "${flag.feature}" is not a feature`);
    if ((flag.kind === "release" || flag.kind === "experiment") && !flag.expires) {
      problems.push(`${name}.expires: a ${flag.kind} flag needs an expiry date`);
    }
    if (flag.kind === "ops" && !flag.runbook) problems.push(`${name}.runbook: an ops flag needs a runbook`);
    const first = seen.get(flag.feature);
    if (first === undefined) seen.set(flag.feature, name);
    else if (!flag.splitReason)
      problems.push(`${name}.splitReason: "${flag.feature}" already has the flag ${first}; say why this one is separate`);
  }
  if (problems.length) throw new FeatureRegistryError(problems);
  return Object.freeze(flags);
}

/**
 * The names of the flags that belong to a feature, in declaration order.
 *
 * @stability Beta
 */
export function flagsForFeature(flags: Flags | undefined, id: string): string[] {
  if (!flags) return [];
  return Object.entries(flags)
    .filter(([, flag]) => flag.feature === id)
    .map(([name]) => name);
}

/**
 * Flags whose `expires` date is before `today` (`YYYY-MM-DD`, default today in
 * UTC): remove the code path, then the flag.
 *
 * @stability Beta
 */
export function expiredFlags(flags: Flags | undefined, today = new Date().toISOString().slice(0, 10)): string[] {
  if (!flags) return [];
  return Object.entries(flags)
    .filter(([, flag]) => flag.expires !== undefined && flag.expires < today)
    .map(([name]) => name);
}

/**
 * A feature flattened for a list, a board or JSON: its id, its fields with
 * defaults filled in, and the names of its flags.
 *
 * @stability Beta
 */
export interface FeatureRecord extends FeatureDef {
  [key: string]: unknown;
  id: string;
  visibility: FeatureVisibility;
  access: FeatureAccess;
  flags: string[];
}

/**
 * Features as records, in declaration order, each with its flags attached.
 *
 * @stability Beta
 */
export function toRecords(features: Features, flags?: Flags): FeatureRecord[] {
  // The deprecated `layer` comes out as `kind`, so a record's `layer` can later mean the package's.
  return Object.entries(features).map(([id, { layer: _layer, ...def }]) => ({
    id,
    ...def,
    ...(featureKind({ ...def, layer: _layer }) ? { kind: featureKind({ ...def, layer: _layer }) } : {}),
    visibility: def.visibility ?? "customer",
    access: def.access ?? "all",
    flags: flagsForFeature(flags, id),
  }));
}

/**
 * Narrows {@link findFeatures}: only features on a platform (from `platforms`,
 * or `apps` when a feature has no `platforms`), of a layer, or in a status.
 *
 * @stability Beta
 */
export interface FindOptions {
  platform?: FeaturePlatform;
  kind?: FeatureKind;
  /** @deprecated Use `kind` (`"primitive"` is read as `"element"`). */
  layer?: FeatureKind | DeprecatedFeatureLayer;
  /**
   * Only features whose package is in this layer (see {@link featurePackageLayer}).
   * Needs `packages`: without them it throws, rather than matching nothing.
   */
  packageLayer?: PackageLayer;
  /** The packages a feature can belong to, for `packageLayer`. */
  packages?: readonly FeaturePackage[];
  status?: FeatureStatus;
}

/**
 * A package a feature can belong to: its npm name, its folder (repo-relative,
 * e.g. `packages/ui`) when it is in this repo, and its layer.
 *
 * @stability Beta
 */
export interface FeaturePackage {
  name: string;
  dir?: string;
  layer: PackageLayer;
}

/** The package an import specifier names: `@scope/name` or `name`, without a subpath. */
function specifierPackage(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

/**
 * A feature's layer, derived from the package that owns it: the first `entry`
 * import whose package is known, else the first `links.code` path inside a
 * known package folder. Undefined when no package owns it (an app's own
 * feature, a tool in scripts/).
 *
 * @stability Beta
 */
export function featurePackageLayer(
  def: FeatureDef,
  packages: readonly FeaturePackage[],
): PackageLayer | undefined {
  for (const specifier of Object.values(def.entry ?? {})) {
    const name = specifier && specifierPackage(specifier);
    const hit = packages.find((p) => p.name === name);
    if (hit) return hit.layer;
  }
  for (const raw of def.links?.code ?? []) {
    const path = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    const hit = packages.find((p) => p.dir && (path === p.dir || path.startsWith(`${p.dir}/`)));
    if (hit) return hit.layer;
  }
  return undefined;
}

// A feature's status on one platform: in its own zod-free file so the gate shares it.
export { statusOn };

/**
 * Features matching `term` in their id, aliases, name, keywords, summary,
 * tagline, category, import paths, slots, contributions or code paths, best
 * matches (id, name and keywords) first. With `options` and an empty `term`,
 * every feature that passes the filters.
 *
 * @stability Beta
 */
export function findFeatures(features: Features, term: string, flags?: Flags, options: FindOptions = {}): FeatureRecord[] {
  const needle = term.trim().toLowerCase();
  const kind = options.kind ?? featureLayer(options.layer);
  if (options.packageLayer && !options.packages) throw new Error("findFeatures: packageLayer needs packages");
  const filtered = Boolean(options.platform || kind || options.packageLayer || options.status);
  if (!needle && !filtered) return [];
  const keep = (r: FeatureRecord) =>
    (!options.platform || statusOn(r, options.platform) !== undefined) &&
    (!kind || featureKind(r) === kind) &&
    (!options.packageLayer || featurePackageLayer(r, options.packages ?? []) === options.packageLayer) &&
    (!options.status || r.status === options.status);
  const score = (r: FeatureRecord) => {
    if (!needle) return 0;
    if (r.id === needle || r.aliases?.includes(needle)) return 0;
    if (r.id.includes(needle) || r.name.toLowerCase().includes(needle)) return 1;
    if (r.keywords?.some((k) => k.toLowerCase().includes(needle))) return 1;
    if (r.flags.some((f) => f.toLowerCase().includes(needle))) return 2;
    const rest = [
      r.summary,
      r.tagline,
      r.category,
      ...(r.links?.code ?? []),
      ...(r.aliases ?? []),
      ...Object.values(r.entry ?? {}),
      ...(r.slots ?? []),
      ...(r.contributes ?? []),
    ];
    return rest.some((v) => v?.toLowerCase().includes(needle)) ? 3 : -1;
  };
  return toRecords(features, flags)
    .filter(keep)
    .map((r) => [score(r), r] as const)
    .filter(([s]) => s >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r);
}
