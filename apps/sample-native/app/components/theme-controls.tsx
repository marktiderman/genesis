/**
 * <ThemeControls /> — portfolio-wide a11y/theme switcher.
 *
 * Surfaces three controls used across every Phase G showcase screen:
 *
 *   1. Light / Dark / System mode toggle (segmented row).
 *   2. Reduce-motion toggle (switch).
 *   3. Brand selector (today: only `"genesis"`; the contract exists so
 *      consumer brand packages slot in via TS module augmentation on
 *      `BrandRegistry` per the design-system provider contract).
 *
 * Designed to render inline at the top of any Showcase screen so a
 * Maestro tour can flip mode + reduce-motion frame-by-frame and capture
 * deterministic snapshots without leaving the route.
 *
 * @stability stable
 */
import { View } from "react-native";
import {
  NativeText,
  NativeButton,
  NativeSwitch,
  NativeCard,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { usePortfolioTheme, type ThemeMode } from "../lib/theme-context";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeControls({
  compact = false,
  testID = "theme-controls",
}: {
  compact?: boolean;
  testID?: string;
}) {
  const { mode, setMode, reduceMotion, setReduceMotion, brand } =
    usePortfolioTheme();

  return (
    <NativeCard testID={testID}>
      <NativeCardContent>
        <View style={{ gap: 12 }}>
          {!compact ? (
            <NativeText preset="h4">Theme controls</NativeText>
          ) : null}

          <View style={{ gap: 6 }}>
            <NativeText preset="caption" className="text-muted-foreground">
              Color mode
            </NativeText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {MODES.map((m) => (
                <NativeButton
                  key={m.value}
                  size="sm"
                  variant={mode === m.value ? "default" : "outline"}
                  onPress={() => setMode(m.value)}
                  testID={`theme-mode-${m.value}`}
                  className="flex-1"
                >
                  {m.label}
                </NativeButton>
              ))}
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <NativeText preset="body-sm">Reduce motion</NativeText>
              <NativeText preset="caption" className="text-muted-foreground">
                Skip non-essential transitions and parallax.
              </NativeText>
            </View>
            <NativeSwitch
              checked={reduceMotion}
              onCheckedChange={setReduceMotion}
              testID="theme-reduce-motion"
            />
          </View>

          {!compact ? (
            <View style={{ gap: 6 }}>
              <NativeText preset="caption" className="text-muted-foreground">
                Brand
              </NativeText>
              <NativeText preset="body-sm">
                {brand} (only built-in brand today; consumer brand packages
                extend BrandRegistry via TS module augmentation)
              </NativeText>
            </View>
          ) : null}
        </View>
      </NativeCardContent>
    </NativeCard>
  );
}
