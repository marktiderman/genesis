// defineRecordPage: one record's screen from a view (docs/RESOURCE-VIEW.md, "RecordPage").
// A header (the row's summary and the view's actions), sections (a child list, a few settings, or
// a slot the screen fills) and readiness checks. Checked once and frozen like defineView, with no
// React, so web and native draw the same screen from it.

import { encodeRecordKey } from "../schema/keys";
import type { Identifier } from "../provider/types";
import { readinessOf, type Readiness } from "../resource";
import type { DataRow, FieldSchema, ResourceContract } from "../schema/types";
import { ViewDefinitionError } from "./define-view";
import type { Viewer } from "../viewer";
import type { Allowed, FieldNameOf, ResolvedFormField, ResourceView, RowOf, ViewTone } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a child list can be any resource
type AnyView = ResourceView<ResourceContract<any>, any>;

/** Equality filters for a child list, sent to the server: `{ brand_id: brand.id }`. `null` is "is empty". */
export type RecordPageFilter = Readonly<Record<string, string | number | boolean | null>>;

interface SectionBase {
  /** Unique in the record page; the screen's route segment or slot key. */
  id: string;
  label: string;
}

/** A child list: another view, filtered by this record. */
export interface RecordPageListSection<Row extends DataRow = DataRow> extends SectionBase {
  list: { view: AnyView; filter: (row: Row) => RecordPageFilter };
  settings?: never;
}

/** A few of this record's own fields, edited in place. Each must be in `view.writable("edit")`. */
export interface RecordPageSettingsSection<Name extends string = string> extends SectionBase {
  settings: readonly Name[];
  list?: never;
}

/** A section the screen fills itself, through a slot keyed by `id`. */
export interface RecordPageSlotSection extends SectionBase {
  list?: never;
  settings?: never;
}

export type RecordPageSection<Row extends DataRow = DataRow, Name extends string = string> =
  | RecordPageListSection<Row>
  | RecordPageSettingsSection<Name>
  | RecordPageSlotSection;

/** One readiness check: "Has a logo", ok or not, and why not. */
export interface RecordPageReadinessItem {
  /** A stable key for the check; default its position and title. */
  id?: string;
  title: string;
  ok: boolean;
  reason?: string;
  /** Genesis chip tones only. Default `success` when ok, `warning` when not. */
  tone?: ViewTone;
}

/** What `defineRecordPage` accepts. */
export interface RecordPageDefinition<C extends ResourceContract, Row extends DataRow = RowOf<C>> {
  /** The view actions the header offers, by name, in order. Default: every view action. */
  header?: { actions?: readonly string[] };
  sections: readonly RecordPageSection<Row, FieldNameOf<C>>[];
  readiness?: (row: Row) => readonly RecordPageReadinessItem[];
}

/** A section as a renderer draws it. */
export type ResolvedRecordPageSection =
  | { readonly id: string; readonly label: string; readonly kind: "list"; readonly view: AnyView }
  | { readonly id: string; readonly label: string; readonly kind: "settings"; readonly settings: readonly string[] }
  | { readonly id: string; readonly label: string; readonly kind: "slot" };

/** A header action with whether this row allows it. */
export interface RecordPageHeaderAction {
  readonly name: string;
  readonly label: string;
  readonly confirm?: string;
  readonly description?: string;
  readonly destructive?: boolean;
  /** `true`, or the view guard's reason. Only narrows what the server allows. */
  readonly allowed: Allowed;
}

/** The header for one row: the view's summary plus the header's actions. */
export interface RecordPageHeader {
  readonly title: string;
  readonly subtitle?: string;
  readonly chips: readonly { label: string; tone?: ViewTone }[];
  readonly actions: readonly RecordPageHeaderAction[];
}

/** What a screen and its provider add to the header: they only narrow the view's guards. */
export interface RecordPageHeaderOptions<Row extends DataRow = DataRow> {
  /** The screen's own rule: `false` hides the action, a sentence refuses it with that reason. */
  can?: (action: string, row: Row) => Allowed | boolean;
  /** Whether anything can run actions here (the screen's `onAction`, or the provider's `runAction`). `false` hides them all. */
  runnable?: boolean;
  /** The action names the provider reports serving (`ResourceSchema.actions`), when it reports them. Others are hidden. */
  served?: readonly string[];
  /** Who is looking (`useViewer()`), for the view's action guards. Without it they get no one. */
  viewer?: Viewer;
}

/** A readiness check with its tone resolved. */
export interface ResolvedReadinessItem {
  /** Stable, for list keys: the check's `id`, or its position and title. */
  readonly key: string;
  readonly title: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly tone: ViewTone;
}

