/**
 * AuthScreen — a whole sign-in screen: branding, social providers, the
 * email form with a "Forgot password?" link, and a footer (terms, a
 * sign-up link). It assembles the auth primitives (`AuthBranding`,
 * `SocialAuthRow`, `AuthForm`, `ForgotPasswordLink`) so an app passes
 * props instead of composing them.
 *
 * The form stays above the keyboard on small phones: with the app's
 * `KeyboardScrollProvider` (react-native-keyboard-controller), else with
 * `KeyboardAvoidingView`. With the provider's `toolbar` (`KeyboardToolbar`),
 * a previous / next / done bar rides above the keyboard. In development, on
 * iOS, it warns when a third-party provider is offered without Sign in with
 * Apple (App Store Review Guideline 4.8 rejects that). `appleProvider()`
 * adds Apple's own button in one line.
 *
 * Slots: replace or drop (`null`) `branding`, `social`, `form` or `footer`;
 * `slotProps` feeds a default part. Composing the primitives yourself is
 * still the escape hatch.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import {
  AuthBranding,
  AuthForm,
  ForgotPasswordLink,
  SocialAuthRow,
  type AuthBrandingProps,
  type AuthFormProps,
  type SocialAuthProvider,
} from "./auth";
import { ScreenContainer } from "./screen-container";
import { KEYBOARD_TOOLBAR_HEIGHT, useKeyboardScroll, useKeyboardToolbar } from "./keyboard";

/** The parts of an {@link AuthScreen} that `slots` and `slotProps` reach. */
export type AuthScreenSlotMap = {
  branding: AuthBrandingProps;
  social: { providers: SocialAuthProvider[]; testID: string };
  form: AuthFormProps;
  footer: { children: ReactNode; testID: string };
};

export interface AuthScreenProps {
  /** Logo, headline and subhead above everything else. */
  branding?: AuthBrandingProps;
  /**
   * Sign-in providers (Apple, Google…). None: no social row. A `null` or
   * `false` entry is skipped, so a platform-only provider such as
   * `appleProvider(...)` (null off iOS) goes in the list as is.
   */
  providers?: Array<SocialAuthProvider | null | false | undefined>;
  /** The email form. */
  form: AuthFormProps;
  /** Adds a "Forgot password?" link below the fields (password mode only). */
  onForgotPassword?: () => void;
  /** Below the form: terms, a sign-up link. */
  footer?: ReactNode;
  /** Replace (a component) or drop (`null`) one part. */
  slots?: Slots<AuthScreenSlotMap>;
  /** More props for a default part, merged over what the screen passes. */
  slotProps?: SlotPropsFor<AuthScreenSlotMap>;
  /** testID on the root container. Default `"auth-screen"`. */
  testID?: string;
}

export function AuthScreen({
  branding,
  providers: givenProviders,
  form,
  onForgotPassword,
  footer,
  slots = {},
  slotProps = {},
  testID = "auth-screen",
}: AuthScreenProps) {
  const providers = givenProviders?.filter((p): p is SocialAuthProvider => !!p);
  warnIfNoAppleSignIn(providers);
  const forgot =
    onForgotPassword && (form.mode ?? "password") === "password" ? <ForgotPasswordLink onPress={onForgotPassword} /> : null;
  const formProps: AuthFormProps = { ...form, belowFields: form.belowFields ?? forgot, testID: form.testID ?? `${testID}-form` };
  const KeyboardScroll = useKeyboardScroll();
  const KeyboardToolbar = useKeyboardToolbar();
  const content = (
    <>
      {branding ? renderSlot(AuthBranding, slots.branding, { ...branding, testID: branding.testID ?? `${testID}-branding` }, slotProps.branding) : null}
      {providers?.length
        ? renderSlot(DefaultSocial, slots.social, { providers, testID: `${testID}-social` }, slotProps.social)
        : null}
      {renderSlot(AuthForm, slots.form, formProps, slotProps.form)}
      {footer ? renderSlot(DefaultFooter, slots.footer, { children: footer, testID: `${testID}-footer` }, slotProps.footer) : null}
    </>
  );
  if (KeyboardScroll) {
    return (
      <ScreenContainer testID={testID}>
        <KeyboardScroll
          testID={`${testID}-keyboard`}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          bottomOffset={KeyboardToolbar ? 24 + KEYBOARD_TOOLBAR_HEIGHT : 24}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", gap: 24, paddingHorizontal: 24, paddingVertical: 32 }}
        >
          {content}
        </KeyboardScroll>
        {KeyboardToolbar ? <KeyboardToolbar /> : null}
      </ScreenContainer>
    );
  }
  return (
    <KeyboardAvoidingView testID={`${testID}-kav`} style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenContainer scroll keyboardShouldPersistTaps="handled" testID={testID} contentClassName="flex-grow justify-center gap-6 px-6 py-8">
        {content}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

declare const __DEV__: boolean | undefined;
declare const process: { env: Record<string, string | undefined> } | undefined;
const warnedNoApple = new Set<string>();

/** Development-only: App Store Review Guideline 4.8 requires Sign in with Apple alongside third-party sign-in. */
function warnIfNoAppleSignIn(providers: SocialAuthProvider[] | undefined) {
  const dev = typeof __DEV__ !== "undefined" ? __DEV__ : typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  if (!dev || Platform.OS !== "ios" || !providers?.length) return;
  if (providers.some((p) => p.id === "apple")) return;
  const ids = providers.map((p) => p.id).join(",");
  if (warnedNoApple.has(ids)) return;
  warnedNoApple.add(ids);
  console.warn(
    `[genesis] AuthScreen offers ${providers.map((p) => p.label).join(", ")} on iOS without Sign in with Apple. App Store Review Guideline 4.8 requires it; add appleProvider({ apple: AppleAuthentication, onPress }) (or any provider with id "apple"). If you did, expo-apple-authentication wasn't passed in.`,
  );
}

function DefaultSocial({ providers, testID }: AuthScreenSlotMap["social"]) {
  return <SocialAuthRow providers={providers} testID={testID} />;
}

function DefaultFooter({ children, testID }: AuthScreenSlotMap["footer"]) {
  return (
    <View testID={testID} className="items-center">
      {children}
    </View>
  );
}
