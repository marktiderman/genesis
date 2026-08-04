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
import { ThemeControls } from "../components/theme-controls";

/**
 * Components showcase index (Phase G.4).
 *
 * Lists every primitive that ships in @marktiderman/genesis-ui-native today
 * (the pre-G-MEGA-1 surface). Each entry is a stable Maestro target:
 * deep-linkable via genesis-sample://components-showcase/<slug>.
 */
const PRIMITIVES = [
  { slug: "buttons", label: "Buttons", stability: "stable" as const, blurb: "5 variants × 3 sizes × 3 states" },
  { slug: "cards", label: "Cards", stability: "stable" as const, blurb: "Header / Content / Footer composition" },
  { slug: "inputs", label: "Inputs", stability: "stable" as const, blurb: "Text + states + validation hints" },
  { slug: "badges", label: "Badges", stability: "stable" as const, blurb: "Status + semantic variants" },
  { slug: "dialogs", label: "Dialogs", stability: "stable" as const, blurb: "Modal pattern w/ trigger + content" },
  { slug: "alerts", label: "Alerts", stability: "stable" as const, blurb: "Banner-style status messages" },
  { slug: "progress", label: "Progress", stability: "stable" as const, blurb: "Indeterminate + determinate bars" },
];

const BADGE: Record<string, "default" | "secondary" | "outline"> = {
  stable: "default",
  beta: "secondary",
  planned: "outline",
};

export default function ShowcaseIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-index">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h1">Components</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Every Genesis primitive in a deterministic layout. Used as the
              Maestro snapshot surface for visual regression on every PR.
            </NativeText>
          </View>

          <ThemeControls compact />

          {PRIMITIVES.map(({ slug, label, stability, blurb }) => (
            <Link
              key={slug}
              href={`/components-showcase/${slug}`}
              testID={`showcase-link-${slug}`}
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
                    <NativeCardTitle>{label}</NativeCardTitle>
                    <NativeBadge variant={BADGE[stability]}>@{stability}</NativeBadge>
                  </View>
                </NativeCardHeader>
                <NativeCardContent>
                  <NativeText preset="body-sm" className="text-muted-foreground">
                    {blurb}
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