/** What `defineRecordPage` returns: frozen, with pure helpers for the renderers. */
export interface RecordPage<C extends ResourceContract = ResourceContract, Row extends DataRow = RowOf<C>> {
  readonly view: ResourceView<C, Row>;
  readonly sections: readonly ResolvedRecordPageSection[];
  /** The header's action names, in order. */
  readonly headerActions: readonly string[];
  readonly hasReadiness: boolean;
  section(id: string): ResolvedRecordPageSection | undefined;
  /** The record's address for the provider: its key fields (`keyFields`), composite keys encoded. */
  recordId(row: Row): Identifier;
  /**
   * Why settings can't be saved for this row and viewer: the view's `can("update", row, viewer)`
   * reason, or `null` when they can. Renderers then show the settings read-only with the reason.
   * Without a viewer the guard gets no one, so one that needs the viewer locks them.
   */
  settingsLocked(row: Row, viewer?: Viewer): string | null;
  headerFor(row: Row, options?: RecordPageHeaderOptions<Row>): RecordPageHeader;
  /**
   * Settings fields as the view's form resolves them (`view.form("edit")`), in the order listed:
   * one section's, or every settings section's without an id.
   */
  settingsFields(sectionId?: string): readonly ResolvedFormField[];
  /** Only the section's listed keys that `values` has: what a save sends. */
  settingsPatch(sectionId: string, values: Readonly<Record<string, unknown>>): Record<string, unknown>;
  /**
   * A list section's filter for this row. In development, a filter with no key, or a value that
   * isn't a string, number, boolean or null, throws: it would show every child row.
   */
  listFilter(sectionId: string, row: Row): RecordPageFilter;
  /** The readiness checks for this row, tones resolved; empty without `readiness`. */
  readinessFor(row: Row): readonly ResolvedReadinessItem[];
  /**
   * The checks in one chip's terms (genesis-core/resource's `readinessOf`): an unmet `danger`
   * check is a problem, any other unmet check one to look at. `null` without `readiness`. Draw
   * it with `readinessChip`.
   */
  readinessSummary(row: Row): Readiness | null;
}

const WORKSPACE = Symbol.for("genesis.resource-workspace");
/** The reason shown when a guard refuses without one. */
const REFUSED = "This isn't allowed.";
const TONES: ReadonlySet<string> = new Set<ViewTone>(["success", "warning", "danger", "info", "muted"]);
const SECTION_KEYS: ReadonlySet<string> = new Set(["id", "label", "list", "settings"]);
const dev = () => process.env.NODE_ENV !== "production";

/** Why a field can't be a setting edited in place, or null when it can. */
function unsettable(field: FieldSchema | undefined): string | null {
  if (!field) return null;
  const facts = field as FieldSchema & { sensitive?: boolean };
  if (field.type === "json") return "is JSON";
  if (field.array) return "is a list";
  if (field.references || field.type === "relation") return "is a link";
  if (facts.sensitive) return "is sensitive";
  return null;
}

