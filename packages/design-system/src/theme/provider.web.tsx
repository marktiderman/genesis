/**
 * Web `<GenesisThemeProvider>` — PRD-07 A2b unified theme model.
 *
 * Renders a wrapper element with a `data-theme` attribute that consumer
 * apps' Tailwind v4 CSS uses to scope mode-specific CSS variables.
 *
 * --------------------------------------------------------------------------
 * What this provider DOES NOT do
 * --------------------------------------------------------------------------
 *
 * It does NOT inject CSS variables into the document at runtime. The
 * `tailwindFromBrand()` factory emits the `@theme` block at brand-package
 * build time; the consumer pastes that into `app/styles/tailwind.css`.
 * The provider's only runtime job is the mode-toggle attribute and the
 * `useTheme()` context value.
 *
 * --------------------------------------------------------------------------
 * Mode resolution
 * --------------------------------------------------------------------------
 *
 *   - Controlled: if `mode` prop is passed, the provider uses it as-is
 *     (no internal state); `setMode` warns in dev and is a no-op.
 *   - Uncontrolled: defaults to `"system"`; resolves via
 *     `matchMedia('(prefers-color-scheme: dark)')` and updates on change.
 *
 * Both `mode` (caller intent, may be `"system"`) and `resolvedMode`
 * (OS-resolved `"light" | "dark"`) are surfaced via `useTheme()` so
 * consumers can build 3-state mode selectors that persist intent and
 * still drive tokens off the resolved value.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GenesisThemeContext } from "./context";
import {
  resolveTokens,
  type ResolvedThemeMode,
  type ResolvedTokens,
  type ThemeMode,
  type UseThemeReturn,
} from "./theme";
import type { CanonicalBrand } from "../schema/brand";

export interface GenesisThemeProviderProps {
  /** The brand object to theme this subtree with. */
  brand: CanonicalBrand;
  /**
   * Color mode. Uncontrolled when omitted (defaults to `"system"`); the
   * provider tracks state internally and exposes `setMode` via
   * `useTheme()`.
   *
   * Pass an explicit value to control the mode externally; in that case
   * `setMode` becomes a no-op (with dev-only warning).
   */
  mode?: ThemeMode;
  /**
   * Initial uncontrolled mode (used only when `mode` prop is omitted).
   * Defaults to `"system"`.
   */
  defaultMode?: ThemeMode;
  /**
   * Notified when the resolved mode changes (controlled or uncontrolled).
   */
  onModeChange?: (mode: ResolvedThemeMode) => void;
  children: ReactNode;
}

function resolveSystemMode(): ResolvedThemeMode {
  if (typeof window === "undefined") return "light";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function GenesisThemeProvider({
  brand,
  mode: controlledMode,
  defaultMode = "system",
  onModeChange,
  children,
}: GenesisThemeProviderProps) {
  const isControlled = controlledMode !== undefined;
  const [internalChoice, setInternalChoice] =
    useState<ThemeMode>(defaultMode);

  // The "choice" is what the consumer chose (system | light | dark).
  // The "resolved" is what we render (light | dark).
  const choice: ThemeMode = isControlled
    ? (controlledMode as ThemeMode)
    : internalChoice;

  const [systemResolved, setSystemResolved] = useState<ResolvedThemeMode>(
    resolveSystemMode
  );

  // Listen for system preference changes when in system mode.
  useEffect(() => {
    if (choice !== "system") return;
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemResolved(e.matches ? "dark" : "light");
    };
    // Initial sync (in case choice flipped TO system after mount).
    setSystemResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [choice]);

  const resolvedMode: ResolvedThemeMode =
    choice === "system" ? systemResolved : (choice as ResolvedThemeMode);

  // Notify on resolved-mode change.
  useEffect(() => {
    onModeChange?.(resolvedMode);
  }, [resolvedMode, onModeChange]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      if (isControlled) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn(
            "[GenesisThemeProvider] setMode called while `mode` prop is " +
              "controlled — ignoring. Update the controlled prop instead."
          );
        }
        return;
      }
      setInternalChoice(next);
    },
    [isControlled]
  );

  const tokens: ResolvedTokens = useMemo(
    () => resolveTokens(brand, resolvedMode),
    [brand, resolvedMode]
  );

  const value: UseThemeReturn = useMemo(
    () => ({
      brand,
      mode: choice,
      resolvedMode,
      setMode,
      tokens,
    }),
    [brand, choice, resolvedMode, setMode, tokens]
  );

  return (
    <GenesisThemeContext.Provider value={value}>
      <div data-theme={resolvedMode} style={{ display: "contents" }}>
        {children}
      </div>
    </GenesisThemeContext.Provider>
  );
}
