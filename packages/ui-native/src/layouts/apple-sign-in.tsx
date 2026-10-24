/**
 * Sign in with Apple for `AuthScreen` / `SocialAuthRow`, drawn with Apple's
 * own `AppleAuthenticationButton` (Apple's Human Interface Guidelines require
 * its button; a look-alike gets an app rejected). Nothing here imports
 * `expo-apple-authentication`: pass the module in.
 *
 * ```tsx
 * import * as AppleAuthentication from "expo-apple-authentication";
 *
 * <AuthScreen providers={[appleProvider({ apple: AppleAuthentication, onPress: signIn }), google]} … />
 * ```
 *
 * `appleProvider` returns `null` off iOS or without the module, and
 * `AuthScreen` skips a `null` provider, so the same line works everywhere.
 *
 * @stability Beta
 */
import { useRef, useState, type ComponentType } from "react";
import { Platform, View } from "react-native";
import { useThemeMode } from "../hooks/use-theme-mode";
import type { SocialAuthProvider } from "./auth";

/** The parts of `expo-apple-authentication` the button uses. Pass the module itself. */
export interface AppleButtonModuleLike {
  AppleAuthenticationButton: ComponentType<{
    buttonType: number;
    buttonStyle: number;
    cornerRadius?: number;
    onPress: () => void;
    style?: unknown;
    testID?: string;
    accessibilityState?: { disabled?: boolean; busy?: boolean };
  }>;
  AppleAuthenticationButtonType: { SIGN_IN: number; CONTINUE: number; SIGN_UP: number };
  AppleAuthenticationButtonStyle: { BLACK: number; WHITE: number; WHITE_OUTLINE: number };
}

export interface AppleSignInButtonProps {
  /** `expo-apple-authentication`. */
  apple: AppleButtonModuleLike;
  /** Usually `() => signInWithApple(supabase, AppleAuthentication, { digest })` from `@marktiderman/genesis-supabase/native`. */
  onPress: () => void | Promise<void>;
  /** Apple's wording: "Sign in with Apple", "Continue with Apple" (default) or "Sign up with Apple". */
  type?: "sign-in" | "continue" | "sign-up";
  /** `"auto"` (default): black in light mode, white in dark, as Apple recommends. */
  appearance?: "auto" | "black" | "white" | "white-outline";
  /** Default 10, to sit with Genesis buttons. */
  cornerRadius?: number;
  /** Default 44, the recommended touch target (Apple's HIG minimum for this button is 30pt). */
  height?: number;
  /** Dims the button and ignores presses. It is also ignored on its own while an `onPress` promise is pending, so a second tap can't open a second sheet. */
  disabled?: boolean;
  testID?: string;
}

/** Apple's branded button, full width. Renders nothing off iOS. */
export function AppleSignInButton({
  apple,
  onPress,
  type = "continue",
  appearance = "auto",
  cornerRadius = 10,
  height = 44,
  disabled,
  testID = "apple-sign-in",
}: AppleSignInButtonProps) {
  const mode = useThemeMode();
  // A ref, not only state: two taps in the same frame both see the old state.
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== "ios") return null;
  const press = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await onPress();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const inactive = !!disabled || busy;
  const { AppleAuthenticationButton, AppleAuthenticationButtonType: Type, AppleAuthenticationButtonStyle: Style } = apple;
  const buttonType = type === "sign-in" ? Type.SIGN_IN : type === "sign-up" ? Type.SIGN_UP : Type.CONTINUE;
  const resolved = appearance === "auto" ? (mode === "dark" ? "white" : "black") : appearance;
  const buttonStyle = resolved === "white" ? Style.WHITE : resolved === "white-outline" ? Style.WHITE_OUTLINE : Style.BLACK;
  return (
    <View testID={`${testID}-container`} pointerEvents={inactive ? "none" : "auto"} style={disabled ? { opacity: 0.5 } : undefined}>
      <AppleAuthenticationButton
        testID={testID}
        buttonType={buttonType}
        buttonStyle={buttonStyle}
        cornerRadius={cornerRadius}
        style={{ width: "100%", height }}
        accessibilityState={{ disabled: inactive, busy }}
        onPress={() => {
          void press();
        }}
      />
    </View>
  );
}

export interface AppleProviderOptions extends Omit<AppleSignInButtonProps, "apple" | "testID"> {
  /** `expo-apple-authentication`, or `undefined` where it isn't installed. */
  apple: AppleButtonModuleLike | null | undefined;
  /**
   * The provider's `label`, used only by `AuthScreen`'s dev warning and a
   * custom `social` slot. Apple's button draws and announces its own localized
   * text. Default follows `type`: "Continue with Apple", "Sign in with Apple"
   * or "Sign up with Apple".
   */
  label?: string;
}

const APPLE_LABELS = { continue: "Continue with Apple", "sign-in": "Sign in with Apple", "sign-up": "Sign up with Apple" } as const;

/**
 * A `SocialAuthProvider` (id `"apple"`) that draws Apple's button, for
 * `AuthScreen`'s `providers`. `null` off iOS or without the module.
 *
 * @stability Beta
 */
export function appleProvider({ apple, label, ...button }: AppleProviderOptions): SocialAuthProvider | null {
  if (Platform.OS !== "ios" || !apple) return null;
  return {
    id: "apple",
    label: label ?? APPLE_LABELS[button.type ?? "continue"],
    onPress: button.onPress,
    disabled: button.disabled,
    render: ({ testID, disabled }) => <AppleSignInButton apple={apple} {...button} disabled={disabled} testID={testID} />,
  };
}
