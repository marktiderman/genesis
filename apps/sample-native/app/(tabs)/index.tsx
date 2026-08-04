import { Link } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeBadge,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
  NativeButton,
} from "@marktiderman/genesis-ui-native";
import { ThemeControls } from "../components/theme-controls";

const SECTIONS: {
  id: string;
  title: string;
  href: string;
  description: string;
  status: "stable" | "beta" | "planned";
}[] = [
  {
    id: "tokens",
    title: "Tokens",
    href: "/tokens",
    description:
      "Six categories — colors, typography, spacing, radii, motion, shadows — generated from @marktiderman/genesis-design-system.",
    status: "stable",
  },
  {
    id: "primitives",
    title: "Primitives",
    href: "/primitives",
    description:
      "All 22 Tier-1 primitives + the next 22 (Toast / Sheet / Popover / Drawer / Combobox / Stepper / Slider …) — placeholders today, populated by G-MEGA-1.",
    status: "beta",
  },
  {
    id: "showcase",
    title: "Components showcase",
    href: "/components-showcase",
    description:
      "Stable visual-regression surface — every primitive in a deterministic layout for Maestro snapshot capture.",
    status: "stable",
  },
  {
    id: "layouts",
    title: "Layouts",
    href: "/layouts",
    description:
      "Settings, SettingsSub, Notifications, EmptyState, Auth — placeholder routes today, real implementations land with G-MEGA-2.",
    status: "planned",
  },
  {
    id: "standards",
    title: "Standards",
    href: "/standards",
    description:
      "Design opinions, usage doctrine, upgrade process — the rules every Genesis consumer follows.",
    status: "stable",
  },
];

const BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  stable: "default",
  beta: "secondary",
  planned: "outline",
};

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView
        contentContainerClassName="p-4"
        testID="portfolio-home"
      >
        <View style={{ gap: 20 }}>
          {/* Hero */}
          <View style={{ gap: 8 }}>
            <NativeBadge variant="outline" testID="hero-eyebrow">
              Genesis Showcase · Phase G
            </NativeBadge>
            <NativeText preset="h1">Genesis</NativeText>
            <NativeText preset="h3" className="text-muted-foreground">
              The brand-agnostic design system for Tiderman Ventures.
            </NativeText>
            <NativeText preset="body" className="text-muted-foreground">
              This sample app is the canonical reference for
              {" "}@marktiderman/genesis-* on iOS and Android. Every section below
              is live — driven by the same packages your consumer apps install
              from npm.
            </NativeText>
          </View>

          <ThemeControls compact />

          {/* Section grid */}
          <View style={{ gap: 12 }}>
            {SECTIONS.map((s) => (
              <Link key={s.id} href={s.href as never} asChild>
                <NativeCard testID={`portfolio-section-${s.id}`}>
                  <NativeCardHeader>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <NativeCardTitle>{s.title}</NativeCardTitle>
                      <NativeBadge
                        variant={BADGE_VARIANT[s.status]}
                        testID={`portfolio-section-${s.id}-status`}
                      >
                        {s.status}
                      </NativeBadge>
                    </View>
                  </NativeCardHeader>
                  <NativeCardContent>
                    <NativeText preset="body-sm" className="text-muted-foreground">
                      {s.description}
                    </NativeText>
                  </NativeCardContent>
                </NativeCard>
              </Link>
            ))}
          </View>

          {/* Cross-link */}
          <NativeCard testID="portfolio-cross-link">
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <NativeText preset="h4">Also available on the web</NativeText>
                <NativeText preset="body-sm" className="text-muted-foreground">
                  The same showcase ships as a browseable React Router 7 site
                  with a Storybook covering every web primitive. Run
                  {" "}pnpm --filter sample dev to launch it locally.
                </NativeText>
                <Link href="/standards" asChild>
                  <NativeButton variant="outline" size="sm" testID="portfolio-cta-standards">
                    Read the standards
                  </NativeButton>
                </Link>
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
