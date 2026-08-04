/**
 * Progress — determinate horizontal progress indicator.
 *
 * @stability Stable
 */
import { View } from "react-native";
import { cn } from "../utils";

export interface NativeProgressProps {
  className?: string;
  /** Progress value between 0 and 100 */
  value?: number;
  /** Track color class. Defaults to bg-muted */
  trackClassName?: string;
  /** Indicator color class. Defaults to bg-primary */
  indicatorClassName?: string;
  testID?: string;
}

function NativeProgress({
  className,
  value = 0,
  trackClassName,
  indicatorClassName,
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
    >
      <View
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{ width: `${clampedValue}%` }}
      />
    </View>
  );
}

export { NativeProgress };
