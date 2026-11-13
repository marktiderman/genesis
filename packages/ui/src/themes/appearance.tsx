import { useCallback } from "react";
import { useOptionalAppearancePreferences } from "@marktiderman/genesis-core";
import { GenesisThemeProvider, type GenesisThemeProviderProps, type ResolvedThemeMode } from "@marktiderman/genesis-design-system/theme";

export interface AppearanceProviderProps extends GenesisThemeProviderProps {
  /**
   * Also set `.dark` on `<html>` for the appearance showing, as AppShell's toggle does, so
   * Tailwind's `dark:` and portalled menus follow it. Default true.
   */
  syncDocument?: boolean;
}

/**
 * The person's **appearance** (light, dark or system), by its glossary name: `GenesisThemeProvider`
 * fed from the person's appearance preferences. Inside an `AppearancePreferencesProvider`
 * (genesis-core) it shows their appearance in the written order (the app's lock, the person, the
 * organization's default, the theme's) and saves their changes (`useTheme().setMode`) there.
 * Outside one it is `GenesisThemeProvider` as it was, with the same props.
 *
 * @stability Beta
 */
export function AppearanceProvider({ syncDocument = true, onModeChange, ...props }: AppearanceProviderProps) {
  const preferences = useOptionalAppearancePreferences();
  const setAppearance = preferences?.setAppearance;
  const onModeSelect = useCallback(
    (mode: Parameters<NonNullable<GenesisThemeProviderProps["onModeSelect"]>>[0]) => {
      setAppearance?.(mode);
      props.onModeSelect?.(mode);
    },
    [setAppearance, props.onModeSelect],
  );
  const changed = useCallback(
    (mode: ResolvedThemeMode) => {
      if (syncDocument && typeof document !== "undefined") document.documentElement.classList.toggle("dark", mode === "dark");
      onModeChange?.(mode);
    },
    [syncDocument, onModeChange],
  );
  return (
    <GenesisThemeProvider
      {...props}
      {...(preferences ? { mode: preferences.appearance, onModeSelect } : props.onModeSelect ? { onModeSelect } : {})}
      onModeChange={changed}
    />
  );
}
