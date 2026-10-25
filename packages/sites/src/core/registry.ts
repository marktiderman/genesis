/**
 * Sections: `defineSection` describes one kind of section (its props schema,
 * variants, presets, migrations and server-safe React renderer), and the
 * registry holds every kind a site can use.
 *
 * Modelled on genesis-forms' `registerContentType`: one registry per process,
 * kept on a `Symbol.for` global so two copies of this package (a host's and a
 * dependency's) share it; manifests are frozen; a host adds its own kinds and
 * replaces a built-in only with `{ replace: true }`.
 *
 * Everything the editor needs comes from the definition: `label`,
 * `category`, `variants`, `presets` and `sectionJsonSchema(type)`
 * (`z.toJSONSchema` of the props schema) for its fields and for AI output.
 */
import type { ReactNode } from "react";
import { z } from "zod";
import type { MenuItem, PageKind, SectionNode } from "./schemas";
import type { ResolvedForm } from "./forms";

export const SECTION_CATEGORIES = ["header", "intro", "content", "social-proof", "conversion", "footer"] as const;
export type SectionCategory = (typeof SECTION_CATEGORIES)[number];

/** Where on a page a section may go: the site header, the page body, or the site footer. */
export type SectionPlacement = "header" | "body" | "footer";

export interface SectionVariant {
  id: string;
  label: string;
}

export interface SectionPreset<P = Record<string, unknown>> {
  /** Shown in the editor's Add picker. */
  name: string;
  variant: string;
  props: P;
}

/** What a section's renderer is told about the page it is on. */
export interface RenderContext {
  /**
   * The level of the section's title: 1 for the page's main heading (the
   * first section that `providesH1`), 2 for every other section. Items in a
   * section are one level below it.
   */
  headingLevel: 1 | 2;
  site: {
    name: string;
    lang: string;
    nav: readonly MenuItem[];
    logo?: { src: string; alt: string } | undefined;
  };
  /** The page's own path, such as `/about`. */
  pagePath: string;
  /** A stored link as the page should print it: site paths get the host's base path. */
  href(href: string): string;
  /** Forms on the page, resolved by slug before rendering (null: the host doesn't know the slug). */
  forms: ReadonlyMap<string, ResolvedForm | null>;
  mode: "live" | "preview";
  /** A prefix that makes ids unique on the page: the section node's id. */
  idPrefix: string;
}

export interface SectionRenderProps<P> {
  props: P;
  variant: string;
  node: SectionNode;
  ctx: RenderContext;
}

export interface SectionDefinition<P = Record<string, unknown>> {
  /** The registry key stored in each node: lowercase, such as `hero`. */
  type: string;
  /** The current props version. Nodes at a lower `v` are migrated on read. */
  version: number;
  label: string;
  description?: string;
  category: SectionCategory;
  /** The props schema (zod 4). Its input type is what an editor writes. */
  schema: z.ZodType<P>;
  variants: readonly SectionVariant[];
  defaultVariant: string;
  presets: readonly SectionPreset<z.input<z.ZodType<P>>>[];
  /** At most this many on a page. */
  limit?: number;
  /** The page kinds it may appear on (default: every kind). */
  enabledOn?: readonly PageKind[];
  /** Where it may go (default: the page body). */
  placement?: SectionPlacement;
  /** Its title is the page's `h1` when it comes first (a hero). */
  providesH1?: boolean;
  /**
   * `migrations[n]` turns version `n - 1` props into version `n` props. Pure
   * functions: `migrateNode` runs them in order on read, in the editor and in
   * the renderer, and a publish writes the result into the release.
   */
  migrations?: Readonly<Record<number, (props: Record<string, unknown>) => Record<string, unknown>>>;
  /** Server-safe React: no state, no effects, no browser APIs. */
  render: (input: SectionRenderProps<P>) => ReactNode;
}

/** A definition as the registry holds it: props erased to a record. */
export type AnySectionDefinition = SectionDefinition<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class SectionDefinitionError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid section definition:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "SectionDefinitionError";
  }
}

const TYPE = /^[a-z][a-z0-9-]{0,63}$/;

