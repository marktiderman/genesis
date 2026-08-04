/**
 * <Inline> — horizontal layout primitive. Lays children out in a row with a
 * single `gap` design token and optional wrapping. Variant props
 * (`gap` / `align` / `justify` / `wrap`), `className` escape hatch, children.
 *
 * Defaults to vertically-centered items (the common toolbar/row case).
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

export interface InlineProps extends ViewProps {
  /** Horizontal spacing between children — resolved from the spacing token. */
  gap?: SpaceToken;
  /** Cross-axis (vertical) alignment of children. Defaults to `center`. */
  align?: FlexAlign;
  /** Main-axis (horizontal) distribution of children. */
  justify?: FlexJustify;
  /** Allow children to wrap onto multiple rows when they overflow. */
  wrap?: boolean;
}

/**
 * Render a horizontal (`flex-row`) `View` with token-driven `gap`, alignment, and optional wrap.
 * @stability Beta
 */
function Inline({
  gap = "md",
  align = "center",
  justify,
  wrap = false,
  className,
  children,
  ...props
}: InlineProps) {
  return (
    <View
      className={cn(
        "flex-row",
        wrap && "flex-wrap",
        spacingClass("gap", gap),
        alignClasses[align],
        justify && justifyClasses[justify],
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export { Inline };
