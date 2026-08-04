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
import { TokenRow } from "../components/token-row";

export default function TokensSpacing() {
  const theme = useGenesisTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-spacing">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Spacing</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              The four-stop spacing rhythm Genesis primitives consume. Scale
              values are pixels (native) — derived from the canonical rem-based
              tokens via Style Dictionary.
            </NativeText>
          </View>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Scale</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {Object.entries(theme.spacing).map(([key, px]) => (
                  <TokenRow
                    key={key}
                    name={`spacing.${key}`}
                    value={`${px}px`}
                    sample={
                      <View
                        style={{
                          width: Math.min(48, Number(px) * 1.5),
                          height: 12,
                          backgroundColor: theme.colors.primary,
                          borderRadius: 4,
                        }}
                      />
                    }
                    testID={`token-spacing-${key}`}
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
