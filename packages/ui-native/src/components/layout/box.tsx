/**
 * <Box> — the spacing/surface container primitive. Owns padding, margin, and
 * a token-named background. Every spacing prop resolves through a design
 * token (no raw px); `bg` maps to a brand surface token rather than a hex.
 *
 * Variant props (not 30-prop configuration) + a `className` escape hatch.
 * Tokens only — pure NativeWind v4 className strings, no inline pixel styles.
 *
 * @stability Beta
 */

import { View, type ViewProps } from "react-native";
import { cn } from "../../utils";
import { type SpaceToken, spacingClass } from "./spacing";

/**
 * Token-named surfaces — map to the SEMANTIC Genesis surface tokens (never a
 * consumer-specific brand color or raw hex), so any tenant's theme drives the
 * actual color. `surface` = a raised card surface, `canvas` = the page
 * background, `inverse` = the inverted (foreground) surface.
 */
export type BoxBackground = "transparent" | "surface" | "canvas" | "inverse";

const backgroundClasses: Record<BoxBackground, string> = {
  transparent: "bg-transparent",
  surface: "bg-card",
  canvas: "bg-background",
  inverse: "bg-foreground",
};

export interface BoxProps extends ViewProps {
  /** Padding on all sides. */
  p?: SpaceToken;
  /** Horizontal padding (left + right). */
  px?: SpaceToken;
  /** Vertical padding (top + bottom). */
  py?: SpaceToken;
  /** Top padding. */
  pt?: SpaceToken;
  /** Bottom padding. */
  pb?: SpaceToken;
  /** Left padding. */
  pl?: SpaceToken;
  /** Right padding. */
  pr?: SpaceToken;
  /** Margin on all sides. */
  m?: SpaceToken;
  /** Horizontal margin (left + right). */
  mx?: SpaceToken;
  /** Vertical margin (top + bottom). */
  my?: SpaceToken;
  /** Top margin. */
  mt?: SpaceToken;
  /** Bottom margin. */
  mb?: SpaceToken;
  /** Left margin. */
  ml?: SpaceToken;
  /** Right margin. */
  mr?: SpaceToken;
  /** Token-named background surface. */
  bg?: BoxBackground;
}

/**
 * Render a `View` whose padding/margin/background all resolve from tokens.
 * @stability Beta
 */
function Box({
  p,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  m,
  mx,
  my,
  mt,
  mb,
  ml,
  mr,
  bg,
  className,
  children,
  ...props
}: BoxProps) {
  return (
    <View
      className={cn(
        p != null && spacingClass("p", p),
        px != null && spacingClass("px", px),
        py != null && spacingClass("py", py),
        pt != null && spacingClass("pt", pt),
        pb != null && spacingClass("pb", pb),
        pl != null && spacingClass("pl", pl),
        pr != null && spacingClass("pr", pr),
        m != null && spacingClass("m", m),
        mx != null && spacingClass("mx", mx),
        my != null && spacingClass("my", my),
        mt != null && spacingClass("mt", mt),
        mb != null && spacingClass("mb", mb),
        ml != null && spacingClass("ml", ml),
        mr != null && spacingClass("mr", mr),
        bg != null && backgroundClasses[bg],
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export { Box };
