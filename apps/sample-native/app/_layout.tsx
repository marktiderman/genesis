import "../global.css";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { NativeText, NativeButton } from "@marktiderman/genesis-ui-native";
import { GenesisThemeProvider as V1GenesisThemeProvider } from "@marktiderman/genesis-design-system/providers/native";
import {
  GenesisThemeProvider as V2GenesisThemeProvider,
  GENESIS_THEME_V2,
  genesisBrand,
} from "@marktiderman/genesis-design-system";
import { GenesisProvider } from "@marktiderman/genesis-core/provider";
import { PortfolioThemeProvider } from "./lib/theme-context";
import { items, tasks, orders } from "./lib/data";

// PRD-07 A2b: dual-mode unified theme. The v2 provider consumes a full
// CanonicalBrand object; the v1 provider takes a brand-id string. Both
// resolve to the SAME visual output for the OOTB Genesis brand — that
// is the parity we're checking during the dual-mode window.
// GENESIS_BRAND is sourced from the design system (`genesisBrand`) —
// single source of truth, not inlined here (WS-F / audit R1.6).

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-background p-8" style={{ gap: 12 }}>
      <NativeText preset="h3">Something went wrong</NativeText>
      <NativeText preset="body-sm" className="text-muted-foreground text-center">
        {error.message}
      </NativeText>
      <NativeButton variant="outline" onPress={retry}>
        Try Again
      </NativeButton>
    </View>
  );
}

export default function RootLayout() {
  const mock = useMemo(
    () => ({
      datasets: {
        items: items as Record<string, unknown>[],
        tasks: tasks as Record<string, unknown>[],
        orders: orders as Record<string, unknown>[],
      },
    }),
    [],
  );

  const onReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {
      // Safe to ignore — splash screen may already be hidden
    });
  }, []);

  // Dual-mode: the GENESIS_THEME_V2 env flag picks which provider wraps
  // the app. Default OFF preserves v1 behavior; opt-in via
  // `GENESIS_THEME_V2=true` exercises the unified API. PortfolioThemeProvider
  // (Phase G) sits inside the genesis provider so the showcase ThemeControls
  // can adjust local UX without fighting the design-system theme.
  const ThemedRoot = (
    <PortfolioThemeProvider>
      <SafeAreaProvider onLayout={onReady}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </PortfolioThemeProvider>
  );

  return (
    <GenesisProvider mock={mock}>
      {GENESIS_THEME_V2 ? (
        <V2GenesisThemeProvider brand={genesisBrand} mode="light">
          {ThemedRoot}
        </V2GenesisThemeProvider>
      ) : (
        <V1GenesisThemeProvider brand="genesis" mode="light">
          {ThemedRoot}
        </V1GenesisThemeProvider>
      )}
    </GenesisProvider>
  );
}
