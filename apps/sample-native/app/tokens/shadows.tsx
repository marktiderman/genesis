import { ScrollView, View, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";

/**
 * Shadow tokens are platform-specific. Genesis canonical values are
 * declared in @marktiderman/genesis-design-system; this screen visualizes
 * the four-stop elevation rhythm (none, sm, md, lg) Genesis primitives
 * expect.
 */
const SHADOWS: {
  name: string;
  iosShadow: { color: string; offset: { width: number; height: number }; opacity: number; radius: number };
  androidElevation: number;
  note: string;
}[] = [
  {
    name: "shadow.none",
    iosShadow: { color: "#000", offset: { width: 0, height: 0 }, opacity: 0, radius: 0 },
    androidElevation: 0,
    note: "Flush with surface — no separation.",
  },
  {
    name: "shadow.sm",
    iosShadow: { color: "#000", offset: { width: 0, height: 1 }, opacity: 0.05, radius: 2 },
    androidElevation: 1,
    note: "Cards, list rows.",
  },
  {
    name: "shadow.md",
    iosShadow: { color: "#000", offset: { width: 0, height: 2 }, opacity: 0.08, radius: 4 },
    androidElevation: 3,
    note: "Popovers, dropdowns.",
  },
  {
    name: "shadow.lg",
    iosShadow: { color: "#000", offset: { width: 0, height: 4 }, opacity: 0.12, radius: 8 },
    androidElevation: 6,
    note: "Sheets, modals, dialogs.",
  },
];

export default function TokensShadows() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-shadows">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h2">Shadows</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Elevation tokens are platform-specific: iOS uses native
              shadow*, Android uses elevation, web uses box-shadow. The four
              canonical stops are none / sm / md / lg.
            </NativeText>
          </View>

          {SHADOWS.map((s) => (
            <NativeCard
              key={s.name}
              testID={`token-shadow-${s.name.split(".")[1] ?? "row"}`}
            >
              <NativeCardHeader>
                <NativeCardTitle>{s.name}</NativeCardTitle>
              </NativeCardHeader>
              <NativeCardContent>
                <View style={{ gap: 12 }}>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      width: 96,
                      height: 64,
                      backgroundColor: "#fff",
                      borderRadius: 8,
                      ...Platform.select({
                        ios: {
                          shadowColor: s.iosShadow.color,
                          shadowOffset: s.iosShadow.offset,
                          shadowOpacity: s.iosShadow.opacity,
                          shadowRadius: s.iosShadow.radius,
                        },
                        android: { elevation: s.androidElevation },
                        default: {},
                      }),
                    }}
                  />
                  <NativeText preset="caption" className="text-muted-foreground">
                    {s.note}
                  </NativeText>
                </View>
              </NativeCardContent>
            </NativeCard>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
