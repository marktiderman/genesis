import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
  NativeSeparator,
} from "@marktiderman/genesis-ui-native";
import { useGenesisTheme } from "@marktiderman/genesis-design-system/providers/native";
import { ThemeControls } from "../components/theme-controls";

export default function SettingsScreen() {
  const theme = useGenesisTheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h2">Settings</NativeText>

        <ThemeControls />

        <NativeCard>
          <NativeCardHeader>
            <NativeCardTitle>Resolved theme</NativeCardTitle>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Brand: {theme.brand} · Mode: {theme.mode}
            </NativeText>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {Object.entries(theme.colors)
                .filter(([, value]) => typeof value === "string")
                .slice(0, 6)
                .map(([key, value]) => (
                  <View
                    key={key}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: value as string,
                      borderWidth: 1,
                      borderColor: "rgba(0,0,0,0.08)",
                    }}
                  />
                ))}
            </View>
          </NativeCardContent>
        </NativeCard>

        <NativeSeparator />

        <NativeCard>
          <NativeCardHeader>
            <NativeCardTitle>App info</NativeCardTitle>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeText preset="body-sm">
              Genesis Sample (Native) · v1.0.0
            </NativeText>
            <NativeText preset="caption" className="text-muted-foreground">
              Built with @marktiderman/genesis-ui-native + Expo SDK 55. Phase G
              portfolio surfaces live under /tokens, /primitives,
              /components-showcase, /layouts, and /standards.
            </NativeText>
          </NativeCardContent>
        </NativeCard>
      </ScrollView>
    </SafeAreaView>
  );
}
