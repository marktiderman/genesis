/**
 * Keyboard-aware scrolling for form screens. Expo recommends
 * react-native-keyboard-controller's `KeyboardAwareScrollView` over
 * `KeyboardAvoidingView` for real apps; it is an optional peer here, so an app
 * that has it passes it once:
 *
 *   import { KeyboardAwareScrollView, KeyboardProvider, KeyboardToolbar } from "react-native-keyboard-controller";
 *   <KeyboardProvider>
 *     <KeyboardScrollProvider component={KeyboardAwareScrollView} toolbar={KeyboardToolbar}>…</KeyboardScrollProvider>
 *   </KeyboardProvider>
 *
 * `KeyboardAwareScrollView` does nothing without react-native-keyboard-controller's
 * `KeyboardProvider` above it, mounted once at the root. (The native app
 * shell does both, with `keyboardProvider` and `keyboardScroll`.) Without a
 * scroll view here, form screens fall back to `KeyboardAvoidingView`.
 *
 * `toolbar` (optional, `KeyboardToolbar`) adds the previous / next / done bar
 * above the keyboard on Genesis's multi-field form layouts (`AuthScreen`,
 * `SettingsSubPage`). It needs `component` too: the bar sits beside the
 * keyboard-aware scroll view. Without it, nothing changes.
 *
 * @stability Beta
 */
import { createContext, createElement, useContext, useMemo, type ComponentType, type ReactNode } from "react";
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

/**
 * The props Genesis may pass to a keyboard toolbar, all optional and all
 * `KeyboardToolbar`'s own: a settings form passes none (previous / next /
 * done), a one-question form (forms-native's `FormFocus`) hides the arrows
 * and makes Done its Next or Send. To theme it, pass a wrapper defined at
 * module scope that renders it with your props and forwards these.
 */
export interface KeyboardToolbarProps {
  /** Show the previous / next arrows. `KeyboardToolbar`'s default is true. */
  showArrows?: boolean;
  /** The done button's label. */
  doneText?: ReactNode;
  /** Called when done is pressed. The keyboard closes too, unless the callback calls `event.preventDefault()`. */
  onDoneCallback?: (event: { preventDefault(): void }) => void;
}

/**
 * Height of react-native-keyboard-controller's `KeyboardToolbar`, kept clear
 * above the focused input. Mirrors `KEYBOARD_TOOLBAR_HEIGHT` in the library's
 * `src/components/KeyboardToolbar/constants.ts` (1.22): move them together.
 */
export const KEYBOARD_TOOLBAR_HEIGHT = 42;

interface KeyboardScrollValue {
  component: ComponentType<KeyboardScrollProps>;
  toolbar: ComponentType<KeyboardToolbarProps> | null;
}

const KeyboardScrollContext = createContext<KeyboardScrollValue | null>(null);

export function KeyboardScrollProvider({
  component,
  toolbar,
  children,
}: {
  component: ComponentType<KeyboardScrollProps>;
  /** `KeyboardToolbar` from react-native-keyboard-controller: previous / next / done above the keyboard. */
  toolbar?: ComponentType<KeyboardToolbarProps>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ component, toolbar: toolbar ?? null }), [component, toolbar]);
  return createElement(KeyboardScrollContext.Provider, { value }, children);
}

/** The app's keyboard-aware scroll view, or null when none was provided. */
export function useKeyboardScroll(): ComponentType<KeyboardScrollProps> | null {
  return useContext(KeyboardScrollContext)?.component ?? null;
}

/** The app's keyboard toolbar, or null when none was provided (or no scroll view to go with it). */
export function useKeyboardToolbar(): ComponentType<KeyboardToolbarProps> | null {
  return useContext(KeyboardScrollContext)?.toolbar ?? null;
}
