/**
 * Progress — determinate horizontal progress indicator.
 *
 * The fill is `bg-primary` and the track `bg-muted`. `indicatorColor` and
 * `trackColor` take a colour value (a theme role from `useThemeRoles`, a
 * brand's tint) for a package or screen that styles without NativeWind
 * classes; they win over the class props.
 *
 * @stability Stable
 */
import { View, type ColorValue, type ViewStyle } from "react-native";
import { cn } from "../utils";

export interface NativeProgressProps {
  className?: string;
  /** Progress value between 0 and 100 */
  value?: number;
  /** Track color class. Defaults to bg-muted */
  trackClassName?: string;
  /** Indicator color class. Defaults to bg-primary */
  indicatorClassName?: string;
  /** The fill's colour as a value (a theme role, a brand tint); wins over `indicatorClassName`. */
  indicatorColor?: ColorValue;
  /** The track's colour as a value; wins over `trackClassName`. */
  trackColor?: ColorValue;
  /** Track style, for colors from a theme object rather than classes. Wins over the classes. */
  style?: ViewStyle;
  /** Indicator style, for colors from a theme object rather than classes. Wins over the classes. */
  indicatorStyle?: ViewStyle;
  testID?: string;
}

function NativeProgress({
  className,
  value = 0,
  trackClassName,
  indicatorClassName,
  indicatorColor,
  trackColor,
  style,
  indicatorStyle,
  ...props
}: NativeProgressProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const clampedValue = Math.min(100, Math.max(0, safeValue));

  return (
    <View
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        trackClassName,
        className
      )}
      accessibilityRole="progressbar"
      accessibilityLabel={`${clampedValue}% complete`}
      accessibilityValue={{ min: 0, max: 100, now: clampedValue }}
      {...props}
      style={{ ...style, ...(trackColor === undefined ? {} : { backgroundColor: trackColor }) }}
    >
      <View
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{
          ...indicatorStyle,
          width: `${clampedValue}%`,
          ...(indicatorColor === undefined ? {} : { backgroundColor: indicatorColor }),
        }}
      />
    </View>
  );
}

export { NativeProgress };
