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
   * How lists open on a phone (below 768px) when the screen doesn't say: `grid` (cards) or
   * `list` (rows). Desktops keep the table. Unset, lists open as a table everywhere, as before.
   */
  phoneMode?: Exclude<ViewMode, "table"> | undefined;
}

const ResourceViewDefaultsContext = createContext<ResourceViewDefaults>({});

/**
 * Set list defaults for the whole app, once, near the root:
 *
 * ```tsx
 * <ResourceViewDefaultsProvider phoneMode="grid">
 *   <App />
 * </ResourceViewDefaultsProvider>
 * ```
 *
 * Nested providers build on each other.
 *
 * @stability Beta
 */
export function ResourceViewDefaultsProvider({
  children,
  ...defaults
}: ResourceViewDefaults & { children: ReactNode }) {
  const parent = useContext(ResourceViewDefaultsContext);
  const phoneMode = defaults.phoneMode ?? parent.phoneMode;
  const value = useMemo(() => ({ phoneMode }), [phoneMode]);
  return <ResourceViewDefaultsContext.Provider value={value}>{children}</ResourceViewDefaultsContext.Provider>;
}

/** The list defaults in effect (empty without a provider). */
export function useResourceViewDefaults(): ResourceViewDefaults {
  return useContext(ResourceViewDefaultsContext);
}
