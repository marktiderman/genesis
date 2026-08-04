import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeInput,
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardContent,
} from "@marktiderman/genesis-ui-native";
import { ShowcaseHeader } from "../components/showcase-header";

/**
 * Showcase: NativeInput — base, with label, error, and disabled.
 * Stable placeholder text so snapshots stay deterministic.
 *
 * @stability stable
 */
export default function InputsShowcase() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-inputs">
        <View style={{ gap: 16 }}>
          <ShowcaseHeader
            title="Inputs"
            what="Single-line text entry. Supports inline label, helper / error message, secure entry, and platform keyboard types."
            why="Use label for clarity when the placeholder alone isn't enough. The error slot replaces helper text on validation failure."
            stability="stable"
          />

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>Variants</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 12 }}>
                <NativeInput placeholder="Plain input" testID="input-plain" />

                <NativeInput
                  label="Email"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="input-email"
                />

                <NativeInput
                  label="Password"
                  placeholder="Enter password"
                  secureTextEntry
                  testID="input-password"
                />

                <NativeInput
                  label="Search"
                  placeholder="Search items"
                  keyboardType="default"
                  testID="input-search"
                />
              </View>
            </NativeCardContent>
          </NativeCard>

          <NativeCard>
            <NativeCardHeader>
              <NativeCardTitle>States</NativeCardTitle>
            </NativeCardHeader>
            <NativeCardContent>
              <View style={{ gap: 12 }}>
                <NativeInput
                  label="With error"
                  placeholder="Required"
                  error="Username is required."
                  testID="input-error"
                />

                <NativeInput
                  label="Disabled"
                  placeholder="Cannot edit"
                  editable={false}
                  testID="input-disabled"
                />

                <NativeInput
                  label="Pre-filled"
                  defaultValue="you@example.com"
                  testID="input-prefilled"
                />
              </View>
            </NativeCardContent>
          </NativeCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
