// Numbers a control holds: a number field with steppers, a slider, a range slider. The web's
// NumberInput and RangeSlider and the phone's NativeNumberInput and NativeSlider all clamp, step
// and snap through these, so a value never lands somewhere on one platform it couldn't on the other.

/**
 * `value` kept inside `min` and `max` (either may be left out). `NaN` reads as 0 (then clamped),
 * so a field never shows "NaN". A `min` above `max` is a caller's mistake and throws a RangeError
 * rather than picking one end silently.
 */
export function clampNumber(value: number, min?: number, max?: number): number {
  assertRange(min, max);
  const v = Number.isNaN(value) ? 0 : value;
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

function assertRange(min: number | undefined, max: number | undefined): void {
  if (min !== undefined && max !== undefined && min > max) throw new RangeError(`min (${min}) is greater than max (${max})`);
}

/**
 * `value` on the grid of `step`s counted from `min` (min 1, step 2: 1, 3, 5…), inside `min` and
 * `max`. A step of 0 or less, or one that isn't finite, only clamps.
 */
export function snapToStep(value: number, step: number, min: number, max: number): number {
  const clamped = clampNumber(value, min, max);
  if (!(step > 0) || !Number.isFinite(step)) return clamped;
  const stepped = Math.round((clamped - min) / step) * step + min;
  // Rounding a float step (0.1) leaves 0.30000000000000004: keep the step's decimals.
  const decimals = decimalsOf(step) + decimalsOf(min);
  return clampNumber(Number(stepped.toFixed(Math.min(decimals, 20))), min, max);
}

/** How many decimal places `n` is written with, exponent form included (`1e-7` has 7). */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const [mantissa = "", exponent = "0"] = String(n).split("e");
  const dot = mantissa.indexOf(".");
  const places = dot === -1 ? 0 : mantissa.length - dot - 1;
  return Math.max(0, places - Number(exponent));
}

export interface NumberStepOptions {
  min?: number | undefined;
  max?: number | undefined;
  /** Default 1. */
  step?: number | undefined;
}

/** One press of a stepper: `value` moved by `step` up (`1`) or down (`-1`), kept inside the range. */
export function stepNumber(value: number, direction: 1 | -1, options: NumberStepOptions = {}): number {
  const step = options.step ?? 1;
  const from = Number.isNaN(value) ? 0 : value;
  const next = from + direction * step;
  if (!Number.isFinite(next)) return clampNumber(next, options.min, options.max);
  return clampNumber(Number(next.toFixed(Math.min(decimalsOf(step) + decimalsOf(from), 20))), options.min, options.max);
}

/** Whether a stepper's down (`-1`) or up (`1`) button can move `value`. */
export function canStepNumber(value: number, direction: 1 | -1, options: NumberStepOptions = {}): boolean {
  if (direction === -1) return options.min === undefined || value > options.min;
  return options.max === undefined || value < options.max;
}

export interface ParseNumberOptions {
  /**
   * The locale whose marks the text uses (`"de-DE"`: "1.234,5"). Its group and decimal marks are
   * read from `Intl.NumberFormat`. Without one, the marks are worked out from the text.
   */
  locale?: string | undefined;
}

/**
 * A number as typed: "1.5", "-3", "1,234" and "1,234.5" (commas group thousands), "1,5" and
 * "1.234,5" (a comma as the decimal mark), "1 000" and "1'000". Anything else (an empty field,
 * "abc", "1.2.3", "1 5") is `null`, so the field keeps its value instead of becoming NaN. Only
 * ASCII digits are read ("١٢٣" is `null`).
 *
 * A run of spaces (no-break and narrow ones too) or apostrophes (' and ’) is a group mark, read
 * like any other: only between whole groups of three in the whole part ("1 000,25", "1’234.5";
 * not "1 5" or "12 34,5"), with at most one "," or "." after it as the decimal mark.
 *
 * Without a `locale`, the last of "." and "," is the decimal mark when both appear; a mark that
 * appears more than once groups thousands; one comma followed by exactly three digits groups
 * thousands ("1,234" is 1234), any other single comma is the decimal mark ("1,5", "0,125").
 * Pass `locale` to read the text with that locale's marks instead, as strictly.
 */
