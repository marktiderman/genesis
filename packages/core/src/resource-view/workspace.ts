// defineWorkspace: one record's screen from a view (docs/RESOURCE-VIEW.md, "ResourceWorkspace").
// A header (the row's summary and the view's actions), sections (a child list, a few settings, or
// a slot the screen fills) and readiness checks. Checked once and frozen like defineView, with no
// React, so web and native draw the same screen from it.

import type { DataRow, ResourceContract } from "../schema/types";
import { ViewDefinitionError } from "./define-view";
import type { Allowed, FieldNameOf, ResolvedFormField, ResourceView, RowOf, ViewTone } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a child list can be any resource
type AnyView = ResourceView<ResourceContract<any>, any>;

/** Equality filters for a child list, sent to the server: `{ brand_id: brand.id }`. `null` is "is empty". */
export type WorkspaceFilter = Readonly<Record<string, string | number | boolean | null>>;

interface SectionBase {
  /** Unique in the workspace; the screen's route segment or slot key. */
  id: string;
  label: string;
}

/** A child list: another view, filtered by this record. */
export interface WorkspaceListSection<Row extends DataRow = DataRow> extends SectionBase {
  list: { view: AnyView; filter: (row: Row) => WorkspaceFilter };
  settings?: never;
}

/** A few of this record's own fields, edited in place. Each must be in `view.writable("edit")`. */
export interface WorkspaceSettingsSection<Name extends string = string> extends SectionBase {
  settings: readonly Name[];
  list?: never;
}

/** A section the screen fills itself, through a slot keyed by `id`. */
export interface WorkspaceSlotSection extends SectionBase {
  list?: never;
  settings?: never;
}

export type WorkspaceSection<Row extends DataRow = DataRow, Name extends string = string> =
  | WorkspaceListSection<Row>
  | WorkspaceSettingsSection<Name>
  | WorkspaceSlotSection;

/** One readiness check: "Has a logo", ok or not, and why not. */
export interface WorkspaceReadinessItem {
  title: string;
  ok: boolean;
  reason?: string;
  /** Genesis chip tones only. Default `success` when ok, `warning` when not. */
  tone?: ViewTone;
}

/** What `defineWorkspace` accepts. */
export interface WorkspaceDefinition<C extends ResourceContract, Row extends DataRow = RowOf<C>> {
  /** The view actions the header offers, by name, in order. Default: every view action. */
  header?: { actions?: readonly string[] };
  sections: readonly WorkspaceSection<Row, FieldNameOf<C>>[];
  readiness?: (row: Row) => readonly WorkspaceReadinessItem[];
}

/** A section as a renderer draws it. */
export type ResolvedWorkspaceSection =
  | { readonly id: string; readonly label: string; readonly kind: "list"; readonly view: AnyView }
  | { readonly id: string; readonly label: string; readonly kind: "settings"; readonly settings: readonly string[] }
  | { readonly id: string; readonly label: string; readonly kind: "slot" };

/** A header action with whether this row allows it. */
export interface WorkspaceHeaderAction {
  readonly name: string;
  readonly label: string;
  readonly confirm?: string;
  readonly description?: string;
  /** `true`, or the view guard's reason. Only narrows what the server allows. */
  readonly allowed: Allowed;
}

/** The header for one row: the view's summary plus the header's actions. */
export interface WorkspaceHeader {
  readonly title: string;
  readonly subtitle?: string;
  readonly chips: readonly { label: string; tone?: ViewTone }[];
  readonly actions: readonly WorkspaceHeaderAction[];
}

/** A readiness check with its tone resolved. */
export interface ResolvedReadinessItem {
  readonly title: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly tone: ViewTone;
}

/** What `defineWorkspace` returns: frozen, with pure helpers for the renderers. */
export interface ResourceWorkspace<C extends ResourceContract = ResourceContract, Row extends DataRow = RowOf<C>> {
  readonly view: ResourceView<C, Row>;
  readonly sections: readonly ResolvedWorkspaceSection[];
  /** The header's action names, in order. */
  readonly headerActions: readonly string[];
  readonly hasReadiness: boolean;
  section(id: string): ResolvedWorkspaceSection | undefined;
  headerFor(row: Row): WorkspaceHeader;
  /**
   * Settings fields as the view's form resolves them (`view.form("edit")`), in the order listed:
   * one section's, or every settings section's without an id.
   */
  settingsFields(sectionId?: string): readonly ResolvedFormField[];
  /** Only the section's listed keys that `values` has: what a save sends. */
  settingsPatch(sectionId: string, values: Readonly<Record<string, unknown>>): Record<string, unknown>;
  /** A list section's filter for this row. */
  listFilter(sectionId: string, row: Row): WorkspaceFilter;
  /** The readiness checks for this row, tones resolved; empty without `readiness`. */
  readinessFor(row: Row): readonly ResolvedReadinessItem[];
}

