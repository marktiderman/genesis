/**
 * The typed sections content packs had before `sections`: session types,
 * metric templates, custom fields, forms and roadmap templates, each tied to a
 * block an app owns. Kept, and still checked as before, so packs written
 * against them keep working. New packs put their data in `sections`, keyed by
 * block id, and the block checks it.
 *
 * Everything here is deprecated and goes in the next major.
 */
import type { ContentPackDef } from "./content-packs";

/**
 * A content pack's settings for one session type, with its agenda.
 * @deprecated Put session types in `sections` under the block that owns them, checked by that block's validator.
 * @stability Beta
 */
export interface ContentPackSessionType {
  key: string;
  kind: string;
  name: string;
  description?: string;
  defaultMinutes?: number;
  agenda: readonly { key: string; title: string; minutes: number }[];
}

/**
 * A metric to start from.
 * @deprecated Put metric templates in `sections` under the block that owns them, checked by that block's validator.
 * @stability Beta
 */
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

/**
 * Where a custom field lives, and the block that owns that table.
 * @deprecated Custom fields belong in `sections` under the block that owns their table.
 * @stability Beta
 */
export const CONTENT_PACK_FIELD_TARGETS = {
  pursuits: "pursuits",
  work_items: "pursuits",
  metrics: "metrics",
  sessions: "sessions",
} as const;

/**
 * @deprecated See {@link CONTENT_PACK_FIELD_TARGETS}.
 * @stability Beta
 */
export type ContentPackFieldTarget = keyof typeof CONTENT_PACK_FIELD_TARGETS;

/**
 * A custom field: a genesis-forms serializable field, on one of the work tables.
 * @deprecated Put field definitions in `sections` under the block that owns their table.
 * @stability Beta
 */
export interface ContentPackFieldDefinition {
  key: string;
  target: ContentPackFieldTarget;
  label: string;
  /** A genesis-forms serializable field: type, options, validation. */
  field: { readonly type: string; readonly [key: string]: unknown };
  required?: boolean;
  visibility: "tenant" | "app" | "private";
}

/**
 * A worksheet, assessment or form: a genesis-forms definition.
 * @deprecated Put forms in `sections` under the block that owns them.
 * @stability Beta
 */
export interface ContentPackForm {
  key: string;
  kind: "worksheet" | "assessment" | "form";
  title: string;
  definition: { readonly [key: string]: unknown };
  scoring?: unknown;
}

/**
 * A roadmap to start from: items that release by a rule, linked to each other by key.
 * @deprecated Put roadmap templates in `sections` under the block that owns them, checked by that block's validator.
 * @stability Beta
 */
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

/** The deprecated typed sections, as optional fields of a pack. */
export interface LegacyContentPackSections {
  /** @deprecated Use `sections`. */
  sessionTypes?: readonly ContentPackSessionType[];
  /** @deprecated Use `sections`. */
  metricTemplates?: readonly ContentPackMetricTemplate[];
  /** @deprecated Use `sections`. */
  fieldDefinitions?: readonly ContentPackFieldDefinition[];
  /** @deprecated Use `sections`. */
  forms?: readonly ContentPackForm[];
  /** @deprecated Use `sections`. */
  roadmapTemplates?: readonly ContentPackRoadmapTemplate[];
}

/** The block each typed section fills. */
const SECTION_BLOCK = { sessionTypes: "sessions", metricTemplates: "metrics", forms: "forms", roadmapTemplates: "roadmap" } as const;

/** The blocks a pack's typed sections need. */
export function legacyContentPackBlocks(pack: ContentPackDef): string[] {
  const needed: string[] = [];
  for (const [section, block] of Object.entries(SECTION_BLOCK)) {
    const items = pack[section as keyof typeof SECTION_BLOCK];
    if (items && items.length) needed.push(block);
  }
  for (const f of pack.fieldDefinitions ?? []) {
    const block = CONTENT_PACK_FIELD_TARGETS[f.target];
    if (block) needed.push(block);
  }
  return needed;
}

/** Every problem with a pack's typed sections, the checks they always had. */
export function legacyContentPackProblems(
  pack: ContentPackDef,
  at: string,
  keyProblems: (where: string, items: readonly unknown[] | undefined) => string[],
): string[] {
  const problems: string[] = [
    ...keyProblems(`${at}.sessionTypes`, pack.sessionTypes),
    ...keyProblems(`${at}.metricTemplates`, pack.metricTemplates),
    ...keyProblems(`${at}.fieldDefinitions`, pack.fieldDefinitions),
    ...keyProblems(`${at}.forms`, pack.forms),
    ...keyProblems(`${at}.roadmapTemplates`, pack.roadmapTemplates),
  ];
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
  return problems;
}
