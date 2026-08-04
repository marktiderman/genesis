import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeAlert,
  NativeAlertTitle,
  NativeAlertDescription,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

const VARIANTS = ["default", "destructive", "success", "warning", "info"] as const;

/**
 * Showcase: NativeAlert — every variant in stable order.
 *
 * @stability stable
 */
export default function AlertsShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-alerts">
        <View style={{ gap: 12 }}>
          <ShowcaseHeader
            title="Alerts"
            what="Inline status banner with title + description. Five semantic variants."
            why="Use for non-blocking status messages. Toast (G-MEGA-1 C2.1) handles transient feedback; Alert is for persistent surfaces."
            stability="stable"
          />

          {VARIANTS.map((variant) => (
            <NativeAlert
              key={variant}
              variant={variant}
              testID={`alert-${variant}`}
            >
              <NativeAlertTitle variant={variant}>
                {variant.charAt(0).toUpperCase() + variant.slice(1)} alert
              </NativeAlertTitle>
              <NativeAlertDescription variant={variant}>
                Stable copy for snapshot diffing.
              </NativeAlertDescription>
            </NativeAlert>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
