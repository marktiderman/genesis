// A view mapped onto native list pieces, with no React: rows for NativeListItem, sections for
// SectionList, guards as swipe actions, and the form sheet's fields. NativeResourceView and
// useNativeResourceView draw from these, and the tests check them directly.

import type { DataRow } from "@marktiderman/genesis-core";
import type {
  Allowed,
  DisplayHint,
  ResourceView,
  RowPicture,
  RowSummary,
} from "@marktiderman/genesis-core/resource-view";
import { rowPicture } from "@marktiderman/genesis-core/resource-view";
import type { InboxSwipeAction } from "../../layouts/inbox-page";
import { displayText, isEmptyValue } from "./display";
import { fill, type NativeResourceViewMessages } from "./messages";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; the row is what matters here
export type AnyResourceView<T extends Row = Row> = ResourceView<any, T & DataRow>;

/** What one row shows in a NativeListItem. */
export interface NativeResourceRowItem {
  id: string;
  title: string;
  /** `summary(row).subtitle`, the only subtitle: never a raw column. */
  subtitle?: string;
  chips: NonNullable<RowSummary["chips"]>;
  /**
   * `rowPicture(summary)`: an image (passed `isSafeUrl`, with initials to fall back to), initials,
   * or null. On a phone only an http(s) image can load, so any other safe src (a root-relative
   * path) draws its initials instead.
   */
  picture: RowPicture | null;
}

function nativePicture(summary: RowSummary): RowPicture | null {
  const picture = rowPicture(summary);
  if (picture?.kind === "image" && !/^https?:/i.test(picture.src)) {
    return picture.fallback ? { kind: "initials", text: picture.fallback } : null;
  }
  return picture;
}

/**
 * A row as NativeListItem draws it: `view.summary(row)`'s title, subtitle and chips, and nothing
 * else. A view that wants a second line says so in its summary.
 */
export function rowItem<T extends Row>(view: AnyResourceView<T>, row: T): NativeResourceRowItem {
  const summary = view.summary(row as T & DataRow);
  return {
    id: String(row.id ?? summary.title),
    title: summary.title,
    ...(summary.subtitle ? { subtitle: summary.subtitle } : {}),
    chips: summary.chips ?? [],
    picture: nativePicture(summary),
  };
}

export interface NativeResourceSection<T> {
  key: string;
  /** Empty for the one section of an ungrouped view (no header is drawn). */
  title: string;
  data: T[];
}

/**
 * Rows in sections by `definition.groupBy`, in the order each group first appears (the server's
 * sort, so paging never reorders what's on screen). Without `groupBy`, one untitled section.
 */
export function sectionsFor<T extends Row>(
  view: AnyResourceView<T>,
  rows: readonly T[],
  messages: NativeResourceViewMessages,
): NativeResourceSection<T>[] {
  const field = view.definition.groupBy as string | undefined;
  if (!field) return rows.length ? [{ key: "", title: "", data: [...rows] }] : [];
  const display = view.display(field);
  const groups = new Map<string, NativeResourceSection<T>>();
  for (const row of rows) {
    const value = row[field];
    const key = isEmptyValue(value) ? "\u0000" : String(value);
    let group = groups.get(key);
    if (!group) {
      const title = isEmptyValue(value)
        ? fill(messages.list.noGroup, { label: view.label(field).toLowerCase() })
        : displayText(display, value, messages);
      group = { key, title, data: [] };
      groups.set(key, group);
    }
    group.data.push(row);
  }
  return [...groups.values()];
}

/** A row action: InboxPage's swipe action plus an icon name and, when a guard refuses it, why. */
export interface NativeResourceSwipeAction extends InboxSwipeAction {
  /** An icon name from Genesis's set (`edit`, `trash`), mapped per platform. */
  icon?: string;
  /** Set when a guard refuses the action: pressing it explains instead of acting. */
  reason?: string;
}

