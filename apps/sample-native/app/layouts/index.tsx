import { Link } from "expo-router";
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

const LAYOUTS = [
  {
    slug: "settings",
    label: "Settings page",
    spec: "E1",
    summary:
      "Top-level settings — sectioned list, leading icon, title, optional value, chevron. Wires Stack.Screen large title + scroll-edge appearance + dangerous-action footer.",
  },
  {
    slug: "settings-sub",
    label: "Settings sub-page",
    spec: "E2",
    summary:
      "Drill-in detail — form fields, save in nav bar, dirty-state guard, back behavior, keyboard avoidance, optimistic-save pattern.",
  },
  {
    slug: "notifications",
    label: "Notifications page",
    spec: "E3",
    summary:
      "Feed of items grouped by date, swipe-to-mark-read, empty state, pull-to-refresh, mark-all-read action.",
  },
  {
    slug: "empty-state",
    label: "Empty state",
    spec: "E6",
    summary:
      "First-run / no-results / error variants with a slot for the primary action. Mirrors the shadcn EmptyState surface that already ships on web.",
  },
  {
    slug: "auth",
    label: "Auth (primitive group)",
    spec: "E7",
    summary:
      "Decomposed into <AuthForm> + <SocialAuthRow> + <AuthBranding> per round-3 simplification #3. Composition doc lives in standards/.",
  },
];

export default function LayoutsIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="layouts-index">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h1">Layouts</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Page-level scaffolds Genesis ships so consumers compose, not
              rebuild. Five layouts in scope; each routes to a stable URL
              today, real implementation lands with G-MEGA-2.
            </NativeText>
          </View>

          {LAYOUTS.map((l) => (
            <Link
              key={l.slug}
              href={`/layouts/${l.slug}`}
              testID={`layouts-link-${l.slug}`}
              asChild
            >
              <NativeCard>
                <NativeCardHeader>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <NativeCardTitle>{l.label}</NativeCardTitle>
                    <NativeBadge variant="outline">{l.spec}</NativeBadge>
                  </View>
                </NativeCardHeader>
                <NativeCardContent>
                  <NativeText preset="body-sm" className="text-muted-foreground">
                    {l.summary}
                  </NativeText>
                </NativeCardContent>
              </NativeCard>
            </Link>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
