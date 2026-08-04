/**
 * Separator — visual divider line (horizontal or vertical).
 *
 * @stability Stable
 */
import { View, type ViewProps } from "react-native";
import { cn } from "../utils";

export interface NativeSeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
}

function NativeSeparator({
  className,
  orientation = "horizontal",
  ...props
}: NativeSeparatorProps) {
  return (
    <View
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      accessibilityRole="none"
      {...props}
    />
  );
}

export { NativeSeparator };
