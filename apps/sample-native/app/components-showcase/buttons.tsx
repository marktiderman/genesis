import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeButton,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

/**
 * Showcase: NativeButton — every variant + size combination, plus
 * disabled and loading states. Stable order for Maestro diff.
 *
 * @stability stable
 */
export default function ButtonsShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-buttons">
        <View style={{ gap: 16 }}>
          <ShowcaseHeader
            title="Buttons"
            what="The default action surface — 5 visual variants, 3 sizes, plus disabled and loading states."
            why="Use default for the primary call-to-action, outline/ghost for secondary actions, destructive for irreversible operations."
            stability="stable"
          />

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Variants</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <NativeButton variant="default" testID="btn-default">
                  Default
                </NativeButton>
                <NativeButton variant="secondary" testID="btn-secondary">
                  Secondary
                </NativeButton>
                <NativeButton variant="outline" testID="btn-outline">
                  Outline
                </NativeButton>
                <NativeButton variant="ghost" testID="btn-ghost">
                  Ghost
                </NativeButton>
                <NativeButton variant="destructive" testID="btn-destructive">
                  Destructive
                </NativeButton>
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Sizes</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <NativeButton size="sm" testID="btn-sm">
                  Small
                </NativeButton>
                <NativeButton size="md" testID="btn-md">
                  Medium (default)
                </NativeButton>
                <NativeButton size="lg" testID="btn-lg">
                  Large
                </NativeButton>
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>States</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <NativeButton disabled testID="btn-disabled">
                  Disabled
                </NativeButton>
                <NativeButton loading testID="btn-loading">
                  Loading
                </NativeButton>
                <NativeButton variant="destructive" disabled testID="btn-destructive-disabled">
                  Destructive · disabled
                </NativeButton>
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Edge cases</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <NativeText preset="caption" className="text-muted-foreground">
                  Long label — verifies multi-line wrapping behavior.
                </NativeText>
                <NativeButton testID="btn-long-label">
                  This label spans two lines on narrow screens
                </NativeButton>
                <NativeText preset="caption" className="text-muted-foreground">
                  Single-character — verifies icon-button-style sizing.
                </NativeText>
                <NativeButton size="sm" testID="btn-tiny">
                  +
                </NativeButton>
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
