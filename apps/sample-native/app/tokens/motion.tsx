import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
  NativeBadge,
} from "@marktiderman/genesis-ui-native";
import { TokenRow } from "../components/token-row";
import { usePortfolioTheme } from "../lib/theme-context";

/**
 * Motion tokens are not yet codified as a Style-Dictionary export
 * (G-MEGA-1 promotes them; until then this screen documents the
 * canonical scale Genesis primitives are expected to consume,
 * sourced from standards/design-opinions.md).
 */
const DURATION = [
  { name: "instant", ms: 0, note: "no animation" },
  { name: "fast", ms: 120, note: "press feedback, micro-interactions" },
  { name: "default", ms: 200, note: "menus, popovers, toasts" },
  { name: "slow", ms: 320, note: "sheets, drawers, modal entrance" },
] as const;

const EASING = [
  { name: "standard", curve: "(0.2, 0, 0, 1)", note: "default — material standard" },
  { name: "decelerate", curve: "(0, 0, 0.2, 1)", note: "entering content" },
  { name: "accelerate", curve: "(0.4, 0, 1, 1)", note: "exiting content" },
  { name: "linear", curve: "(0, 0, 1, 1)", note: "progress, ticker" },
] as const;

export default function TokensMotion() {
  const { reduceMotion } = usePortfolioTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-motion">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Motion</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Duration + easing tokens. Genesis primitives respect the Reduce
              Motion preference — when on, durations are clamped to 0 and
              non-essential transitions are skipped.
            </NativeText>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <NativeBadge variant={reduceMotion ? "default" : "outline"}>
                {reduceMotion ? "Reduce motion: ON" : "Reduce motion: OFF"}
              </NativeBadge>
            </View>
          </View>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Duration</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {DURATION.map((d) => (
                  <TokenRow
                    key={d.name}
                    name={`duration.${d.name}`}
                    value={`${d.ms}ms · ${d.note}`}
                    sample={
                      <View
                        style={{
                          width: Math.max(8, d.ms / 8),
                          height: 8,
                          backgroundColor: "#3B82F6",
                          borderRadius: 4,
                        }}
                      />
                    }
                    testID={`token-duration-${d.name}`}
                  />
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Easing</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {EASING.map((e) => (
                  <TokenRow
                    key={e.name}
                    name={`easing.${e.name}`}
                    value={`cubic-bezier${e.curve} · ${e.note}`}
                    sample={
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          backgroundColor: "#10B981",
                          borderRadius: 12,
                        }}
                      />
                    }
                    testID={`token-easing-${e.name}`}
                  />
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
