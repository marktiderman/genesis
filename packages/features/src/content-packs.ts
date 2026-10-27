/**
 * Content packs: versioned data that fills installed blocks (session types and
 * agendas, metric templates, custom field definitions, forms, roadmap templates,
 * labels). A pack is code, reviewed like any other: the publishing package
 * exports it, and an installer copies it into a tenant's editable rows, keeping
 * each row's source (pack, version, key) so an update can tell what a person
 * changed.
 *
 * `defineContentPack` checks a pack's shape; `contentPackProblems` with the
 * installed blocks also checks that every block it fills is there. Keys, not
 * ids, link things together, and stay the same across versions.
 *
 * No zod here: packs ship to phones with `/blocks`.
 */
import type { EnabledBlocks } from "./blocks";

/** A content pack's settings for one session type, with its agenda. @stability Beta */
export interface ContentPackSessionType {
  key: string;
  kind: string;
  name: string;
  description?: string;
  defaultMinutes?: number;
  agenda: readonly { key: string; title: string; minutes: number }[];
}

/** A metric to start from. @stability Beta */
export interface ContentPackMetricTemplate {
  key: string;
  name: string;
  unitType: string;
  unit?: string;
  cadence: string;
  goalDirection: string;
  goalValue?: number;
  goalMax?: number;
  measureKind?: string;
  rollup?: string;
}

/** Where a custom field lives, and the block that owns that table. @stability Beta */
export const CONTENT_PACK_FIELD_TARGETS = {
  pursuits: "pursuits",
  work_items: "pursuits",
  metrics: "metrics",
  sessions: "sessions",
} as const;

/** @stability Beta */
export type ContentPackFieldTarget = keyof typeof CONTENT_PACK_FIELD_TARGETS;

/** A custom field: a genesis-forms serializable field, on one of the work tables. @stability Beta */
export interface ContentPackFieldDefinition {
  key: string;
  target: ContentPackFieldTarget;
  label: string;
  /** A genesis-forms serializable field: type, options, validation. */
  field: { readonly type: string; readonly [key: string]: unknown };
  required?: boolean;
  visibility: "tenant" | "app" | "private";
}

/** A worksheet, assessment or form: a genesis-forms definition. @stability Beta */
export interface ContentPackForm {
  key: string;
  kind: "worksheet" | "assessment" | "form";
  title: string;
  definition: { readonly [key: string]: unknown };
  scoring?: unknown;
}

/** A roadmap to start from: items that release by a rule, linked to each other by key. @stability Beta */
export interface ContentPackRoadmapTemplate {
  key: string;
  name: string;
  items: readonly {
    key: string;
    kind: string;
    title: string;
    /** Another item's key in this template. */
    ref?: string;
    release: { rule: string; afterDays?: number; anchor?: string };
  }[];
}

/** One content pack, as its publisher defines it. @stability Beta */
export interface ContentPackDef {
  /** Kebab-case, unique per publisher. */
  id: string;
  name: string;
  description?: string;
  /** Semver. Updates are additive. */
  version: string;
  /** The package that publishes it. */
  publisher: string;
  /** The block ids it fills; installing is refused unless every one is installed. */
  requires: readonly string[];
  /** Taxonomy: label key → display text, e.g. `"pursuit.quarter": "Rocks"`. */
  labels?: Readonly<Record<string, string>>;
  sessionTypes?: readonly ContentPackSessionType[];
  metricTemplates?: readonly ContentPackMetricTemplate[];
  fieldDefinitions?: readonly ContentPackFieldDefinition[];
  forms?: readonly ContentPackForm[];
  roadmapTemplates?: readonly ContentPackRoadmapTemplate[];
}

/** Thrown by {@link defineContentPack}; lists every problem at once. @stability Beta */
export class ContentPackError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid content pack:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ContentPackError";
  }
}

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KEY = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** The block each section fills. */
const SECTION_BLOCK = { sessionTypes: "sessions", metricTemplates: "metrics", forms: "forms", roadmapTemplates: "roadmap" } as const;

function keyProblems(where: string, items: readonly { key: string }[] | undefined): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, item] of (items ?? []).entries()) {
    if (typeof item?.key !== "string" || !KEY.test(item.key)) problems.push(`${where}[${i}].key: "${String(item?.key)}" is not a key (lowercase, dots, dashes or underscores)`);
    else if (seen.has(item.key)) problems.push(`${where}: the key "${item.key}" is used twice`);
    else seen.add(item.key);
  }
  return problems;
}

/** The block ids a pack's sections need, whatever it declares. @stability Beta */
export function contentPackBlocks(pack: ContentPackDef): string[] {
  const needed = new Set<string>();
  for (const [section, block] of Object.entries(SECTION_BLOCK)) {
    const items = pack[section as keyof typeof SECTION_BLOCK];
    if (items && items.length) needed.add(block);
  }
  for (const f of pack.fieldDefinitions ?? []) {
    const block = CONTENT_PACK_FIELD_TARGETS[f.target];
    if (block) needed.add(block);
  }
  return [...needed].sort();
}

