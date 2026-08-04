import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeBanner,
  NativeInlineAlert,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function InlineAlertSample() {
  const [bannerOpen, setBannerOpen] = useState(true);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      {bannerOpen ? (
        <NativeBanner
          testID="offline-banner"
          variant="warning"
          title="Offline mode"
          description="Some features are limited."
          onDismiss={() => setBannerOpen(false)}
        />
      ) : null}
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Inline alerts</NativeText>
        <NativeInlineAlert
          testID="alert-info"
          variant="info"
          title="Heads up"
          description="This is an informational message."
        />
        <NativeInlineAlert
          testID="alert-success"
          variant="success"
          title="Saved"
          description="Your changes are now live."
        />
        <NativeInlineAlert
          testID="alert-warning"
          variant="warning"
          title="Heads up"
          description="This action takes effect on save."
        />
        <NativeInlineAlert
          testID="alert-destructive"
          variant="destructive"
          title="Cannot delete"
          description="There are linked items that must be removed first."
        />
      </ScrollView>
    </SafeAreaView>
  );
}
