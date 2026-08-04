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

export default function TokensRadii() {
  const theme = useGenesisTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-radii">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Radii</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Corner radius scale — primitives compose these via the brand
              theme. Cards default to lg; pills default to full.
            </NativeText>
          </View>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Scale</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 4 }}>
                {Object.entries(theme.radius).map(([key, px]) => (
                  <TokenRow
                    key={key}
                    name={`radius.${key}`}
                    value={px === 9999 ? `${px} (full)` : `${px}px`}
                    sample={
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: Math.min(Number(px), 18),
                          backgroundColor: theme.colors.primary,
                        }}
                      />
                    }
                    testID={`token-radius-${key}`}
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
