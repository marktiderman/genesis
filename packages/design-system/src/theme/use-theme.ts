/**
 * `useTheme()` hook — unified theme API (PRD-07 A2b).
 *
 * Returns the same shape on web + native. Throws if called outside a
 * `<GenesisThemeProvider>`.
 *
 * @see ./theme.ts for the return-type definition.
 */

import { useContext } from "react";
import { GenesisThemeContext } from "./context";
import type { UseThemeReturn } from "./theme";

/**
 * Read the active theme from the nearest `<GenesisThemeProvider>`.
 *
 * Returns `{ brand, mode, setMode, tokens }` — same shape on every
 * platform. See `./theme.ts` for the full type.
 */
export function useTheme(): UseThemeReturn {
  const ctx = useContext(GenesisThemeContext);
  if (!ctx) {
    throw new Error(
      "useTheme must be used within a <GenesisThemeProvider>. " +
        "Wrap your app (or the relevant subtree) in the provider exported " +
        "from @marktiderman/genesis-design-system."
    );
  }
  return ctx;
}