function definitionProblems(def: AnySectionDefinition): string[] {
  const problems: string[] = [];
  if (!def || typeof def !== "object") return ["a section definition is an object"];
  const at = typeof def.type === "string" ? `"${def.type}"` : "a section";
  if (typeof def.type !== "string" || !TYPE.test(def.type)) problems.push(`${at}: \`type\` is lowercase letters, digits and -`);
  if (!Number.isInteger(def.version) || def.version < 1) problems.push(`${at}: \`version\` is a whole number from 1`);
  if (typeof def.label !== "string" || !def.label.trim()) problems.push(`${at}: needs a \`label\``);
  if (!(SECTION_CATEGORIES as readonly string[]).includes(def.category)) problems.push(`${at}: \`category\` is one of ${SECTION_CATEGORIES.join(", ")}`);
  if (!def.schema || typeof (def.schema as { safeParse?: unknown }).safeParse !== "function") problems.push(`${at}: \`schema\` is a zod schema`);
  if (typeof def.render !== "function") problems.push(`${at}: \`render\` is a function`);
  const ids = new Set<string>();
  if (!Array.isArray(def.variants) || def.variants.length === 0) problems.push(`${at}: needs at least one variant`);
  else
    for (const v of def.variants) {
      if (!v || typeof v.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(v.id) || typeof v.label !== "string") problems.push(`${at}: a variant is { id, label }`);
      else if (ids.has(v.id)) problems.push(`${at}: variant "${v.id}" is listed twice`);
      else ids.add(v.id);
    }
  if (!ids.has(def.defaultVariant)) problems.push(`${at}: \`defaultVariant\` "${String(def.defaultVariant)}" is not one of its variants`);
  if (def.limit !== undefined && (!Number.isInteger(def.limit) || def.limit < 1)) problems.push(`${at}: \`limit\` is a whole number from 1`);
  if (def.placement !== undefined && !["header", "body", "footer"].includes(def.placement)) problems.push(`${at}: \`placement\` is header, body or footer`);
  for (const [key, fn] of Object.entries(def.migrations ?? {})) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 2 || n > def.version) problems.push(`${at}: migration ${key} must be between 2 and the version (${def.version})`);
    if (typeof fn !== "function") problems.push(`${at}: migration ${key} is a function`);
  }
  for (let n = 2; n <= (Number.isInteger(def.version) ? def.version : 0); n++) {
    if (!def.migrations?.[n]) problems.push(`${at}: version ${def.version} needs a migration to ${n}`);
  }
  if (!Array.isArray(def.presets) || def.presets.length === 0) problems.push(`${at}: needs at least one preset (the editor's Add picker)`);
  else if (def.schema && typeof (def.schema as { safeParse?: unknown }).safeParse === "function")
    for (const preset of def.presets) {
      if (!preset || typeof preset.name !== "string" || !ids.has(preset.variant)) {
        problems.push(`${at}: preset ${JSON.stringify(preset?.name)} needs a name and one of its variants`);
        continue;
      }
      const parsed = def.schema.safeParse(preset.props);
      if (!parsed.success) problems.push(`${at}: preset "${preset.name}" doesn't match the schema: ${parsed.error.issues.map((i) => `${i.path.join(".") || "props"} ${i.message}`).join("; ")}`);
    }
  return problems;
}

/**
 * Declare a section kind. Checks the definition (and every preset against its
 * schema) and returns it frozen. It isn't registered until `registerSection`.
 *
 * @stability Beta
 */
export function defineSection<P>(def: SectionDefinition<P>): Readonly<SectionDefinition<P>> {
  const problems = definitionProblems(def as AnySectionDefinition);
  if (problems.length) throw new SectionDefinitionError(problems);
  return Object.freeze({
    ...def,
    variants: Object.freeze(def.variants.map((v) => Object.freeze({ ...v }))),
    presets: Object.freeze(def.presets.map((p) => Object.freeze({ ...p }))),
    ...(def.enabledOn ? { enabledOn: Object.freeze([...def.enabledOn]) } : {}),
    ...(def.migrations ? { migrations: Object.freeze({ ...def.migrations }) } : {}),
  });
}

// ── The registry ────────────────────────────────────────────────────────────

const REGISTRY = Symbol.for("@marktiderman/genesis-sites/sections@1");
const BUILT_IN = Symbol.for("@marktiderman/genesis-sites/built-in-sections@1");
type Scope = typeof globalThis & { [REGISTRY]?: Map<string, AnySectionDefinition>; [BUILT_IN]?: Set<string> };
const scope = globalThis as Scope;
const registry: Map<string, AnySectionDefinition> = (scope[REGISTRY] ??= new Map());
const builtIns: Set<string> = (scope[BUILT_IN] ??= new Set());

/** The built-in section kinds, which a host replaces only with `{ replace: true }`. */
export const BUILT_IN_SECTION_TYPES = Object.freeze([
  "nav",
  "hero",
  "features",
  "cta",
  "testimonials",
  "faq",
  "pricing",
  "logos",
  "stats",
  "gallery",
  "rich-text",
  "form-embed",
  "footer",
] as const);
export type BuiltInSectionType = (typeof BUILT_IN_SECTION_TYPES)[number];

