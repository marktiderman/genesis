import { z } from "zod";

/**
 * Where a feature is in its life. The order is the board's column order.
 *
 * @stability Beta
 */
export const FEATURE_STATUSES = ["planned", "building", "beta", "live", "retired"] as const;

/** @stability Beta */
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

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

/**
 * One feature. The object key in {@link defineFeatures} is its id, so the
 * entry carries no `id` of its own.
 *
 * @stability Beta
 */
export interface FeatureDef {
  name: string;
  /** One sentence: what it does for whom. */
  summary: string;
  status: FeatureStatus;
  /** Who answers for it: a person, a team or an agent session's name. */
  owner: string;
  /** Which of the repo's apps or surfaces carry it, e.g. `["web"]`. */
  apps: readonly string[];
  /** Who it is for, e.g. `["client", "coach"]`. */
  audience: readonly string[];
  /** When it first shipped or started: `YYYY-MM-DD` or `YYYY-MM`. */
  since?: string;
  links?: FeatureLinks;
}

/**
 * Why a flag exists. `release` flags are temporary and need an `expires` date.
 *
 * @stability Beta
 */
export const FLAG_KINDS = ["release", "experiment", "ops", "permission"] as const;

/** @stability Beta */
export type FlagKind = (typeof FLAG_KINDS)[number];

/**
 * One flag. `feature` names the {@link FeatureDef} it belongs to; a feature's
 * flags are found by reverse lookup ({@link flagsForFeature}) and never
 * written on the feature itself.
 *
 * @stability Beta
 */
export interface FlagDef<F extends string = string> {
  feature: F;
  owner: string;
  kind: FlagKind;
  description?: string;
  /** `YYYY-MM-DD`. Required for `release` flags. */
  expires?: string;
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

const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_OR_DAY = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const URL_RE = /^https?:\/\/\S+$/;
const ISSUE = /^(https?:\/\/\S+|([\w.-]+\/[\w.-]+)?#\d+)$/;

const text = z.string().trim().min(1);

/** A repo-relative path that stays inside the repo. */
const repoPath = text.refine(
  (p) => !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split(/[\\/]/).includes(".."),
  { message: "must be a path relative to the repo root, without ..", },
);

const linksSchema = z
  .object({
    code: z.array(repoPath).optional(),
    docs: z.array(z.union([z.string().regex(URL_RE), repoPath])).optional(),
    issue: z.string().regex(ISSUE, "must be a URL, #123 or owner/repo#123").optional(),
  })
  .strict();

/** The Zod schema for one {@link FeatureDef}. */
export const featureSchema = z
  .object({
    name: text,
    summary: text,
    status: z.enum(FEATURE_STATUSES),
    owner: text,
    apps: z.array(text).min(1),
    audience: z.array(text).min(1),
    since: z.string().regex(MONTH_OR_DAY, "must be YYYY-MM-DD or YYYY-MM").optional(),
    links: linksSchema.optional(),
  })
  .strict();

/** The Zod schema for one {@link FlagDef}. Cross-flag rules live in {@link defineFlags}. */
export const flagSchema = z
  .object({
    feature: text,
    owner: text,
    kind: z.enum(FLAG_KINDS),
    description: text.optional(),
    expires: z.string().regex(DAY, "must be YYYY-MM-DD").optional(),
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

/**
 * The one source of truth for a repo's features. Validates every entry and
 * returns the same object, so running code reads it directly and the key type
 * becomes the repo's `FeatureId`:
 *
 * ```ts
 * export const features = defineFeatures({
 *   tasks: { name: "Tasks", summary: "…", status: "live", owner: "mark", apps: ["web"], audience: ["client"] },
 * });
 * export type FeatureId = FeatureIdOf<typeof features>;
 * ```
 *
 * @stability Beta
 */
export function defineFeatures<const T extends Record<string, FeatureDef>>(features: T): T {
  const problems: string[] = [];
  for (const [id, def] of Object.entries(features)) {
    if (!ID.test(id)) problems.push(`${id}: the id must be lowercase letters and digits, joined by - or _`);
    const parsed = featureSchema.safeParse(def);
    if (!parsed.success) problems.push(...issues(id, parsed.error));
  }
  if (problems.length) throw new FeatureRegistryError(problems);
  return Object.freeze(features);
}

/**
 * Flags, each tied to a feature of `features`. An unknown `feature` is a type
 * error, and at runtime:
 * - every flag needs an `owner` and a `kind`;
 * - a `release` flag needs an `expires` date;
 * - a feature's second (third, …) flag needs a `splitReason`, because flags
 *   are grouped by feature unless there's a stated reason to split.
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
    if (flag.kind === "release" && !flag.expires) problems.push(`${name}.expires: a release flag needs an expiry date`);
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
 * Release flags whose `expires` date is before `today` (`YYYY-MM-DD`, default
 * today in UTC): candidates to remove.
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
 * A feature flattened for a list, a board or JSON: its id, its fields and the
 * names of its flags.
 *
 * @stability Beta
 */
export interface FeatureRecord extends FeatureDef {
  [key: string]: unknown;
  id: string;
  flags: string[];
}

/**
 * Features as records, in declaration order, each with its flags attached.
 *
 * @stability Beta
 */
export function toRecords(features: Features, flags?: Flags): FeatureRecord[] {
  return Object.entries(features).map(([id, def]) => ({ id, ...def, flags: flagsForFeature(flags, id) }));
}
