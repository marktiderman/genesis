/**
 * ChartContainer — a bar, line or area chart from rows and a chart config: the twin of
 * genesis-ui's ChartContainer (recharts on the web), with the same `config` (each series' label
 * and its `color`, or a colour per scheme in `theme`).
 *
 * The shaping is genesis-core's (`@marktiderman/genesis-core/headless`): the value axis and its
 * round ticks (`chartDomain`), each series' colour for the scheme (`chartSeriesColor`, with
 * `var(--chart-N)` read as the chart token) and what a screen reader hears (`chartSummary`, every
 * series and its values, since it can't see the bars). Only the drawing is this file's.
 *
 * Bars are views and need nothing installed. Line and area charts draw their lines with
 * react-native-svg, passed once as `GenesisModules.svg`; without it they show their points.
 *
 * @stability Beta
 */
import { useMemo, useState } from "react";
import { Text, View, type ColorValue } from "react-native";
import { nativeThemeDark, nativeThemeLight } from "@marktiderman/genesis-design-system/tokens";
import {
  chartDomain,
  chartPosition,
  chartSeriesColor,
  chartSummary,
  chartTokenOf,
  defaultChartToken,
  type ChartSeriesConfig,
} from "@marktiderman/genesis-core/headless";
import { useThemeMode } from "../hooks/use-theme-mode";
import { useGenesisModules } from "../native-modules";
import { cn } from "../utils";

/** Each series by its key in the rows, as the web's `ChartConfig` (labels are text here). */
export type NativeChartConfig = Record<string, ChartSeriesConfig<string>>;

export interface NativeChartContainerProps {
  config: NativeChartConfig;
  /** The rows: one per point on the x axis. */
  data: readonly Record<string, unknown>[];
  /** The rows' field on the x axis ("month"). */
  xKey: string;
  /** Default `bar`. */
  type?: "bar" | "line" | "area";
  /** Bars on top of each other instead of side by side. */
  stacked?: boolean;
  /** The plot's height in points. Default 200. */
  height?: number;
  /** A legend under the chart. Default true with more than one series. */
  showLegend?: boolean;
  /** Lines at each tick. Default true. */
  showGrid?: boolean;
  /** How values read on the axis and to a screen reader. */
  valueFormat?: (value: number) => string;
  /** What the chart is, said before its values ("Visitors by month"). */
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
}

const AXIS_WIDTH = 36;

/**
 * A config colour the phone can draw. A theme variable the web resolves in CSS (`hsl(var(--primary))`,
 * `var(--success)`) is read from the native theme's hex map; one the theme doesn't have is the
 * foreground, so a series is never drawn in nothing. A plain colour (`#e11d48`, `rgb(…)`, `tomato`)
 * is used as it is.
 */
export function nativeColor(color: string, tokens: Readonly<Record<string, string>>): string | undefined {
  if (!color.includes("var(")) return color;
  // Bounded and with one way to match, so a long string can't make it backtrack.
  const name = /var\(\s*--([a-z0-9-]{1,40})\s*\)/i.exec(color.slice(0, 120))?.[1];
  if (!name) return undefined;
  const key = name.toLowerCase().replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return tokens[key] ?? (key === "primary" ? tokens.primaryText : undefined);
}

