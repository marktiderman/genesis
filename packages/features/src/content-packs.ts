/**
 * Content packs: versioned data that fills installed blocks. A pack is code,
 * reviewed like any other: the publishing package exports it, and an installer
 * copies it into a tenant's editable rows, keeping each row's source (pack,
 * version, key) so an update can tell what a person changed.
 *
 * A pack's `sections` are keyed by the block that owns them, and each holds
 * that block's items. Genesis checks what every pack shares (id, version,
 * publisher, requires, labels, and a unique `key` on every item); what an item
 * holds is the block's business, checked by the validator the block registers
 * (`contributes.contentSection` on `defineBlock`, or a `validators` map).
 *
 * `defineContentPack` checks a pack's shape; `contentPackProblems` with the
 * installed blocks also checks that every block it fills is there. Keys, not
 * ids, link things together, and stay the same across versions.
 *
 * No zod here: packs ship to phones with `/blocks`.
 */
import type { BlockDef, EnabledBlocks } from "./blocks";
import {
  legacyContentPackBlocks,
  legacyContentPackProblems,
  type LegacyContentPackSections,
} from "./content-packs-legacy";

export {
  CONTENT_PACK_FIELD_TARGETS,
  type ContentPackFieldDefinition,
  type ContentPackFieldTarget,
  type ContentPackForm,
  type ContentPackMetricTemplate,
  type ContentPackRoadmapTemplate,
  type ContentPackSessionType,
} from "./content-packs-legacy";

/**
 * Checks one section's items for the block that owns it, and returns every
 * problem (an empty list when they're fine). `at` names the section, for
 * messages that point at an item.
 *
 * @stability Beta
 */
export type ContentPackSectionValidator = (items: readonly unknown[], at: string) => readonly string[];

/** A pack's sections: block id → that block's items. @stability Beta */
export type ContentPackSections = Readonly<Record<string, readonly unknown[]>>;

/** One content pack, as its publisher defines it. @stability Beta */
export interface ContentPackDef extends LegacyContentPackSections {
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
  /** Taxonomy: label key → display text, e.g. `"project.phase": "Stage"`. */
  labels?: Readonly<Record<string, string>>;
  /**
   * The data it fills, by block id. Every item has a `key`, unique in its
   * section and the same across versions; the rest is checked by the block's
   * validator.
   */
  sections?: ContentPackSections;
}

/** @stability Beta */
export interface ContentPackCheckOptions {
  /** The installed blocks: every block the pack requires must be one. */
  installed?: EnabledBlocks;
  /** Blocks whose `contributes.contentSection` checks their section's items. */
  blocks?: readonly BlockDef<string, unknown>[];
  /** Section validators by block id; these win over a block's own. */
  validators?: Readonly<Record<string, ContentPackSectionValidator>>;
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

function keyProblems(where: string, items: readonly unknown[] | undefined): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [i, item] of (items ?? []).entries()) {
    const key = (item as { key?: unknown } | null | undefined)?.key;
    if (typeof key !== "string" || !KEY.test(key)) problems.push(`${where}[${i}].key: "${String(key)}" is not a key (lowercase, dots, dashes or underscores)`);
    else if (seen.has(key)) problems.push(`${where}: the key "${key}" is used twice`);
    else seen.add(key);
  }
  return problems;
}

/** The block ids a pack's sections need, whatever it declares. @stability Beta */
export function contentPackBlocks(pack: ContentPackDef): string[] {
  const needed = new Set<string>(legacyContentPackBlocks(pack));
  for (const [block, items] of Object.entries(pack.sections ?? {})) {
    if (Array.isArray(items) && items.length) needed.add(block);
  }
  return [...needed].sort();
}

function test(blocks: EnabledBlocks): (id: string) => boolean {
  if (typeof blocks === "function") return blocks;
  const set = new Set(blocks);
  return (id) => set.has(id);
}

function isEnabledBlocks(value: unknown): value is EnabledBlocks {
  return typeof value === "function" || (typeof value === "object" && value !== null && Symbol.iterator in value);
}

/**
 * Every problem with a pack: its shape, each section's items (through the
 * validator its block registers, when given) and, given the installed blocks,
 * any block it fills that isn't installed. An empty list means it can be
 * installed. The second argument is the installed blocks, or options.
 *
 * @stability Beta
 */
export function contentPackProblems(pack: ContentPackDef, installedOrOptions?: EnabledBlocks | ContentPackCheckOptions): string[] {
  const options: ContentPackCheckOptions = isEnabledBlocks(installedOrOptions) ? { installed: installedOrOptions } : (installedOrOptions ?? {});
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
  const validators: Record<string, ContentPackSectionValidator> = {};
  for (const block of options.blocks ?? []) {
    const validate = block.contributes?.contentSection;
    if (validate) validators[block.id] = validate;
  }
  Object.assign(validators, options.validators);
  for (const [block, items] of Object.entries(pack.sections ?? {})) {
    const where = `${at}.sections.${block}`;
    if (!KEY.test(block)) problems.push(`${where}: "${block}" is not a block id`);
    if (!Array.isArray(items)) {
      problems.push(`${where}: must be a list of items`);
      continue;
    }
    problems.push(...keyProblems(where, items));
    const validate = validators[block];
    if (validate) for (const problem of validate(items, where)) problems.push(`${where}: ${problem}`);
  }
  problems.push(...legacyContentPackProblems(pack, at, keyProblems));
  // Every block a section fills must be declared, and (when known) installed.
  const declared = new Set(pack.requires);
  for (const block of contentPackBlocks(pack)) {
    if (!declared.has(block)) problems.push(`${at}: fills the ${block} block but doesn't list it in requires`);
  }
  if (options.installed !== undefined) {
    const has = test(options.installed);
    for (const block of pack.requires) if (!has(block)) problems.push(`${at}: needs the ${block} block, which isn't installed`);
  }
  return problems;
}

/**
 * Declare a content pack: returns it unchanged, typed, after checking its
 * shape (throws a {@link ContentPackError} listing every problem). Give the
 * blocks it fills, or validators by block id, to check each section's items
 * too. Whether its blocks are installed is checked at install time with
 * {@link contentPackProblems}.
 *
 * ```ts
 * export const weeklyTeamRhythm = defineContentPack({
 *   id: "weekly-team-rhythm", name: "Weekly team rhythm", version: "1.0.0",
 *   publisher: "@acme/content", requires: ["meetings"],
 *   labels: { "project.phase": "Stage" },
 *   sections: { meetings: [{ key: "weekly", name: "Weekly meeting", minutes: 60 }] },
 * }, { blocks: [meetingsBlock] });
 * ```
 *
 * @stability Beta
 */
export function defineContentPack<const T extends ContentPackDef>(pack: T, options?: Omit<ContentPackCheckOptions, "installed">): T {
  const problems = contentPackProblems(pack, { blocks: options?.blocks, validators: options?.validators });
  if (problems.length) throw new ContentPackError(problems);
  return pack;
}