/** A screen's own rule. It only narrows: `false` hides the action, a sentence shows it refused. */
export type NativeResourceScreenCan<T> = (action: "create" | "update" | "delete", row?: T) => Allowed | boolean;

/** The effective right: the screen's rule AND the view's guard (never OR). */
export function allowed<T extends Row>(
  view: AnyResourceView<T>,
  action: "create" | "update" | "delete",
  row: T | undefined,
  screen?: NativeResourceScreenCan<T>,
): Allowed | false {
  const own = screen?.(action, row);
  if (own === false) return false;
  if (typeof own === "string") return own;
  const guard = action === "create" ? view.can("create") : row ? view.can(action, row as T & DataRow) : true;
  return guard;
}

export interface SwipeActionOptions<T> {
  messages: NativeResourceViewMessages;
  /** The provider moves deleted rows to a recycle bin (`capabilities(resource).softDelete`). */
  softDelete: boolean;
  /** The view has fields a writer may change when editing. */
  editable: boolean;
  screen?: NativeResourceScreenCan<T>;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  /** A refused action was pressed: say why. */
  onRefused: (label: string, reason: string) => void;
}

/**
 * A row's swipe actions, from the view's guards. A refused action stays in the list with its
 * reason, so the person learns why; one the screen turns off (`false`) is left out.
 */
export function swipeActionsFor<T extends Row>(
  view: AnyResourceView<T>,
  row: T,
  options: SwipeActionOptions<T>,
): NativeResourceSwipeAction[] {
  const { messages, softDelete, editable, screen, onEdit, onDelete, onRefused } = options;
  const actions: NativeResourceSwipeAction[] = [];
  const add = (id: string, label: string, icon: string, right: Allowed | false, run: () => void, destructive = false) => {
    if (right === false) return;
    const reason = right === true ? undefined : right;
    actions.push({
      id,
      label,
      icon,
      ...(destructive ? { destructive } : {}),
      ...(reason ? { reason } : {}),
      onPress: reason ? () => onRefused(label, reason) : run,
    });
  };
  if (editable) add("edit", messages.common.edit, "edit", allowed(view, "update", row, screen), () => onEdit(row));
  add(
    "delete",
    softDelete ? messages.bin.action : messages.delete.action,
    "trash",
    allowed(view, "delete", row, screen),
    () => onDelete(row),
    true,
  );
  return actions;
}

/** How a form field is drawn. */
export type NativeFormFieldKind =
  | "text"
  | "email"
  | "url"
  | "number"
  | "textarea"
  | "switch"
  | "segmented"
  | "select"
  | "date"
  | "datetime";

export interface NativeFormField {
  key: string;
  label: string;
  kind: NativeFormFieldKind;
  display: DisplayHint;
  required: boolean;
  /** Shown as text, never as an input, and never sent. */
  readOnly: boolean;
  max?: number;
  options?: { value: string; label: string }[];
  /** The heading it sits under; null for the form's first, untitled group. */
  section: string | null;
  sectionTitle: string | null;
  visible?: (values: Readonly<Record<string, unknown>>) => boolean;
}

/** Choices that fit a segmented control; more go to a list. */
const SEGMENTED_MAX = 4;

function kindFor(display: DisplayHint, options: unknown[] | undefined): NativeFormFieldKind {
  if (options) return options.length <= SEGMENTED_MAX ? "segmented" : "select";
  switch (display) {
    case "boolean":
      return "switch";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "number":
    case "currency":
    case "percent":
      return "number";
    case "longText":
      return "textarea";
    case "email":
      return "email";
    case "url":
    case "image":
      return "url";
    default:
      return "text";
  }
}

/**
 * The form sheet's fields: `view.form(mode)` (which already leaves out JSON, lists, links, scope,
 * sensitive and unreadable fields and server-filled keys), each marked read-only unless
 * `view.writable(mode)` lists it. Copied, never mutated: core caches and freezes `form()`. A create leaves read-only fields out (there is nothing to show yet); an edit shows
 * them as text.
 */
