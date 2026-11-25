import { Redirect, router, useLocalSearchParams } from "expo-router";
import { PreviewScreen } from "@marktiderman/genesis-native/updates";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import starter from "../../starter.config";

/**
 * What a preview link opens (`/preview?channel=pr-42`: the pull request's comment, a QR code, or
 * `https://<web>/preview?channel=…`). normalizeLink sends every form of it here, with the channel
 * checked; the screen asks, downloads and restarts into the preview.
 */
export default function Preview() {
  const { channel } = useLocalSearchParams<{ channel?: string }>();
  // Without the updates block there's nothing to switch (and PreviewScreen needs it).
  if (!starter.features.updates) return <Redirect href="/" />;
  return (
    <ScreenContainer>
      <PreviewScreen channel={channel} onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </ScreenContainer>
  );
}