export function parseNumberInput(text: string, options: ParseNumberOptions = {}): number | null {
  // No number a person types is this long; capping it keeps every pattern below linear.
  if (text.length > MAX_NUMBER_INPUT * 4) return null;
  // A run of spaces (narrow and no-break ones too) or apostrophes ("1'000", "1’000") is one group
  // mark, written as a single space and checked like "," and ".".
  const t = text.trim().replace(SPACE_LIKE_RUN, SPACE_GROUP);
  if (t.length === 0 || t.length > MAX_NUMBER_INPUT) return null;
  const normalised = options.locale ? withLocaleMarks(t, options.locale) : withGuessedMarks(t);
  // Unambiguous: digits with an optional fraction, or a bare fraction. No nested quantifiers
  // over the same characters, so a long run of digits can't backtrack.
  if (normalised === null || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** The longest text `parseNumberInput` reads; anything longer isn't a number a person typed. */
const MAX_NUMBER_INPUT = 64;

/** Spaces of every width and apostrophes (ASCII and U+2019), in a run: one group mark. */
const SPACE_LIKE_RUN = /[\s'\u2019]+/g;
/** The group mark a space-like run is read as. */
const SPACE_GROUP = " ";

/**
 * `t` (which holds a space-like group mark) with "." as its decimal mark: the spaces only between
 * whole groups of the whole part, and at most one "," or "." after them as the decimal mark.
 */
function withSpaceGroups(t: string): string | null {
  const comma = t.indexOf(",");
  const dot = t.indexOf(".");
  if (comma !== t.lastIndexOf(",") || dot !== t.lastIndexOf(".") || (comma !== -1 && dot !== -1)) return null;
  const at = Math.max(comma, dot);
  const int = at === -1 ? t : t.slice(0, at);
  const fraction = at === -1 ? undefined : t.slice(at + 1);
  if (fraction?.includes(SPACE_GROUP) || !isGrouped(int, SPACE_GROUP)) return null;
  const whole = int.split(SPACE_GROUP).join("");
  return fraction === undefined ? whole : `${whole}.${fraction}`;
}

/** `mark` escaped for a RegExp. */
function escapeMark(mark: string): string {
  return mark.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/**
 * Whether `int` is digits grouped by `mark`, at least one group: in threes ("1,234,567"), or with
 * `lakh` as South Asian locales group them ("12,34,567": threes last, then twos).
 */
function isGrouped(int: string, mark: string, lakh = false): boolean {
  const m = escapeMark(mark);
  if (new RegExp(`^-?\\d{1,3}(?:${m}\\d{3})+$`).test(int)) return true;
  return lakh && new RegExp(`^-?\\d{1,2}(?:${m}\\d{2})*${m}\\d{3}$`).test(int);
}

/** `t` with "." as its only decimal mark and no group marks, or `null` when the marks can't be read. */
function withGuessedMarks(t: string): string | null {
  if (t.includes(SPACE_GROUP)) return withSpaceGroups(t);
  const comma = t.lastIndexOf(",");
  const dot = t.lastIndexOf(".");
  if (comma === -1 && dot === -1) return t;
  if (comma !== -1 && dot !== -1) {
    // Both: the later one is the decimal mark, and the other groups the whole part.
    const [decimal, group] = comma > dot ? ([",", "."] as const) : ([".", ","] as const);
    const at = Math.max(comma, dot);
    const int = t.slice(0, at);
    if (!isGrouped(int, group)) return null;
    return `${int.split(group).join("")}.${t.slice(at + 1)}`;
  }
  const mark = comma !== -1 ? "," : ".";
  const at = comma !== -1 ? comma : dot;
  // The mark more than once: it groups ("1.234.567").
  if (t.indexOf(mark) !== at) return isGrouped(t, mark) ? t.split(mark).join("") : null;
  if (mark === ".") return t;
  // One comma: a group when three digits follow it and it isn't a lone 0 before it ("1,234");
  // otherwise the decimal mark ("1,5", "0,125").
  if (isGrouped(t, ",") && !/^-?0,/.test(t)) return t.replace(",", "");
  return t.replace(",", ".");
}

/**
 * `t` read with `locale`'s marks, as strictly as the guess: the decimal mark at most once, the
 * group mark only in the whole part and only between whole groups ("1,234" in en-US, never
 * "1,5" or "1,2,3"), and no other mark ("1.5" in de-DE is `null`, not 15).
 */
function withLocaleMarks(t: string, locale: string): string | null {
  const { group: localeGroup, decimal, lakh } = numberMarks(locale);
  // The locale's space-like group mark (fr-FR's narrow space, de-CH's apostrophe) reads as a space.
  const group = /^[\s'\u2019]+$/.test(localeGroup) ? SPACE_GROUP : localeGroup;
  // A space groups in any locale, read as strictly; never beside the locale's other group mark.
  if (t.includes(SPACE_GROUP) && group !== SPACE_GROUP) {
    if (group && t.includes(group)) return null;
    return decimal === "." || decimal === "," ? withLocaleSpaceGroups(t, decimal) : null;
  }
  const parts = t.split(decimal);
  if (parts.length > 2) return null;
  const [int = "", fraction] = parts;
  const groupMark = group;
  if (groupMark && fraction?.includes(groupMark)) return null;
  let whole = int;
  if (groupMark && int.includes(groupMark)) {
    if (!isGrouped(int, groupMark, lakh)) return null;
    whole = int.split(groupMark).join("");
  }
  const out = fraction === undefined ? whole : `${whole}.${fraction}`;
  // Anything left that isn't a digit, the sign or the one decimal point is a mark this locale doesn't use.
  return /^-?[\d.]*$/.test(out) && out.indexOf(".") === out.lastIndexOf(".") && (decimal === "." || !int.includes(".") || groupMark === ".") ? out : null;
}

/** `t` grouped by spaces in a locale whose decimal mark is `decimal`: only that mark may follow. */
function withLocaleSpaceGroups(t: string, decimal: "." | ","): string | null {
  const other = decimal === "." ? "," : ".";
  return t.includes(other) ? null : withSpaceGroups(t);
}

function numberMarks(locale: string): { group: string; decimal: string; lakh: boolean } {
  try {
    const format = new Intl.NumberFormat(locale);
    const parts = format.formatToParts(12345.6);
    const group = parts.find((p) => p.type === "group")?.value ?? "";
    // South Asian grouping puts a mark after the first two digits of 1234567 ("12,34,567").
    const lakh = format.formatToParts(1234567).filter((p) => p.type === "integer")[0]?.value.length === 2;
    return { group, decimal: parts.find((p) => p.type === "decimal")?.value ?? ".", lakh };
  } catch {
    return { group: ",", decimal: ".", lakh: false };
  }
}

export interface NumberDraftOptions {
  min?: number | undefined;
  max?: number | undefined;
  /** Decimal places the field keeps. A typed number with more is passed on only when it is committed, rounded. */
  precision?: number | undefined;
  locale?: string | undefined;
}

/**
 * What a number field does with its text as it is typed. `value` is the number it reads (`null`
 * while it isn't one: "", "-", "1."), and `ready` whether to pass it on now: inside `min` and
 * `max`, within `precision`, and not text that may still be a thousands group ("1,2" and "1,23",
 * with no `locale`, may be on the way to "1,234"). Anything not ready is passed on when the field
 * is left, through `commitNumberDraft`, so typing "1" on the way to "15" with `min` 10 never
 * sends 10, and typing "1,234" never sends 1.2.
 */
export function readNumberDraft(text: string, options: NumberDraftOptions = {}): { value: number | null; ready: boolean } {
  const value = parseNumberInput(text, { locale: options.locale });
  if (value === null) return { value, ready: false };
  const mayBeGroup = options.locale === undefined && /^-?[1-9]\d{0,2},\d{1,2}$/.test(text.trim());
  const ready = !mayBeGroup && clampNumber(value, options.min, options.max) === value && roundTo(value, options.precision) === value;
  return { value, ready };
}

/**
 * The number a field keeps when it is left: what's typed, rounded to `precision` and clamped to
 * `min` and `max`, so what is stored is what the field then shows. `null` when the text isn't a number.
 */
export function commitNumberDraft(text: string, options: NumberDraftOptions = {}): number | null {
  const value = parseNumberInput(text, { locale: options.locale });
  if (value === null) return null;
  return clampNumber(roundTo(value, options.precision), options.min, options.max);
}

function roundTo(value: number, precision: number | undefined): number {
  if (precision === undefined || !Number.isFinite(value)) return value;
  const places = Math.max(0, Math.min(20, Math.floor(precision)));
  return Number(value.toFixed(places));
}

/**
 * Where two thumbs of a range slider may go: each snapped, the low one never past the high one.
 * `moving` says which thumb the person moved, so it stops at the other instead of pushing it.
 */
export function clampRange(
  value: readonly [number, number],
  options: { min: number; max: number; step?: number | undefined; moving?: 0 | 1 | undefined },
): [number, number] {
  const step = options.step ?? 1;
  let [low, high] = [snapToStep(value[0], step, options.min, options.max), snapToStep(value[1], step, options.min, options.max)];
  if (low > high) {
    if (options.moving === 1) high = low;
    else low = high;
  }
  return [low, high];
}
