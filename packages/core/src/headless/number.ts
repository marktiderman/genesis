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
 * "1.234,5" (a comma as the decimal mark), "1 000". Anything else (an empty field, "abc",
 * "1.2.3") is `null`, so the field keeps its value instead of becoming NaN.
 *
 * Without a `locale`, the last of "." and "," is the decimal mark when both appear; a mark that
 * appears more than once groups thousands; one comma followed by exactly three digits groups
 * thousands ("1,234" is 1234), any other single comma is the decimal mark ("1,5", "0,125").
 * Pass `locale` to read the text with that locale's marks instead.
 */
export function parseNumberInput(text: string, options: ParseNumberOptions = {}): number | null {
  // Spaces (narrow and no-break ones too) and apostrophes ("1'000") only ever group digits.
  const t = text.trim().replace(/[\s']/g, "");
  // No number a person types is this long; capping it keeps every pattern below linear.
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

/** Whether `int` is digits grouped in threes by `mark` ("1,234,567"), at least one group. */
function isGrouped(int: string, mark: "," | "."): boolean {
  return (mark === "," ? /^-?\d{1,3}(?:,\d{3})+$/ : /^-?\d{1,3}(?:\.\d{3})+$/).test(int);
}

/** `t` with "." as its only decimal mark and no group marks, or `null` when the marks can't be read. */
function withGuessedMarks(t: string): string | null {
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

/** `t` read with `locale`'s group and decimal marks. */
function withLocaleMarks(t: string, locale: string): string | null {
  const { group, decimal } = numberMarks(locale);
  let out = t;
  // A space-like group mark was already taken out with the other spaces.
  if (group && !/\s/.test(group)) out = out.split(group).join("");
  if (decimal !== ".") {
    if (out.includes(".")) return null;
    out = out.split(decimal).join(".");
  }
  return out;
}

function numberMarks(locale: string): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
      group: parts.find((p) => p.type === "group")?.value ?? "",
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    };
  } catch {
    return { group: ",", decimal: "." };
  }
}

/**
 * What a number field does with its text. `value` is the number it reads (`null` while it isn't
 * one: "", "-", "1."), and `inRange` whether that number is inside `min` and `max` already. A
 * field passes a number on as it is typed only while it is in range, and clamps when it is left
 * (`clampNumber(value, min, max)`), so typing "1" on the way to "15" with `min` 10 never sends 10.
 */
export function readNumberDraft(
  text: string,
  options: { min?: number | undefined; max?: number | undefined; locale?: string | undefined } = {},
): { value: number | null; inRange: boolean } {
  const value = parseNumberInput(text, { locale: options.locale });
  if (value === null) return { value, inRange: false };
  return { value, inRange: clampNumber(value, options.min, options.max) === value };
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