function test(blocks: EnabledBlocks): (id: string) => boolean {
  if (typeof blocks === "function") return blocks;
  const set = new Set(blocks);
  return (id) => set.has(id);
}

/**
 * Every problem with a pack: its shape and, given the installed blocks, any
 * block it fills that isn't installed. An empty list means it can be installed.
 *
 * @stability Beta
 */
export function contentPackProblems(pack: ContentPackDef, installed?: EnabledBlocks): string[] {
  const at = `content pack ${typeof pack?.id === "string" ? pack.id : "?"}`;
  const problems: string[] = [];
  if (typeof pack?.id !== "string" || !KEBAB.test(pack.id)) problems.push(`${at}: id must be kebab-case`);
  if (typeof pack?.name !== "string" || !pack.name.trim()) problems.push(`${at}: needs a name`);
  if (typeof pack?.version !== "string" || !SEMVER.test(pack.version)) problems.push(`${at}: version "${String(pack?.version)}" isn't semver`);
  if (typeof pack?.publisher !== "string" || !pack.publisher.trim()) problems.push(`${at}: needs a publisher (its package name)`);
  if (!Array.isArray(pack?.requires)) {
    problems.push(`${at}: requires must list the blocks it fills`);
    return problems;
  }
  for (const [label, text] of Object.entries(pack.labels ?? {})) {
    if (!KEY.test(label)) problems.push(`${at}: label key "${label}" is not a key`);
    if (typeof text !== "string" || !text.trim()) problems.push(`${at}: label "${label}" needs display text`);
  }
  problems.push(
    ...keyProblems(`${at}.sessionTypes`, pack.sessionTypes),
    ...keyProblems(`${at}.metricTemplates`, pack.metricTemplates),
    ...keyProblems(`${at}.fieldDefinitions`, pack.fieldDefinitions),
    ...keyProblems(`${at}.forms`, pack.forms),
    ...keyProblems(`${at}.roadmapTemplates`, pack.roadmapTemplates),
  );
  for (const s of pack.sessionTypes ?? []) {
    problems.push(...keyProblems(`${at}.sessionTypes.${s.key}.agenda`, s.agenda));
    for (const item of s.agenda ?? []) {
      if (!(typeof item.minutes === "number" && item.minutes > 0)) problems.push(`${at}.sessionTypes.${s.key}.agenda.${item.key}: minutes must be more than 0`);
    }
  }
  for (const f of pack.fieldDefinitions ?? []) {
    if (!Object.hasOwn(CONTENT_PACK_FIELD_TARGETS, f.target)) problems.push(`${at}.fieldDefinitions.${f.key}: target "${String(f.target)}" isn't one of ${Object.keys(CONTENT_PACK_FIELD_TARGETS).join(", ")}`);
    if (typeof f.field?.type !== "string") problems.push(`${at}.fieldDefinitions.${f.key}: field needs a genesis-forms type`);
    if (!["tenant", "app", "private"].includes(f.visibility)) problems.push(`${at}.fieldDefinitions.${f.key}: visibility must be tenant, app or private`);
  }
  for (const r of pack.roadmapTemplates ?? []) {
    problems.push(...keyProblems(`${at}.roadmapTemplates.${r.key}.items`, r.items));
    const keys = new Set((r.items ?? []).map((i) => i.key));
    for (const item of r.items ?? []) {
      if (item.ref !== undefined && (!keys.has(item.ref) || item.ref === item.key)) {
        problems.push(`${at}.roadmapTemplates.${r.key}.items.${item.key}: ref "${item.ref}" isn't another item in this template`);
      }
    }
  }
  // Every block a section fills must be declared, and (when known) installed.
  const declared = new Set(pack.requires);
  for (const block of contentPackBlocks(pack)) {
    if (!declared.has(block)) problems.push(`${at}: fills the ${block} block but doesn't list it in requires`);
  }
  if (installed !== undefined) {
    const has = test(installed);
    for (const block of pack.requires) if (!has(block)) problems.push(`${at}: needs the ${block} block, which isn't installed`);
  }
  return problems;
}

/**
 * Declare a content pack: returns it unchanged, typed, after checking its
 * shape (throws a {@link ContentPackError} listing every problem). Whether its
 * blocks are installed is checked at install time with
 * {@link contentPackProblems}.
 *
 * ```ts
 * export const weeklyTeamRhythm = defineContentPack({
 *   id: "weekly-team-rhythm", name: "Weekly team rhythm", version: "1.0.0",
 *   publisher: "@marktiderman/genesis-content", requires: ["sessions", "metrics"],
 *   labels: { "pursuit.quarter": "Rocks" },
 *   sessionTypes: [{ key: "weekly", kind: "team", name: "Weekly meeting", agenda: [{ key: "check-in", title: "Check in", minutes: 5 }] }],
 * });
 * ```
 *
 * @stability Beta
 */
export function defineContentPack<const T extends ContentPackDef>(pack: T): T {
  const problems = contentPackProblems(pack);
  if (problems.length) throw new ContentPackError(problems);
  return pack;
}
