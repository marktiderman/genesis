import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeBadge,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

/**
 * Showcase: NativeBadge — every variant rendered in stable order.
 *
 * @stability stable
 */
export default function BadgesShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-badges">
        <View style={{ gap: 16 }}>
          <ShowcaseHeader
            title="Badges"
            what="Compact status pill — eight semantic variants Genesis primitives consume for inline state."
            why="Use default for neutral counts, success/warning/destructive/info for semantic state, outline for low-emphasis tags."
            stability="stable"
          />

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Variants</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View
                className="flex-row flex-wrap"
                style={{ gap: 8 }}
                testID="badge-grid"
              >
                <NativeBadge variant="default" testID="badge-default">
                  Default
                </NativeBadge>
                <NativeBadge variant="secondary" testID="badge-secondary">
                  Secondary
                </NativeBadge>
                <NativeBadge variant="destructive" testID="badge-destructive">
                  Destructive
                </NativeBadge>
                <NativeBadge variant="outline" testID="badge-outline">
                  Outline
                </NativeBadge>
                <NativeBadge variant="success" testID="badge-success">
                  Success
                </NativeBadge>
                <NativeBadge variant="warning" testID="badge-warning">
                  Warning
                </NativeBadge>
                <NativeBadge variant="info" testID="badge-info">
                  Info
                </NativeBadge>
                <NativeBadge variant="muted" testID="badge-muted">
                  Muted
                </NativeBadge>
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>In context</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <NativeText preset="body">Project Alpha</NativeText>
                  <NativeBadge variant="success">Active</NativeBadge>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <NativeText preset="body">Project Beta</NativeText>
                  <NativeBadge variant="warning">Pending</NativeBadge>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <NativeText preset="body">Project Gamma</NativeText>
                  <NativeBadge variant="destructive">Blocked</NativeBadge>
                </View>
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
