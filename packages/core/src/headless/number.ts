// Numbers a control holds: a number field with steppers, a slider, a range slider. The web's
// NumberInput and RangeSlider and the phone's NativeNumberInput and NativeSlider all clamp, step
// and snap through these, so a value never lands somewhere on one platform it couldn't on the other.

/** `value` kept inside `min` and `max` (either may be left out). */
export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/**
 * `value` on the grid of `step`s counted from `min` (min 1, step 2: 1, 3, 5…), inside `min` and
 * `max`. A step of 0 or less only clamps.
 */
export function snapToStep(value: number, step: number, min: number, max: number): number {
  const clamped = clampNumber(value, min, max);
  if (!(step > 0)) return clamped;
  const stepped = Math.round((clamped - min) / step) * step + min;
  // Rounding a float step (0.1) leaves 0.30000000000000004: keep the step's decimals.
  const decimals = decimalsOf(step) + decimalsOf(min);
  return clampNumber(Number(stepped.toFixed(Math.min(decimals, 12))), min, max);
}

function decimalsOf(n: number): number {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
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
  const next = value + direction * step;
  return clampNumber(Number(next.toFixed(Math.min(decimalsOf(step) + decimalsOf(value), 12))), options.min, options.max);
}

/** Whether a stepper's down (`-1`) or up (`1`) button can move `value`. */
export function canStepNumber(value: number, direction: 1 | -1, options: NumberStepOptions = {}): boolean {
  if (direction === -1) return options.min === undefined || value > options.min;
  return options.max === undefined || value < options.max;
}

/**
 * A number as typed: "1.5", "1,5" (a comma as the decimal mark), "-3". Anything else (an empty
 * field, "abc", "1.2.3") is `null`, so the field keeps its value instead of becoming NaN.
 */
export function parseNumberInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  // No number a person types is this long; capping it keeps every pattern below linear.
  if (t.length > MAX_NUMBER_INPUT) return null;
  // One comma as the decimal mark ("1,5"). `replace` swaps only the first comma, which is all
  // there is: the pattern allows exactly one.
  const normalised = /^-?\d*,\d+$/.test(t) ? t.replace(",", ".") : t;
  // Unambiguous: digits with an optional fraction, or a bare fraction. No nested quantifiers
  // over the same characters, so a long run of digits can't backtrack.
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** The longest text `parseNumberInput` reads; anything longer isn't a number a person typed. */
const MAX_NUMBER_INPUT = 64;

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

/** Where a value sits on its range, from 0 to 1 (0 when the range is empty). */
export function rangeRatio(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clampNumber((value - min) / (max - min), 0, 1);
}
