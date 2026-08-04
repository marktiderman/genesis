/**
 * Genesis layout primitives (promoted from the Acme incubator, PRD-46 WC-A4).
 * The keystone the design-system research flags: "layout primitives own all
 * spacing" (Braid rule). Stack / Inline / Box / Grid take all gap/padding/margin
 * from the `spaceScale` design token via `spacingClass()` — composition stays
 * fast and consistent.
 *
 * Static-surface composites (plain RN <View> + NativeWind classes, no native-
 * driver imports), so they are barrel-safe.
 */

export { Stack } from "./stack";
export type { StackProps } from "./stack";

export { Inline } from "./inline";
export type { InlineProps } from "./inline";

export { Box } from "./box";
export type { BoxProps, BoxBackground } from "./box";

export { Grid } from "./grid";
export type { GridProps } from "./grid";

export { spaceScale, spacingClass } from "./spacing";
export type { SpaceToken, SpacingPrefix } from "./spacing";

export type { FlexAlign, FlexJustify } from "./flex";
