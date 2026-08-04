import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { useGenesisTheme } from "@marktiderman/genesis-design-system/providers/native";

const PRESETS: { preset: "h1" | "h2" | "h3" | "h4" | "body" | "body-sm" | "caption" | "label"; sample: string }[] = [
  { preset: "h1", sample: "Heading 1" },
  { preset: "h2", sample: "Heading 2" },
  { preset: "h3", sample: "Heading 3" },
  { preset: "h4", sample: "Heading 4" },
  { preset: "body", sample: "Body text in the active mode at the default weight" },
  { preset: "body-sm", sample: "Body small for dense content" },
  { preset: "label", sample: "Form label" },
  { preset: "caption", sample: "Caption — fine print, footnotes, secondary metadata" },
];

export default function TokensTypography() {
  const theme = useGenesisTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-typography">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Typography</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              NativeText presets, font families, sizes, and weights resolved
              from @marktiderman/genesis-design-system tokens.
            </NativeText>
          </View>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Presets</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 12 }}>
                {PRESETS.map(({ preset, sample }) => {
                  const meta = theme.typography[preset as keyof typeof theme.typography] ??
                    theme.typography.body;
                  return (
                    <View
                      key={preset}
                      style={{ gap: 4 }}
                      testID={`token-typography-${preset}`}
                    >
                      <NativeText preset={preset}>{sample}</NativeText>
                      <NativeText
                        preset="caption"
                        className="text-muted-foreground"
                      >
                        {preset} · {meta.fontSize}/{meta.lineHeight} · weight{" "}
                        {meta.fontWeight}
                      </NativeText>
                    </View>
                  );
                })}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Font sizes</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                {Object.entries(theme.fontSize).map(([key, px]) => (
                  <View
                    key={key}
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: 12,
                    }}
                    testID={`token-fontSize-${key}`}
                  >
                    <NativeText preset="caption" className="text-muted-foreground" style={{ width: 56 }}>
                      {key}
                    </NativeText>
                    <NativeText preset="body" style={{ fontSize: px }}>
                      {px}px Aa
                    </NativeText>
                  </View>
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Font weights</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 6 }}>
                {Object.entries(theme.fontWeight).map(([key, weight]) => (
                  <View
                    key={key}
                    style={{ flexDirection: "row", gap: 12, alignItems: "baseline" }}
                    testID={`token-fontWeight-${key}`}
                  >
                    <NativeText preset="caption" className="text-muted-foreground" style={{ width: 96 }}>
                      {key} ({weight})
                    </NativeText>
                    <NativeText preset="body" style={{ fontWeight: String(weight) as "400" | "500" | "600" | "700" }}>
                      The quick brown fox
                    </NativeText>
                  </View>
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Font families</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                {Object.entries(theme.fontFamily).map(([key, family]) => (
                  <View key={key} style={{ gap: 2 }} testID={`token-fontFamily-${key}`}>
                    <NativeText preset="body-sm">{key}</NativeText>
                    <NativeText
                      preset="caption"
                      className="text-muted-foreground"
                    >
                      {family}
                    </NativeText>
                  </View>
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
