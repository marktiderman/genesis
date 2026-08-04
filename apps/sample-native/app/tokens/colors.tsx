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
import { ColorSwatch, TokenRow } from "../components/token-row";

/**
 * Tokens — Colors (Phase G.2).
 *
 * Categories rendered:
 *   - Brand surface (resolved for the active mode + brand)
 *   - Neutral scale 50..900
 *   - Semantic (success, warning, error, info — DEFAULT/light/dark)
 *   - Status (active, inactive, pending, blocked, draft, archived)
 *
 * Pulls live from useGenesisTheme() so flipping the theme controls
 * re-renders this screen without any local state.
 */
export default function TokensColors() {
  const theme = useGenesisTheme();
  const { colors } = theme;

  const brandColors: { name: string; value: string }[] = [
    { name: "primary", value: colors.primary },
    { name: "primaryForeground", value: colors.primaryForeground },
    { name: "background", value: colors.background },
    { name: "foreground", value: colors.foreground },
    { name: "card", value: colors.card },
    { name: "cardForeground", value: colors.cardForeground },
    { name: "muted", value: colors.muted },
    { name: "mutedForeground", value: colors.mutedForeground },
    { name: "border", value: colors.border },
    { name: "destructive", value: colors.destructive },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-colors">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Colors</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Brand surface resolves from the current mode ({theme.mode}) and
              brand ({theme.brand}). Neutral / semantic / status are mode-stable.
            </NativeText>
          </View>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Brand surface ({theme.mode})</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {brandColors.map(({ name, value }) => (
                  <TokenRow
                    key={name}
                    name={name}
                    value={value}
                    sample={<ColorSwatch hex={value} />}
                    testID={`token-color-${name}`}
                  />
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Neutral scale</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {Object.entries(colors.neutral).map(([step, hex]) => (
                  <TokenRow
                    key={step}
                    name={`neutral.${step}`}
                    value={hex}
                    sample={<ColorSwatch hex={hex} />}
                    testID={`token-color-neutral-${step}`}
                  />
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Semantic</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                {Object.entries(colors.semantic).map(([key, scale]) => (
                  <View key={key} style={{ gap: 4 }}>
                    <NativeText preset="label">{key}</NativeText>
                    {Object.entries(scale).map(([variant, hex]) => (
                      <TokenRow
                        key={variant}
                        name={`${key}.${variant}`}
                        value={hex}
                        sample={<ColorSwatch hex={hex} />}
                        testID={`token-color-semantic-${key}-${variant}`}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Status</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {Object.entries(colors.status).map(([key, hex]) => (
                  <TokenRow
                    key={key}
                    name={`status.${key}`}
                    value={hex}
                    sample={<ColorSwatch hex={hex} />}
                    testID={`token-color-status-${key}`}
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