/** Whether a value is a record page (`defineRecordPage`'s result). */
export function isRecordPage(value: unknown): value is RecordPage {
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
 * export const brandRecordPage = defineRecordPage(brandsView, {
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
 * the view doesn't define, a repeated section id, or a section that holds another record page.
 */
export function defineRecordPage<C extends ResourceContract, Row extends DataRow = RowOf<C>>(
  view: ResourceView<C, Row>,
  definition: RecordPageDefinition<C, Row>,
): RecordPage<C, Row> {
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
  const sections: ResolvedRecordPageSection[] = [];
  const filters = new Map<string, (row: Row) => RecordPageFilter>();
  input.forEach((raw, i) => {
    const at = `sections[${i}]`;
    if (!raw || typeof raw !== "object") {
      problems.push(`${at} isn't a section`);
      return;
    }
    const s = raw as RecordPageSection<Row> & Record<string, unknown>;
    const name = typeof s.id === "string" && s.id.trim() ? s.id : undefined;
    if (!name) problems.push(`${at} has no id`);
    else if (ids.has(name)) problems.push(`sections lists "${name}" twice`);
    else ids.add(name);
    const label = `sections.${name ?? i}`;
    if (typeof s.label !== "string" || !s.label.trim()) problems.push(`${label} has no label`);
    if (isRecordPage(s) || "sections" in s || "workspace" in s) {
      problems.push(`${label} holds a workspace; sections don't nest`);
      return;
    }
    const unknown = Object.keys(s).filter((k) => !SECTION_KEYS.has(k));
    if (unknown.length) problems.push(`${label} has ${unknown.map((k) => `"${k}"`).join(", ")}, which isn't a section key (id, label, list, settings)`);
    const hasList = s.list !== undefined;
    const hasSettings = s.settings !== undefined;
    if (hasList && hasSettings) {
      problems.push(`${label} has both list and settings; a section has one`);
      return;
    }
    if (hasList) {
      const list = s.list as { view?: unknown; filter?: unknown };
      if (isRecordPage(list?.view)) problems.push(`${label}.list.view is a workspace; sections don't nest`);
      else if (!isView(list?.view)) problems.push(`${label}.list.view isn't a view`);
      if (typeof list?.filter !== "function") problems.push(`${label}.list.filter isn't a function`);
      if (name && isView(list?.view) && !isRecordPage(list.view) && typeof list.filter === "function") {
        filters.set(name, list.filter as (row: Row) => RecordPageFilter);
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
        const why = unsettable(view.field(field));
        if (why) problems.push(`${label}.settings names "${field}", which ${why}; it needs an editor of its own`);
        else if (!writable.has(field)) problems.push(`${label}.settings names "${field}", which the view can't write on edit`);
        if (settingsSeen.has(field)) problems.push(`settings lists "${field}" twice`);
        settingsSeen.add(field);
      }
      if (name) sections.push(Object.freeze({ id: name, label: s.label, kind: "settings", settings: Object.freeze((s.settings as readonly string[]).map(String)) }));
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

  const headerFor = (row: Row, options: RecordPageHeaderOptions<Row> = {}): RecordPageHeader => {
    const summary = view.summary(row);
    const served = options.served ? new Set(options.served) : null;
    const actions: RecordPageHeaderAction[] = [];
    if (options.runnable !== false) {
      for (const name of headerActions) {
        if (served && !served.has(name)) continue;
        const own = options.can?.(name, row);
        if (own === false) continue;
        // Guards only narrow: the screen's refusal wins, then the view's.
        const allowed: Allowed = typeof own === "string" ? own || REFUSED : view.canAction(name, row, options.viewer);
        actions.push(Object.freeze({ ...actionByName.get(name)!, allowed }));
      }
    }
    return Object.freeze({
      title: summary.title,
      ...(summary.subtitle !== undefined ? { subtitle: summary.subtitle } : {}),
      chips: Object.freeze([...(summary.chips ?? [])]),
      actions: Object.freeze(actions),
    });
  };

  const readinessFor = (row: Row): readonly ResolvedReadinessItem[] => {
    if (!readiness) return Object.freeze([]);
    return Object.freeze(
      readiness(row).map((item, i) => {
        let tone = item.tone ?? (item.ok ? "success" : "warning");
        if (!TONES.has(tone)) {
          if (dev()) console.warn(`[genesis-core] ${where}: readiness "${item.title}" has tone "${String(tone)}", which isn't a chip tone; showing it muted.`);
          tone = "muted";
        }
        return Object.freeze({
          key: item.id ?? `${i}:${item.title}`,
          title: item.title,
          ok: Boolean(item.ok),
          ...(item.reason !== undefined ? { reason: item.reason } : {}),
          tone,
        });
      }),
    );
  };

  const readinessSummary = (row: Row): Readiness | null =>
    readiness
      ? readinessOf(
          readinessFor(row)
            .filter((r) => !r.ok)
            .map((r) => ({ level: r.tone === "danger" ? ("error" as const) : ("warning" as const) })),
        )
      : null;

  return Object.freeze({
    [WORKSPACE]: true,
    view,
    sections: frozenSections,
    headerActions,
    hasReadiness: Boolean(readiness),
    section: (id: string) => byId.get(id),
    recordId: (row: Row) => encodeRecordKey(view.contract, row),
    settingsLocked: (row: Row, viewer?: Viewer) => {
      const allowed = view.can("update", row, viewer);
      return allowed === true ? null : typeof allowed === "string" && allowed.trim() ? allowed : REFUSED;
    },
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
      const out = filter(row);
      if (dev()) {
        const entries = out && typeof out === "object" ? Object.entries(out) : [];
        const bad = entries.filter(([, v]) => !(v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"));
        if (entries.length === 0 || bad.length) {
          throw new ViewDefinitionError(where, [
            entries.length === 0
              ? `sections.${sectionId}.list.filter gave no keys, which would list every row`
              : `sections.${sectionId}.list.filter gives ${bad.map(([k]) => `"${k}"`).join(", ")} no single value`,
          ]);
        }
      }
      return Object.freeze({ ...out });
    },
    readinessFor,
    readinessSummary,
  }) as RecordPage<C, Row>;
}

// The names before record pages were called record pages ("workspace" now means where the viewer
// is working: docs/adr/0004-workspaces.md). Kept for one minor release.

/** @deprecated Renamed `defineRecordPage`. */
export const defineWorkspace = defineRecordPage;
/** @deprecated Renamed `isRecordPage`. */
export const isWorkspace = isRecordPage;
/** @deprecated Renamed `RecordPage`. */
export type ResourceWorkspace<C extends ResourceContract = ResourceContract, Row extends DataRow = RowOf<C>> = RecordPage<C, Row>;
/** @deprecated Renamed `RecordPageDefinition`. */
export type WorkspaceDefinition<C extends ResourceContract, Row extends DataRow = RowOf<C>> = RecordPageDefinition<C, Row>;
/** @deprecated Renamed `RecordPageSection`. */
export type WorkspaceSection<Row extends DataRow = DataRow, Name extends string = string> = RecordPageSection<Row, Name>;
/** @deprecated Renamed `RecordPageHeaderAction`. */
export type WorkspaceHeaderAction = RecordPageHeaderAction;
