/**
 * Consumer type test for the chart content, compiled against the BUILT package (`dist`,
 * through the package's own `exports`) with `exactOptionalPropertyTypes` on.
 * `pnpm --filter @marktiderman/genesis-ui typecheck` after a build.
 *
 * Locks in that what compiled before the Recharts 3 types still compiles: `<Tooltip>`'s own
 * props passed to the content (they come from the installed Recharts), object-literal payloads
 * with the fields Recharts sets, and Recharts' props spread in. Typos in the chart's own props
 * are still errors. CI installs Recharts 3; the same cases were checked against 2.15.4.
 */
import * as R from "recharts";
import { ChartLegendContent, ChartTooltipContent } from "@marktiderman/genesis-ui/chart";

export const tooltipProps = (
  <>
    <ChartTooltipContent cursor={false} />
    <ChartTooltipContent separator=": " />
    <ChartTooltipContent wrapperStyle={{}} contentStyle={{ padding: 4 }} itemStyle={{}} labelStyle={{}} />
    <ChartTooltipContent wrapperClassName="w" labelClassName="l" />
    <ChartTooltipContent allowEscapeViewBox={{ x: true }} animationDuration={200} isAnimationActive={false} />
    <ChartTooltipContent filterNull offset={10} position={{ x: 1 }} reverseDirection={{ y: true }} shared trigger="click" useTranslate3d includeHidden />
    <ChartTooltipContent itemSorter={(item) => String(item.name)} />
    <ChartTooltipContent hideLabel hideIndicator indicator="line" nameKey="n" labelKey="l" color="red" className="c" />
    <ChartTooltipContent labelFormatter={(label: string, payload) => `${label}${payload.length}`} />
    <ChartTooltipContent formatter={(value, name) => `${value} ${name}`} />
    <ChartTooltipContent formatter={(value, name) => [String(value), name]} />
    <ChartTooltipContent payload={[{ name: "a", value: 1, unit: "kg", dataKey: "a" }]} />
    <ChartTooltipContent payload={[{ name: "a", value: 1, fill: "#f00", stroke: "#0f0", strokeDasharray: "3 3", chartType: "bar", color: "red", type: "none", payload: { x: 1 } }]} />
    <ChartTooltipContent active payload={[]} label="Jan" />
  </>
);

export const legendProps = (
  <>
    <ChartLegendContent payload={[{ value: "a", id: "a", type: "square", color: "red" }]} />
    <ChartLegendContent payload={[{ value: "a", inactive: true, dataKey: "a", legendIcon: <svg />, payload: { strokeDasharray: "1" } }]} verticalAlign="top" hideIcon nameKey="k" />
  </>
);

// Recharts' own props, spread into the content.
export const spreads = (
  <R.LineChart data={[]}>
    <R.Tooltip content={(props) => <ChartTooltipContent {...props} />} />
    <R.Tooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
    <R.Legend content={<ChartLegendContent />} />
  </R.LineChart>
);

// Recharts 2 typed `label` as `any`, so a non-node label still compiles.
export const dateLabel = <ChartTooltipContent label={new Date()} />;

// Our own props are still checked.
// @ts-expect-error a misspelled prop
export const typo = <ChartTooltipContent hideLable />;
// @ts-expect-error a wrong-typed own prop
export const badIndicator = <ChartTooltipContent indicator="square" />;
// @ts-expect-error a misspelled legend prop
export const legendTypo = <ChartLegendContent hideIcn />;
