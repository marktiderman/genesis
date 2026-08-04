import { Link } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { ThemeControls } from "../components/theme-controls";

const CATEGORIES = [
  {
    slug: "colors",
    label: "Colors",
    description:
      "Neutral scale, semantic colors, status colors, and the resolved brand palette for the active mode.",
  },
  {
    slug: "typography",
    label: "Typography",
    description:
      "Font families, font sizes, weights, line heights, and the seven typography presets (h1-caption).",
  },
  {
    slug: "spacing",
    label: "Spacing",
    description:
      "Page padding, card padding, section gap — the four-stop spacing rhythm Genesis primitives consume.",
  },
  {
    slug: "radii",
    label: "Radii",
    description:
      "Corner radius scale (sm, md, lg, xl, full). Cards use lg by default; pills use full.",
  },
  {
    slug: "motion",
    label: "Motion",
    description:
      "Duration + easing tokens. Motion primitives respect the Reduce Motion toggle in ThemeControls.",
  },
  {
    slug: "shadows",
    label: "Shadows",
    description:
      "Elevation tokens for surfaces. iOS uses native shadow*, Android uses elevation, web uses box-shadow.",
  },
] as const;

export default function TokensIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="tokens-index">
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <NativeText preset="h1">Tokens</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Six categories, every value generated from
              @marktiderman/genesis-design-system.
            </NativeText>
          </View>

          <ThemeControls compact />

          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/tokens/${c.slug}`}
              testID={`tokens-link-${c.slug}`}
              asChild
            >
              <NativeCard>
                <NativeCardHeader>
                  <NativeCardTitle>{c.label}</NativeCardTitle>
                </NativeCardHeader>
                <NativeCardContent>
                  <NativeText preset="body-sm" className="text-muted-foreground">
                    {c.description}
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
