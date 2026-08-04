/**
 * <Stack> — vertical layout primitive. Owns the vertical rhythm between its
 * children via a single `gap` design token (no hard-coded spacing). Variant
 * props (`gap` / `align` / `justify`), `className` escape hatch, and children.
 *
 * Tokens only — pure NativeWind v4 className strings, no inline pixel styles.
 *
 * @stability Beta
 */

import { View, type ViewProps } from "react-native";
import { cn } from "../../utils";
import {
  type FlexAlign,
  type FlexJustify,
  alignClasses,
  justifyClasses,
} from "./flex";
import { type SpaceToken, spacingClass } from "./spacing";

export interface StackProps extends ViewProps {
  /** Vertical spacing between children — resolved from the spacing token. */
  gap?: SpaceToken;
  /** Cross-axis (horizontal) alignment of children. */
  align?: FlexAlign;
  /** Main-axis (vertical) distribution of children. */
  justify?: FlexJustify;
}

/**
 * Render a vertical (`flex-col`) `View` with token-driven `gap` + alignment.
 * @stability Beta
 */
function Stack({
  gap = "md",
  align,
  justify,
  className,
  children,
  ...props
}: StackProps) {
  return (
    <View
      className={cn(
        "flex-col",
        spacingClass("gap", gap),
        align && alignClasses[align],
        justify && justifyClasses[justify],
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export { Stack };
