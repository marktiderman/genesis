import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardDescription,
  NativeCardContent,
  NativeCardFooter,
  NativeButton,
  NativeBadge,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

/**
 * Showcase: NativeCard — header/content/footer composition variants.
 *
 * @stability stable
 */
export default function CardsShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-cards">
        <View style={{ gap: 16 }}>
          <ShowcaseHeader
            title="Cards"
            what="Surface container with optional Header / Title / Description / Content / Footer slots."
            why="Compose to taste: minimal (content only), structured (header + footer), or with description for context. Card two-form refactor (G-MEGA-1 C5) splits this into <Card> + <HeaderCard>."
            stability="stable"
          />

          <NativeCard testID="card-basic">
            <NativeCardHeader>
              <NativeCardTitle>Basic card</NativeCardTitle>
              <NativeCardDescription>
                Header + description below the title.
              </NativeCardDescription>
            </NativeCardHeader>
            <NativeCardContent>
              <NativeText preset="body-sm">
                Body text inside card content. The four-slot composition
                covers ~90% of surfaces.
              </NativeText>
            </NativeCardContent>
          </NativeCard>

          <NativeCard testID="card-with-footer">
            <NativeCardHeader>
              <NativeCardTitle>With footer</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <NativeText preset="body-sm" className="text-muted-foreground">
                Card with an action footer aligned to the right.
              </NativeText>
            </NativeCardContent>
            <NativeCardFooter>
              <NativeButton
                variant="outline"
                size="sm"
                testID="card-with-footer-action"
              >
                Cancel
              </NativeButton>
              <NativeButton size="sm">Save</NativeButton>
            </NativeCardFooter>
          </NativeCard>

          <NativeCard testID="card-with-badge">
            <NativeCardHeader>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <NativeCardTitle>Header with status</NativeCardTitle>
                <NativeBadge variant="success">Active</NativeBadge>
              </View>
            </NativeCardHeader>
            <NativeCardContent>
              <NativeText preset="body-sm" className="text-muted-foreground">
                Compose Badge into the header row for inline status.
              </NativeText>
            </NativeCardContent>
          </NativeCard>

          <NativeCard testID="card-minimal">
            <NativeCardContent>
              <NativeText preset="body-sm">Minimal: content only.</NativeText>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
