/**
 * <Grid> — equal-column layout primitive. React Native has no CSS grid, so
 * this composes a row-major grid out of flexbox: children are chunked into
 * rows of `columns`, each row is a `flex-row` whose cells are `flex-1`
 * (equal width). Both the inter-row and inter-column gutters come from one
 * `gap` design token. The final row is padded with empty flex cells so
 * columns stay aligned (a 5th item in a 3-col grid doesn't stretch full-width).
 *
 * Tokens only — pure NativeWind v4 className strings, no inline pixel styles
 * and no percentage-width math that would overflow once gap is applied.
 *
 * @stability Beta
 */

import { Children, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../../utils";
import { type SpaceToken, spacingClass } from "./spacing";

export interface GridProps extends ViewProps {
  /** Number of equal-width columns. Defaults to 2. Floored to >= 1. */
  columns?: number;
  /** Gutter between rows and columns — resolved from the spacing token. */
  gap?: SpaceToken;
}

/** Split `items` into row-major chunks of at most `size` entries each. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * Render an equal-column grid by chunking children into `flex-1` rows with a token gutter.
 * @stability Beta
 */
function Grid({
  columns = 2,
  gap = "md",
  className,
  children,
  ...props
}: GridProps) {
  // Normalize non-finite input (NaN / Infinity) to 1 before chunking — a
  // bad `columns` would otherwise empty the first row or blow up padding.
  const cols = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
  const items = Children.toArray(children);
  const rows = chunk(items, cols);
  const gapClass = spacingClass("gap", gap);

  return (
    <View className={cn("flex-col", gapClass, className)} {...props}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} className={cn("flex-row", gapClass)}>
          {row.map((child, cellIndex) => (
            <View key={`cell-${cellIndex}`} className="flex-1">
              {child as ReactNode}
            </View>
          ))}
          {/* Pad the final short row so columns stay aligned. */}
          {Array.from({ length: cols - row.length }).map((_, padIndex) => (
            <View key={`pad-${padIndex}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

export { Grid };
