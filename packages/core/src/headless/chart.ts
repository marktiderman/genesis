// A chart's data, shaped once for both renderers: the web's ChartContainer (recharts) and the
// phone's NativeChartContainer read series colours, the value axis and the spoken summary here.

/** The two colour schemes a chart's series can name a colour for. */
export type ChartScheme = "light" | "dark";

/**
 * One series of a chart config: its label, and a colour for both schemes (`color`) or one per
 * scheme (`theme`). The web's `ChartConfig` is a record of these.
 */
export interface ChartSeriesConfig<Label = unknown> {
  label?: Label;
  color?: string | undefined;
  theme?: Partial<Record<ChartScheme, string>> | undefined;
}

/** A series' colour in a scheme: its `theme` colour for the scheme, else `color`. */
export function chartSeriesColor(series: Pick<ChartSeriesConfig, "color" | "theme"> | undefined, scheme: ChartScheme): string | undefined {
  return series?.theme?.[scheme] ?? series?.color;
}

/**
 * The design token a colour names, when it is one of the chart tokens: `"var(--chart-2)"`,
 * `"hsl(var(--chart-2))"` and `"chart-2"` are all `"chart-2"`. A literal colour is `undefined`.
 */
export function chartTokenOf(color: string | undefined): `chart-${number}` | undefined {
  // Trimmed and capped first, then one unambiguous pattern: each closing paren takes its own
  // leading spaces, so a long run of whitespace has one way to match and can't backtrack.
  const text = color?.trim();
  if (!text || text.length > 64) return undefined;
  const m = text.match(/^(?:hsl\(\s*)?(?:var\(\s*--)?(chart-\d+)(?:\s*\)){0,2}$/);
  return m ? (m[1] as `chart-${number}`) : undefined;
}

/** The default token for the `index`th series: chart-1 to chart-5, then round again. */
export function defaultChartToken(index: number): `chart-${number}` {
  return `chart-${(index % 5) + 1}`;
}

/** The numbers a row holds for `keys` (a missing or non-numeric value is left out). */
function valuesOf(rows: readonly Record<string, unknown>[], keys: readonly string[]): number[] {
  const out: number[] = [];
  for (const row of rows) for (const key of keys) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Where each row's stack reaches, both ways: its positive values summed upward and its negative
 * ones downward, as a stacked bar draws them (recharts stacks them so too). Values that aren't
 * finite numbers are left out.
 */
function stackedEnds(rows: readonly Record<string, unknown>[], keys: readonly string[]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    let up = 0;
    let down = 0;
    for (const key of keys) {
      const v = row[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v >= 0) up += v;
      else down += v;
    }
    out.push(up, down);
  }
  return out;
}

/**
 * The value axis for `keys` over `rows`: from 0 (or the lowest value, when below 0) to the
 * highest, widened to round ticks.
 */
export function chartDomain(
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
  options: { ticks?: number | undefined; stacked?: boolean | undefined } = {},
): { min: number; max: number; ticks: number[] } {
  const values = options.stacked ? stackedEnds(rows, keys) : valuesOf(rows, keys);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const ticks = niceTicks(low, high, options.ticks ?? 4);
  return { min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 0, ticks };
}

/** Round tick values covering `min` to `max`, about `count` of them (1, 2, 2.5 or 5 times a power of ten apart). */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) return max === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, max)];
  const raw = (max - min) / Math.max(1, count);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((f) => f * power >= raw) ?? 10) * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Where `value` falls on an axis `size` long (0 at `min`, `size` at `max`). */
export function chartPosition(value: number, domain: { min: number; max: number }, size: number): number {
  if (domain.max === domain.min) return 0;
  return ((value - domain.min) / (domain.max - domain.min)) * size;
}

/**
 * What a screen reader hears for a chart, since it can't see the bars: each series and its
 * values, "Visitors: Jan 120, Feb 140. Signups: Jan 12, Feb 18."
 */
export function chartSummary(
  rows: readonly Record<string, unknown>[],
  xKey: string,
  series: readonly { key: string; label: string }[],
  format: (value: number) => string = (v) => String(v),
): string {
  return series
    .map(({ key, label }) => {
      const points = rows
        .filter((row) => typeof row[key] === "number" && Number.isFinite(row[key]))
        .map((row) => `${String(row[xKey] ?? "")} ${format(row[key] as number)}`.trim());
      return `${label}: ${points.join(", ")}.`;
    })
    .join(" ");
}