export function NativeChartContainer({
  config,
  data,
  xKey,
  type = "bar",
  stacked = false,
  height = 200,
  showLegend,
  showGrid = true,
  valueFormat = (v) => String(v),
  accessibilityLabel,
  className,
  testID = "native-chart",
}: NativeChartContainerProps) {
  const scheme = useThemeMode();
  const { svg } = useGenesisModules();
  const [width, setWidth] = useState(0);
  const keys = Object.keys(config);
  const tokens = scheme === "dark" ? nativeThemeDark : nativeThemeLight;

  const series = useMemo(
    () =>
      keys.map((key, i) => {
        const color = chartSeriesColor(config[key], scheme);
        const token = chartTokenOf(color) ?? (color ? undefined : defaultChartToken(i));
        const hex = token ? (tokens as Record<string, string>)[token.replace("-", "")] : nativeColor(color!, tokens);
        return { key, label: config[key]?.label ?? key, color: (hex ?? tokens.foreground) as ColorValue };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys are config's
    [config, scheme, tokens],
  );
  const domain = useMemo(() => chartDomain(data, keys, { stacked: stacked && type === "bar" }), [data, keys, stacked, type]);
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const y = (v: number) => height - chartPosition(v, domain, height);
  const zero = y(0);
  const summary = chartSummary(data, xKey, series, valueFormat);
  const legend = showLegend ?? series.length > 1;
  const slot = data.length > 0 ? plotWidth / data.length : 0;

  return (
    <View
      testID={testID}
      className={cn("w-full", className)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}. ${summary}` : summary}
    >
      <View className="flex-row" style={{ height }}>
        <View style={{ width: AXIS_WIDTH, height }} importantForAccessibility="no-hide-descendants">
          {domain.ticks.map((t) => (
            <Text key={t} className="absolute right-1 text-[10px] text-muted-foreground" style={{ top: y(t) - 7 }}>
              {valueFormat(t)}
            </Text>
          ))}
        </View>
        <View
          className="flex-1"
          style={{ height }}
          onLayout={(e: { nativeEvent?: { layout?: { width?: number } } }) => setWidth((e.nativeEvent?.layout?.width ?? 0) + AXIS_WIDTH)}
        >
          {showGrid
            ? domain.ticks.map((t) => <View key={t} className="absolute left-0 right-0 h-px bg-border/60" style={{ top: y(t) }} />)
            : null}
          {type === "bar"
            ? data.map((row, i) => (
                <BarGroup key={i} testID={`${testID}-bar-${i}`} row={row} series={series} stacked={stacked} left={i * slot} width={slot} y={y} zero={zero} />
              ))
            : (
              <Lines svg={svg} data={data} series={series} area={type === "area"} slot={slot} width={plotWidth} height={height} y={y} zero={zero} testID={testID} />
            )}
        </View>
      </View>
      <View className="flex-row" style={{ marginLeft: AXIS_WIDTH }} importantForAccessibility="no-hide-descendants">
        {data.map((row, i) => (
          <Text key={i} numberOfLines={1} className="flex-1 text-center text-[10px] text-muted-foreground">
            {String(row[xKey] ?? "")}
          </Text>
        ))}
      </View>
      {legend ? (
        <View className="mt-2 flex-row flex-wrap justify-center gap-3" importantForAccessibility="no-hide-descendants">
          {series.map((s) => (
            <View key={s.key} className="flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <Text className="text-xs text-muted-foreground">{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

type Series = { key: string; label: string; color: ColorValue };

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function BarGroup({ row, series, stacked, left, width, y, zero, testID }: { row: Record<string, unknown>; series: Series[]; stacked: boolean; left: number; width: number; y: (v: number) => number; zero: number; testID: string }) {
  const inner = width * 0.7;
  const pad = (width - inner) / 2;
  if (stacked) {
    let base = 0;
    return (
      <View testID={testID} className="absolute" style={{ left: left + pad, width: inner, top: 0, bottom: 0 }}>
        {series.map((s) => {
          const v = num(row[s.key]);
          const top = y(base + v);
          const bottom = y(base);
          base += v;
          return <View key={s.key} className="absolute left-0 right-0 rounded-sm" style={{ top: Math.min(top, bottom), height: Math.abs(bottom - top), backgroundColor: s.color }} />;
        })}
      </View>
    );
  }
  const bar = inner / Math.max(1, series.length);
  return (
    <View testID={testID} className="absolute" style={{ left: left + pad, width: inner, top: 0, bottom: 0 }}>
      {series.map((s, j) => {
        const top = y(num(row[s.key]));
        return (
          <View
            key={s.key}
            className="absolute rounded-sm"
            style={{ left: j * bar + 1, width: Math.max(1, bar - 2), top: Math.min(top, zero), height: Math.abs(zero - top), backgroundColor: s.color }}
          />
        );
      })}
    </View>
  );
}

function Lines({
  svg,
  data,
  series,
  area,
  slot,
  width,
  height,
  y,
  zero,
  testID,
}: {
  svg: ReturnType<typeof useGenesisModules>["svg"];
  data: readonly Record<string, unknown>[];
  series: Series[];
  area: boolean;
  slot: number;
  width: number;
  height: number;
  y: (v: number) => number;
  zero: number;
  testID: string;
}) {
  const x = (i: number) => i * slot + slot / 2;
  const Root = svg?.Svg ?? svg?.default;
  if (svg && Root && width > 0) {
    const { Path } = svg;
    return (
      <View className="absolute inset-0" pointerEvents="none">
        <Root width={width} height={height} testID={`${testID}-svg`}>
          {series.map((s) => {
            const points = data.map((row, i) => `${x(i).toFixed(1)},${y(num(row[s.key])).toFixed(1)}`);
            const line = `M${points.join(" L")}`;
            return [
              area ? (
                <Path key={`${s.key}-area`} d={`${line} L${x(data.length - 1).toFixed(1)},${zero.toFixed(1)} L${x(0).toFixed(1)},${zero.toFixed(1)} Z`} fill={s.color} fillOpacity={0.2} />
              ) : null,
              <Path key={s.key} d={line} stroke={s.color} strokeWidth={2} fill="none" testID={`${testID}-line-${s.key}`} />,
            ];
          })}
        </Root>
      </View>
    );
  }
  // No SVG module: the points alone.
  return (
    <>
      {series.map((s) =>
        data.map((row, i) => (
          <View
            key={`${s.key}-${i}`}
            testID={`${testID}-point-${s.key}-${i}`}
            className="absolute h-2 w-2 rounded-full"
            style={{ left: x(i) - 4, top: y(num(row[s.key])) - 4, backgroundColor: s.color }}
          />
        )),
      )}
    </>
  );
}
