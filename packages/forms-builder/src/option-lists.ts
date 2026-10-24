/**
 * Named option lists a host app keeps (a practice's "Locations", "Coaches"): the model, CSV import
 * with a preview, upsert by value, and CSV export. Pure, so an import can be checked on a server
 * too; where a list is stored is the host's business.
 */
import { isHttpsUrl, OPTION_LIMITS, readOption, type ChoiceOption, type HostOptions } from "@marktiderman/genesis-forms";

/** A named list of options, as a host stores it and passes it to forms (`hostOptions`) and the builder. */
export interface OptionList {
  /** What `props.optionsFrom.key` names. Keep it stable: published forms store it. */
  key: string;
  /** The list's name for staff, such as "Locations". */
  label: string;
  /** One line on what it lists. */
  description?: string | undefined;
  options: ChoiceOption[];
}

/** Bounds on an imported list, beyond `OPTION_LIMITS`. */
export const OPTION_LIST_LIMITS = {
  /** Characters in an option's value. */
  value: 200,
  /** Characters in an option's label. */
  label: 200,
  /** Options in one list. */
  options: 5000,
} as const;

/** The lists as `hostOptions` for `createForm`, `<Form>` and `validateSubmission`, by key. */
export function hostOptionsOf(lists: readonly OptionList[]): HostOptions {
  const out: Record<string, readonly ChoiceOption[]> = {};
  for (const list of lists) Object.defineProperty(out, list.key, { value: list.options, enumerable: true });
  return out;
}

/**
 * A value made from a label: lower case, accents dropped, anything but letters and digits as one
 * `-`, at most `OPTION_LIST_LIMITS.value` characters. "Zoë's Gym" becomes "zoes-gym".
 */
export function slugOptionValue(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, OPTION_LIST_LIMITS.value);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Rows of CSV text (RFC 4180: quoted cells may hold commas, quotes as `""` and line breaks), or of
 * tab-separated text, as a spreadsheet copies it: tabs are the separator when the first line has a
 * tab and no comma. A byte order mark is dropped; a blank line is a row of one empty cell, so row
 * numbers match the file's.
 */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const blank = (row: readonly string[]) => row.every((c) => c.trim() === "");