const WORKSPACE = Symbol.for("genesis.resource-workspace");
const TONES: ReadonlySet<string> = new Set<ViewTone>(["success", "warning", "danger", "info", "muted"]);

/** Whether a value is a workspace (`defineWorkspace`'s result). */
export function isWorkspace(value: unknown): value is ResourceWorkspace {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[WORKSPACE] === true;
}

function isView(value: unknown): value is AnyView {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AnyView).columns === "function" &&
    typeof (value as AnyView).resource === "string"
  );
}

/**
 * One record's screen from its view:
 *
 * ```ts
 * export const brandWorkspace = defineWorkspace(brandsView, {
 *   header: { actions: ["archive"] },
 *   sections: [
 *     { id: "products", label: "Products", list: { view: productsView, filter: (b) => ({ brand_id: b.id }) } },
 *     { id: "settings", label: "Settings", settings: ["name", "website"] },
 *     { id: "activity", label: "Activity" }, // the screen fills it
 *   ],
 *   readiness: (b) => [{ title: "Has a website", ok: !!b.website, reason: "Add the website." }],
 * });
 * ```
 *
 * Throws {@link ViewDefinitionError} for a settings field the view can't write, a header action
 * the view doesn't define, a repeated section id, or a section that holds another workspace.
 */
export function defineWorkspace<C extends ResourceContract, Row extends DataRow = RowOf<C>>(
  view: ResourceView<C, Row>,
  definition: WorkspaceDefinition<C, Row>,
): ResourceWorkspace<C, Row> {
  const where = `${view.resource} workspace`;
  const problems: string[] = [];
  const writable = new Set(view.writable("edit"));
  const actionNames = new Set(view.actions().map((a) => a.name));

  // ── Sections ─────────────────────────────────────────────────────────
  const input = Array.isArray(definition?.sections) ? definition.sections : [];
  if (!Array.isArray(definition?.sections)) problems.push("sections isn't a list");
  else if (input.length === 0) problems.push("sections is empty");
  const ids = new Set<string>();
  const settingsSeen = new Set<string>();
  const sections: ResolvedWorkspaceSection[] = [];
  const filters = new Map<string, (row: Row) => WorkspaceFilter>();
  input.forEach((raw, i) => {
    const at = `sections[${i}]`;
    if (!raw || typeof raw !== "object") {
      problems.push(`${at} isn't a section`);
      return;
    }
    const s = raw as WorkspaceSection<Row> & Record<string, unknown>;
    const name = typeof s.id === "string" && s.id.trim() ? s.id : undefined;
    if (!name) problems.push(`${at} has no id`);
    else if (ids.has(name)) problems.push(`sections lists "${name}" twice`);
    else ids.add(name);
    const label = `sections.${name ?? i}`;
    if (typeof s.label !== "string" || !s.label.trim()) problems.push(`${label} has no label`);
    if (isWorkspace(s) || "sections" in s || "workspace" in s) {
      problems.push(`${label} holds a workspace; sections don't nest`);
      return;
    }
    const hasList = s.list !== undefined;
    const hasSettings = s.settings !== undefined;
    if (hasList && hasSettings) {
      problems.push(`${label} has both list and settings; a section has one`);
      return;
    }
    if (hasList) {
      const list = s.list as { view?: unknown; filter?: unknown };
      if (isWorkspace(list?.view)) problems.push(`${label}.list.view is a workspace; sections don't nest`);
      else if (!isView(list?.view)) problems.push(`${label}.list.view isn't a view`);
      if (typeof list?.filter !== "function") problems.push(`${label}.list.filter isn't a function`);
      if (name && isView(list?.view) && !isWorkspace(list.view) && typeof list.filter === "function") {
        filters.set(name, list.filter as (row: Row) => WorkspaceFilter);
        sections.push(Object.freeze({ id: name, label: s.label, kind: "list", view: list.view }));
      }
      return;
    }
    if (hasSettings) {
      if (!Array.isArray(s.settings)) {
        problems.push(`${label}.settings isn't a list`);
        return;
      }
      if (s.settings.length === 0) problems.push(`${label}.settings lists no fields`);
      for (const field of s.settings as readonly string[]) {
        if (!writable.has(field)) problems.push(`${label}.settings names "${field}", which the view can't write on edit`);
        if (settingsSeen.has(field)) problems.push(`settings lists "${field}" twice`);
        settingsSeen.add(field);
      }
      if (name) sections.push(Object.freeze({ id: name, label: s.label, kind: "settings", settings: Object.freeze([...s.settings]) }));
      return;
    }
    if (name) sections.push(Object.freeze({ id: name, label: s.label, kind: "slot" }));
  });

  // ── Header and readiness ─────────────────────────────────────────────
  const requested = definition?.header?.actions;
  if (requested !== undefined && !Array.isArray(requested)) problems.push("header.actions isn't a list");
  const headerActions = Object.freeze(
    Array.isArray(requested) ? [...requested] : view.actions().map((a) => a.name),
  );
  const headerSeen = new Set<string>();
  for (const name of headerActions) {
    if (!actionNames.has(name)) problems.push(`header.actions names "${name}", which isn't a view action`);
    if (headerSeen.has(name)) problems.push(`header.actions lists "${name}" twice`);
    headerSeen.add(name);
  }
  if (definition?.readiness !== undefined && typeof definition.readiness !== "function") {
    problems.push("readiness isn't a function");
  }
  if (problems.length) throw new ViewDefinitionError(where, problems);

  const frozenSections = Object.freeze(sections);
  const byId = new Map(frozenSections.map((s) => [s.id, s]));
  const actionByName = new Map(view.actions().map((a) => [a.name, a]));
  const readiness = definition.readiness;

  const settingsOf = (sectionId: string): readonly string[] => {
    const s = byId.get(sectionId);
    if (!s || s.kind !== "settings") throw new ViewDefinitionError(where, [`no settings section "${sectionId}"`]);
    return s.settings;
  };
  const resolvedSettings = new Map<string, readonly ResolvedFormField[]>();
  const settingsFields = (sectionId?: string): readonly ResolvedFormField[] => {
    const key = sectionId ?? "";
    const cached = resolvedSettings.get(key);
    if (cached) return cached;
    const names =
      sectionId === undefined
        ? frozenSections.flatMap((s) => (s.kind === "settings" ? s.settings : []))
        : settingsOf(sectionId);
    const form = new Map(view.form("edit").map((f) => [f.field.name, f]));
    const out = Object.freeze(names.map((n) => form.get(n)).filter((f): f is ResolvedFormField => f !== undefined));
    resolvedSettings.set(key, out);
    return out;
  };

  const headerFor = (row: Row): WorkspaceHeader => {
    const summary = view.summary(row);
    return Object.freeze({
      title: summary.title,
      ...(summary.subtitle !== undefined ? { subtitle: summary.subtitle } : {}),
      chips: Object.freeze([...(summary.chips ?? [])]),
      actions: Object.freeze(
        headerActions.map((name) => Object.freeze({ ...actionByName.get(name)!, allowed: view.canAction(name, row) })),
      ),
    });
  };

  const readinessFor = (row: Row): readonly ResolvedReadinessItem[] => {
    if (!readiness) return Object.freeze([]);
    const items = readiness(row);
    const bad = items.filter((item) => item.tone !== undefined && !TONES.has(item.tone));
    if (bad.length) {
      throw new ViewDefinitionError(where, bad.map((item) => `readiness "${item.title}" has tone "${String(item.tone)}", which isn't a chip tone`));
    }
    return Object.freeze(
      items.map((item) =>
        Object.freeze({
          title: item.title,
          ok: Boolean(item.ok),
          ...(item.reason !== undefined ? { reason: item.reason } : {}),
          tone: item.tone ?? (item.ok ? "success" : "warning"),
        }),
      ),
    );
  };

  return Object.freeze({
    [WORKSPACE]: true,
    view,
    sections: frozenSections,
    headerActions,
    hasReadiness: Boolean(readiness),
    section: (id: string) => byId.get(id),
    headerFor,
    settingsFields,
    settingsPatch: (sectionId: string, values: Readonly<Record<string, unknown>>) => {
      const patch: Record<string, unknown> = {};
      for (const name of settingsOf(sectionId)) if (Object.hasOwn(values, name)) patch[name] = values[name];
      return patch;
    },
    listFilter: (sectionId: string, row: Row) => {
      const filter = filters.get(sectionId);
      if (!filter) throw new ViewDefinitionError(where, [`no list section "${sectionId}"`]);
      return Object.freeze({ ...filter(row) });
    },
    readinessFor,
  }) as ResourceWorkspace<C, Row>;
}
