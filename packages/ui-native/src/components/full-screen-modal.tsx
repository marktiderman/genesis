/**
 * FullScreenModal — content that takes the whole screen over the app: a
 * photo or video viewer, a camera, a scanner.
 *
 * React Native's `Modal`, over the whole screen on both platforms
 * (`overFullScreen` on iOS; under the system bars on Android), faded in (no
 * animation with Reduce Motion). `tone="dark"` (the default) is a black
 * backdrop with light status bar content, for media; `tone="app"` is the
 * theme's background; `tone="none"` draws no backdrop, for content that
 * draws its own (a viewer that fades to show the app as it's dragged away,
 * with `FULL_SCREEN_DARK` behind it). Content
 * gets its own safe area (`useSafeAreaInsets` inside is the modal's) and
 * places its own close control: Android back and the VoiceOver escape
 * gesture call `onOpenChange(false)`.
 *
 * For a short task over the app, use <NativeSheet>; for a confirmation,
 * <NativeDialog>.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { Modal, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeRoles } from "../hooks/use-theme-roles";

export interface NativeFullScreenModalProps {
  open: boolean;
  /** Fired with false on Android back and the VoiceOver escape gesture. Set `open` false in it. */
  onOpenChange: (open: boolean) => void;
  /** `"dark"` (default): black, for photos and video. `"app"`: the theme's background. `"none"`: the content draws its own. */
  tone?: "dark" | "app" | "none";
  children: ReactNode;
  testID?: string;
}

/** The dark tone's backdrop: media reads best on true black in light and dark mode alike. */
export const FULL_SCREEN_DARK = "#000000";

/** @stability Beta */
export function NativeFullScreenModal({ open, onOpenChange, tone = "dark", children, testID = "native-full-screen-modal" }: NativeFullScreenModalProps) {
  const reducedMotion = useReducedMotion();
  const roles = useThemeRoles();
  const background = tone === "dark" ? FULL_SCREEN_DARK : tone === "app" ? roles.background : "transparent";
  const close = () => onOpenChange(false);
  return (
    <Modal
      visible={open}
      animationType={reducedMotion ? "none" : "fade"}
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      testID={testID}
    >
      {tone !== "app" ? <StatusBar barStyle="light-content" animated /> : null}
      <SafeAreaProvider>
        <View
          testID={`${testID}-body`}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ flex: 1, backgroundColor: background }}
        >
          {children}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