export function formFieldsFor<T extends Row>(view: AnyResourceView<T>, mode: "create" | "edit"): NativeFormField[] {
  const writable = new Set(view.writable(mode));
  return view
    .form(mode)
    // JSON and lists need editors of their own; a plain input would send them back as text (as the web).
    .filter((f) => f.display !== "json" && !f.field.array)
    .filter((f) => mode === "edit" || writable.has(f.field.name))
    .map((f) => {
      const options = f.field.enumValues?.map((value) => ({ value, label: displayText("badge", value, EMPTY_WORDS) }));
      const readOnly = !writable.has(f.field.name);
      return {
        key: f.field.name,
        label: f.label,
        kind: kindFor(f.display, options),
        display: f.display,
        required: !readOnly && f.required,
        readOnly,
        ...(f.max !== undefined ? { max: f.max } : {}),
        ...(options ? { options } : {}),
        section: f.section,
        sectionTitle: f.sectionTitle,
        ...(f.visible ? { visible: f.visible } : {}),
      };
    });
}

// Only `badge` is formatted here, which reads no messages.
const EMPTY_WORDS = { common: { empty: "", yes: "", no: "" } } as NativeResourceViewMessages;

/** Fields shown for these values: a field whose `visible` says no is hidden, and isn't saved. */
export function shownFields(fields: readonly NativeFormField[], values: Readonly<Record<string, unknown>>): NativeFormField[] {
  return fields.filter((f) => !f.visible || f.visible(values));
}

/**
 * What a save sends: only the keys `view.writable(mode)` lists and the form shows. Read-only,
 * generated, key and scope fields, and anything else the values carry (joined columns), never go.
 * An edit passes `dirty`, the fields the person changed, so a save never rewrites the rest. A
 * cleared optional value (an empty text, a cleared number or date) is sent as null.
 */
export function writableValues<T extends Row>(
  view: AnyResourceView<T>,
  mode: "create" | "edit",
  fields: readonly NativeFormField[],
  values: Readonly<Record<string, unknown>>,
  dirty?: ReadonlySet<string>,
): Record<string, unknown> {
  const writable = new Set(view.writable(mode));
  const out: Record<string, unknown> = {};
  for (const field of shownFields(fields, values)) {
    if (field.readOnly || !writable.has(field.key)) continue;
    if (dirty && !dirty.has(field.key)) continue;
    const value = values[field.key];
    out[field.key] = (value === "" || value === undefined) && !field.required ? null : value;
  }
  return out;
}

/** Field errors for a save: required fields with no value, and text over `max`. */
export function validateValues(
  fields: readonly NativeFormField[],
  values: Readonly<Record<string, unknown>>,
  messages: NativeResourceViewMessages,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of shownFields(fields, values)) {
    if (field.readOnly) continue;
    const value = values[field.key];
    if (field.required && field.kind !== "switch" && (isEmptyValue(value) || (typeof value === "string" && !value.trim()))) {
      errors[field.key] = fill(messages.form.required, { label: field.label });
    } else if (field.max !== undefined && typeof value === "string" && value.length > field.max) {
      errors[field.key] = fill(messages.form.tooLong, { label: field.label, max: field.max });
    }
  }
  return errors;
}

/**
 * A refused write in plain words. A provider's `DataWriteError` (a zero-row update or delete it
 * read back: forbidden, gone, a guard's message) already says it plainly; anything else gets the
 * fallback sentence, never a raw driver message.
 */
export function refusalMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === "DataWriteError" && error.message) return error.message;
  return fallback;
}

/** Per-field messages a provider attached to a refused write (`DataWriteError.fields`). */
export function refusalFields(error: unknown): Record<string, string> {
  if (error instanceof Error && error.name === "DataWriteError") {
    const fields = (error as Error & { fields?: Record<string, string> }).fields;
    if (fields) return { ...fields };
  }
  return {};
}
