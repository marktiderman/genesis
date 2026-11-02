"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ViewMode } from "../../patterns/view-toggle";

/**
 * App-wide defaults for every `<ResourceView>` below. A screen's own `mode` (or `defaultView`)
 * still wins, and so does the view a person picks.
 *
 * @stability Beta
 */
export interface ResourceViewDefaults {
  /**
   * How full-page lists (`layout="page"`) open on a phone (below 768px) when the screen doesn't
   * say: `grid` (cards) or `list` (rows). Desktops keep the table. Embedded and compact lists
   * are left alone. Unset, lists open as a table everywhere, as before; `null` turns an outer
   * provider's phone default off for this subtree.
   */
  phoneMode?: Exclude<ViewMode, "table"> | null | undefined;
  /**
   * Clip each table cell's content at its column's edge (one line, with an ellipsis for text),
   * so a long link or email doesn't run over the next column on a narrow table. Inline editors
   * are never clipped. Unset, cells draw as before; `false` turns an outer provider's off.
   */
  clipCells?: boolean | undefined;
  /**
   * Size each table column by what it shows: the record's name column takes the spare width, the
   * others a width for their display (a badge, a number, a date), and the table keeps room for
   * every column, scrolling sideways below that (DataTable `minWidth="auto"`). Unset, columns
   * share the width equally, as before; `false` turns an outer provider's off.
   */
  sizeColumns?: boolean | undefined;
  /**
   * Pagers with first and last page buttons, "Page n of m" in the table's own pager, and "Previous
   * page" / "Next page" as the arrows' names (ResourcePage and DataTable `pagerJumps`). Unset,
   * pagers draw as before; `false` turns an outer provider's off.
   */
  pagerJumps?: boolean | undefined;
}

const ResourceViewDefaultsContext = createContext<ResourceViewDefaults>({});

/**
 * Set list defaults for the whole app, once, near the root:
 *
 * ```tsx
 * <ResourceViewDefaultsProvider phoneMode="grid" clipCells sizeColumns pagerJumps>
 *   <App />
 * </ResourceViewDefaultsProvider>
 * ```
 *
 * Nested providers build on each other: an unset key inherits, and `phoneMode={null}` or
 * `false` for the others turns the outer one off below it.
 *
 * @stability Beta
 */
export function ResourceViewDefaultsProvider({
  children,
  ...defaults
}: ResourceViewDefaults & { children: ReactNode }) {
  const parent = useContext(ResourceViewDefaultsContext);
  // `undefined` inherits; `null` and `false` are answers of their own and switch the parent's off.
  const phoneMode = defaults.phoneMode === undefined ? parent.phoneMode : defaults.phoneMode;
  const clipCells = defaults.clipCells ?? parent.clipCells;
  const sizeColumns = defaults.sizeColumns ?? parent.sizeColumns;
  const pagerJumps = defaults.pagerJumps ?? parent.pagerJumps;
  const value = useMemo(() => ({ phoneMode, clipCells, sizeColumns, pagerJumps }), [phoneMode, clipCells, sizeColumns, pagerJumps]);
  return <ResourceViewDefaultsContext.Provider value={value}>{children}</ResourceViewDefaultsContext.Provider>;
}

/** The list defaults in effect (empty without a provider). */
export function useResourceViewDefaults(): ResourceViewDefaults {
  return useContext(ResourceViewDefaultsContext);
}
