import { router, useLocalSearchParams } from "expo-router";
import { PreviewScreen } from "@marktiderman/genesis-native/updates";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";

/**
 * What a preview link opens (`/preview?channel=pr-42`: the pull request's comment, a QR code, or
 * `https://<web>/preview?channel=…`). normalizeLink sends every form of it here, with the channel
 * checked; the screen asks, downloads and restarts into the preview.
 */
export default function Preview() {
  const { channel } = useLocalSearchParams<{ channel?: string }>();
  return (
    <ScreenContainer>
      <PreviewScreen channel={channel} onDone={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
    </ScreenContainer>
  );
}