/** One CSV cell: quoted when it holds a comma, a quote, a line break or leading or trailing space. */
function csvCell(text: string): string {
  // A leading =, +, - or @ would run as a formula in a spreadsheet: a quote mark keeps it text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Separates the values of a list attribute in one CSV cell: `riverside|hilltop`. */
export const ATTRIBUTE_VALUE_SEPARATOR = "|";

/** The options as CSV, for a spreadsheet: `value,label,description,image`, then one column per attribute. */
export function optionListCsv(options: readonly ChoiceOption[]): string {
  const names: string[] = [];
  for (const o of options) for (const name of Object.keys(o.attributes ?? {})) if (!names.includes(name)) names.push(name);
  const header = ["value", "label", "description", "image", ...names];
  const lines = [header.map(csvCell).join(",")];
  for (const o of options) {
    const attrs = names.map((n) => {
      const v = o.attributes?.[n];
      return v === undefined ? "" : Array.isArray(v) ? v.join(ATTRIBUTE_VALUE_SEPARATOR) : v;
    });
    lines.push([o.value, o.label ?? "", o.description ?? "", o.image ?? "", ...attrs].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** One row of an import preview. */
export interface ImportRow {
  /** The row's number in the file, counting the header as 1 (a quoted line break doesn't start a new row). */
  line: number;
  /** The option the row makes, when it has no problems. */
  option?: ChoiceOption;
  /** Why the row is left out, in plain words. Empty when it is imported. */
  problems: string[];
}

/** What `parseOptionListCsv` found. */
export interface OptionListImport {
  /** The options to import: the rows without problems, in order. */
  options: ChoiceOption[];
  /** Every row, with its option or its problems, for a preview. */
  rows: ImportRow[];
  /** The attribute columns: every header after value, label, description and image. */
  attributes: string[];
  /** Problems with the whole file, such as no rows or a header without a label column. */
  problems: string[];
}

const KNOWN = ["value", "label", "description", "image"] as const;

/**
 * Read a pasted or uploaded option list. The first row is a header naming `value`, `label`,
 * `description` and `image` (any order, any case); any other column becomes an attribute, its
 * cell split on `|` into a list. A file with only a `label` column (or a headerless single column
 * of names) gets values made from the labels (`slugOptionValue`). Each row is checked: a missing
 * value and label, a value or label over 200 characters, a description over 500, an image that
 * isn't an https:// link, an over-long attribute, and a value already used by an earlier row are
 * reported in `rows` and the row is left out of `options`.
 */
export function parseOptionListCsv(text: string): OptionListImport {
  const all = parseCsvRows(text);
  const out: OptionListImport = { options: [], rows: [], attributes: [], problems: [] };
  const start = all.findIndex((r) => !blank(r));
  if (start < 0) {
    out.problems.push("There are no rows to import.");
    return out;
  }
  const head = all[start]!.map((h) => h.trim());
  const lower = head.map((h) => h.toLowerCase());
  const hasHeader = lower.includes("value") || lower.includes("label");
  let cols: { [K in (typeof KNOWN)[number]]?: number };
  let attributeCols: { name: string; at: number }[] = [];
  let body: string[][];
  let firstLine: number;
  if (hasHeader) {
    cols = {};
    lower.forEach((h, i) => {
      if ((KNOWN as readonly string[]).includes(h) && cols[h as (typeof KNOWN)[number]] === undefined) {
        cols[h as (typeof KNOWN)[number]] = i;
      } else if (head[i]) attributeCols.push({ name: head[i]!, at: i });
    });
    body = all.slice(start + 1);
    firstLine = start + 2;
  } else if (head.length === 1) {
    // A plain list of names, one per line, no header.
    cols = { label: 0 };
    body = all.slice(start);
    firstLine = start + 1;
  } else {
    out.problems.push('The first row must name the columns, with at least "value" or "label".');
    return out;
  }
  const badNames = attributeCols.filter(
    (c) => c.name.length > OPTION_LIMITS.attributeName || c.name in Object.prototype,
  );
  for (const c of badNames) out.problems.push(`The column "${c.name.slice(0, 40)}" can't be an attribute name.`);
  attributeCols = attributeCols.filter((c) => !badNames.includes(c)).slice(0, OPTION_LIMITS.attributes);
  out.attributes = attributeCols.map((c) => c.name);
  if (body.length > OPTION_LIST_LIMITS.options) {
    out.problems.push(`Only the first ${OPTION_LIST_LIMITS.options} rows are read.`);
    body = body.slice(0, OPTION_LIST_LIMITS.options);
  }

  const seen = new Map<string, number>();
  body.forEach((cells, i) => {
    const line = firstLine + i;
    if (blank(cells)) return;
    // A leading quote mark kept a spreadsheet from running the cell as a formula (`optionListCsv`).
    const cell = (at: number | undefined) =>
      at === undefined ? "" : (cells[at] ?? "").trim().replace(/^'(?=[=+\-@])/, "");
    const problems: string[] = [];
    const label = cell(cols.label);
    let value = cell(cols.value);
    if (!value && label) value = slugOptionValue(label);
    if (!value && !label) problems.push("No value or label.");
    else if (!value) problems.push("The label has no letters or digits to make a value from.");
    if (value.length > OPTION_LIST_LIMITS.value) problems.push(`The value is longer than ${OPTION_LIST_LIMITS.value} characters.`);
    if (label.length > OPTION_LIST_LIMITS.label) problems.push(`The label is longer than ${OPTION_LIST_LIMITS.label} characters.`);
    const description = cell(cols.description);
    if (description.length > OPTION_LIMITS.description) {
      problems.push(`The description is longer than ${OPTION_LIMITS.description} characters.`);
    }
    const image = cell(cols.image);
    if (image && !isHttpsUrl(image)) problems.push("The image must be an https:// link.");
    const attributes: Record<string, string | string[]> = {};
    for (const c of attributeCols) {
      const raw = cell(c.at);
      if (!raw) continue;
      const parts = raw.split(ATTRIBUTE_VALUE_SEPARATOR).map((p) => p.trim()).filter(Boolean);
      if (parts.length > OPTION_LIMITS.attributeItems || parts.some((p) => p.length > OPTION_LIMITS.attributeValue)) {
        problems.push(`"${c.name}" holds more than ${OPTION_LIMITS.attributeItems} values or one longer than ${OPTION_LIMITS.attributeValue} characters.`);
        continue;
      }
      if (parts.length) attributes[c.name] = raw.includes(ATTRIBUTE_VALUE_SEPARATOR) ? parts : parts[0]!;
    }
    const earlier = value ? seen.get(value) : undefined;
    if (earlier !== undefined) problems.push(`Same value as line ${earlier}.`);
    else if (value && !problems.length) seen.set(value, line);
    if (problems.length) {
      out.rows.push({ line, problems });
      return;
    }
    const option = readOption({
      value,
      label: label || undefined,
      description: description || undefined,
      image: image || undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
    })!;
    out.rows.push({ line, option, problems });
    out.options.push(option);
  });
  if (!body.some((r) => !blank(r))) out.problems.push("There are no rows under the header.");
  return out;
}

/**
 * The list after an import: an imported option whose value is already in the list replaces its
 * details in place (an empty label, description or image in the import keeps the old one; the
 * imported attributes replace the old ones when it has any), and a new value is added at the end.
 * Nothing is removed. Returns `existing` itself when nothing changes.
 */
export function mergeOptions(existing: readonly ChoiceOption[], imported: readonly ChoiceOption[]): ChoiceOption[] {
  const out = existing.map((o) => ({ ...o }));
  const at = new Map(out.map((o, i) => [o.value, i]));
  let changed = false;
  for (const o of imported) {
    const i = at.get(o.value);
    if (i === undefined) {
      at.set(o.value, out.length);
      out.push({ ...o });
      changed = true;
      continue;
    }
    const before = out[i]!;
    const next: ChoiceOption = { ...before };
    if (o.label) next.label = o.label;
    if (o.description) next.description = o.description;
    if (o.image) next.image = o.image;
    if (o.attributes && Object.keys(o.attributes).length) next.attributes = { ...o.attributes };
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      out[i] = next;
      changed = true;
    }
  }
  return changed ? out : (existing as ChoiceOption[]);
}