export interface RegisterSectionOptions {
  /** Replace a built-in kind, for every site in this process. */
  replace?: boolean;
}

/**
 * Register a section kind (from `defineSection`, or a plain definition, which
 * is checked the same way). Re-registering a host kind replaces it, so hot
 * reload works; a built-in kind's name throws unless `{ replace: true }`.
 *
 * @stability Beta
 */
export function registerSection(def: AnySectionDefinition, options: RegisterSectionOptions = {}): void {
  const frozen = Object.isFrozen(def) && definitionProblems(def).length === 0 ? def : defineSection(def);
  if ((BUILT_IN_SECTION_TYPES as readonly string[]).includes(frozen.type) && options.replace !== true) {
    throw new Error(
      `registerSection: "${frozen.type}" is a built-in section; pass { replace: true } to replace it for every site in this process.`,
    );
  }
  registry.set(frozen.type, frozen);
}

/** For `@marktiderman/genesis-sites/sections`: register a built-in unless one (or a replacement) is there. @internal */
export function registerBuiltInSection(def: AnySectionDefinition): void {
  if (!registry.has(def.type)) registry.set(def.type, def);
  builtIns.add(def.type);
}

export function getSection(type: string): AnySectionDefinition | undefined {
  return registry.get(type);
}

export function listSections(): AnySectionDefinition[] {
  return [...registry.values()];
}

/** Remove a host section kind (tests, hot reload). Built-ins can't be removed, only replaced. */
export function unregisterSection(type: string): boolean {
  if ((BUILT_IN_SECTION_TYPES as readonly string[]).includes(type)) throw new Error(`unregisterSection: "${type}" is built in; replace it with registerSection(…, { replace: true }).`);
  return registry.delete(type);
}

const jsonSchemas = new WeakMap<object, Record<string, unknown>>();

/**
 * The JSON Schema of a section's props (`z.toJSONSchema`, input side), for the
 * editor's fields and for validating AI output. Refinements (safe URLs) don't
 * appear in JSON Schema; the zod schema still checks them on save.
 *
 * @stability Beta
 */
export function sectionJsonSchema(typeOrDef: string | AnySectionDefinition): Record<string, unknown> {
  const def = typeof typeOrDef === "string" ? registry.get(typeOrDef) : typeOrDef;
  if (!def) throw new Error(`sectionJsonSchema: no section "${String(typeOrDef)}" is registered.`);
  let schema = jsonSchemas.get(def.schema);
  if (!schema) {
    schema = z.toJSONSchema(def.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    jsonSchemas.set(def.schema, schema);
  }
  return schema;
}

/** What the editor's Add picker and fields need about one section kind. */
export interface SectionManifest {
  type: string;
  version: number;
  label: string;
  description?: string;
  category: SectionCategory;
  placement: SectionPlacement;
  variants: readonly SectionVariant[];
  defaultVariant: string;
  presets: readonly SectionPreset[];
  limit?: number;
  enabledOn?: readonly PageKind[];
  jsonSchema: Record<string, unknown>;
}

/** Every registered section as editor data (no renderers): the editor's catalog. @stability Beta */
export function sectionManifests(): SectionManifest[] {
  return listSections().map((def) => ({
    type: def.type,
    version: def.version,
    label: def.label,
    ...(def.description ? { description: def.description } : {}),
    category: def.category,
    placement: def.placement ?? "body",
    variants: def.variants,
    defaultVariant: def.defaultVariant,
    presets: def.presets as readonly SectionPreset[],
    ...(def.limit ? { limit: def.limit } : {}),
    ...(def.enabledOn ? { enabledOn: def.enabledOn } : {}),
    jsonSchema: sectionJsonSchema(def),
  }));
}

let counter = 0;
/** A new section id: short, alphanumeric, unique enough within a page. */
export function newSectionId(prefix = "s"): string {
  counter = (counter + 1) % 1_000_000;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${random}`.slice(0, 64);
}

/** A section node from a preset: the editor's Add, and templates. */
export function nodeFromPreset(type: string, presetName?: string, id = newSectionId(type.replace(/-/g, "").slice(0, 6))): SectionNode {
  const def = registry.get(type);
  if (!def) throw new Error(`nodeFromPreset: no section "${type}" is registered.`);
  const preset = presetName ? def.presets.find((p) => p.name === presetName) : def.presets[0];
  if (!preset) throw new Error(`nodeFromPreset: "${type}" has no preset "${presetName}".`);
  return { id, type, v: def.version, variant: preset.variant, props: structuredClone(preset.props) as Record<string, unknown> };
}
