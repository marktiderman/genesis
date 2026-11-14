/**
 * ButtonGroup — NativeButtons joined into one control: the twin of genesis-ui's ButtonGroup.
 *
 * Pass NativeButtons as children: the group squares the inner corners and draws them edge to
 * edge, across (`orientation="horizontal"`, the default) or down. For a choice of one value use
 * NativeSegmentedControl; a button group is separate actions that belong together ("Previous",
 * "Next").
 *
 * @stability Beta
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { cn } from "../utils";

export interface NativeButtonGroupProps {
  orientation?: "horizontal" | "vertical";
  /** NativeButtons (or anything taking `className`). */
  children: ReactNode;
  /** What the group is for, read by screen readers ("Pagination"). */
  accessibilityLabel?: string;
  className?: string;
  testID?: string;
}

const CORNERS = {
  horizontal: { first: "rounded-r-none", last: "rounded-l-none", middle: "rounded-none", join: "-ml-px" },
  vertical: { first: "rounded-b-none", last: "rounded-t-none", middle: "rounded-none", join: "-mt-px" },
} as const;

export function NativeButtonGroup({ orientation = "horizontal", children, accessibilityLabel, className, testID }: NativeButtonGroupProps) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ className?: string }>[];
  const c = CORNERS[orientation];
  return (
    <View
      testID={testID ?? "native-button-group"}
      accessibilityRole="toolbar"
      accessibilityLabel={accessibilityLabel}
      className={cn(orientation === "horizontal" ? "flex-row self-start" : "flex-col self-start", className)}
    >
      {items.map((child, i) => {
        if (items.length === 1) return child;
        const first = i === 0;
        const last = i === items.length - 1;
        return cloneElement(child, {
          className: cn(child.props.className, first ? c.first : last ? c.last : c.middle, !first && c.join),
        });
      })}
    </View>
  );
}
