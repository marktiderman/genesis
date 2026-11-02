// A colour per lane, for as many lanes as a calendar has: the theme's five chart tokens first,
// then colours made from them, so the sixth person doesn't share the first person's dot.

const CHART_TOKENS = 5;

const chart = (n: number) => `hsl(var(--chart-${n + 1}))`;
const percent = (p: number) => `${Number(p.toFixed(2))}%`;

/**
 * A distinct CSS colour for lane `index` (0-based), from the theme, in light and dark:
 *
 * - 0–4: the chart tokens, `hsl(var(--chart-1))` to `--chart-5`;
 * - 5–9: the same five deepened toward `--foreground` (35%): darker on a light theme, lighter on
 *   a dark one, so they gain contrast against the background rather than lose it;
 * - 10–49: each chart token blended with another (60/40, in OKLCH), plain then deepened, through
 *   all four partners;
 * - 50 on: the same fifty, a step further toward the foreground each round (never reaching it).
 *
 * The same index always gives the same colour, and no two indexes give the same one. Past a
 * handful, colours alone stop telling lanes apart, which is why a calendar names every lane too.
 *
 * ```tsx
 * const lanes = people.map((p, i) => ({ key: p.id, label: p.name, color: laneColor(i) }));
 * ```
 *
 * @stability Beta
 */
export function laneColor(index: number): string {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  const n = i % CHART_TOKENS;
  const round = Math.floor(i / CHART_TOKENS);
  const partner = Math.floor(round / 2) % CHART_TOKENS;
  const deepened = round % 2 === 1;
  const cycle = Math.floor(round / (2 * CHART_TOKENS));
  const base = partner === 0 ? chart(n) : `color-mix(in oklch, ${chart(n)} 60%, ${chart((n + partner) % CHART_TOKENS)})`;
  // Plain colours stay under 30% foreground and deepened ones between 35% and 50%, each rising
  // with the cycle, so no two indexes meet.
  const toward = deepened ? 35 + (15 * cycle) / (cycle + 1) : (30 * cycle) / (cycle + 1);
  return toward === 0 ? base : `color-mix(in oklch, ${base}, hsl(var(--foreground)) ${percent(toward)})`;
}
