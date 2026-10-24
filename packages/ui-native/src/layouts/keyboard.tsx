/**
 * Keyboard-aware scrolling for form screens. Expo recommends
 * react-native-keyboard-controller's `KeyboardAwareScrollView` over
 * `KeyboardAvoidingView` for real apps; it is an optional peer here, so an app
 * that has it passes it once:
 *
 *   import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
 *   <KeyboardScrollProvider component={KeyboardAwareScrollView}>…</KeyboardScrollProvider>
 *
 * (The native app shell does this for you.) Without it, form screens fall back
 * to `KeyboardAvoidingView`.
 *
 * @stability Beta
 */
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import type { ViewStyle } from "react-native";

/** The props Genesis passes to a keyboard-aware scroll view. */
export interface KeyboardScrollProps {
  children?: ReactNode;
  testID?: string;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  contentContainerStyle?: ViewStyle;
  /** iOS: inset content under a translucent or large-title header, as `ScreenContainer` does. */
  contentInsetAdjustmentBehavior?: "automatic" | "scrollableAxes" | "never" | "always";
  /** Extra space between the focused input and the keyboard. */
  bottomOffset?: number;
}

const KeyboardScrollContext = createContext<ComponentType<KeyboardScrollProps> | null>(null);

export function KeyboardScrollProvider({ component, children }: { component: ComponentType<KeyboardScrollProps>; children: ReactNode }) {
  return createElement(KeyboardScrollContext.Provider, { value: component }, children);
}

/** The app's keyboard-aware scroll view, or null when none was provided. */
export function useKeyboardScroll(): ComponentType<KeyboardScrollProps> | null {
  return useContext(KeyboardScrollContext);
}
