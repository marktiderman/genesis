/**
 * AuthScreen — a whole sign-in screen: branding, social providers, the
 * email form with a "Forgot password?" link, and a footer (terms, a
 * sign-up link). It assembles the auth primitives (`AuthBranding`,
 * `SocialAuthRow`, `AuthForm`, `ForgotPasswordLink`) so an app passes
 * props instead of composing them.
 *
 * Slots: replace or drop (`null`) `branding`, `social`, `form` or `footer`;
 * `slotProps` feeds a default part. Composing the primitives yourself is
 * still the escape hatch.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { View } from "react-native";
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
  /** Sign-in providers (Apple, Google…). None: no social row. */
  providers?: SocialAuthProvider[];
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
  providers,
  form,
  onForgotPassword,
  footer,
  slots = {},
  slotProps = {},
  testID = "auth-screen",
}: AuthScreenProps) {
  const forgot =
    onForgotPassword && (form.mode ?? "password") === "password" ? <ForgotPasswordLink onPress={onForgotPassword} /> : null;
  const formProps: AuthFormProps = { ...form, belowFields: form.belowFields ?? forgot, testID: form.testID ?? `${testID}-form` };
  return (
    <ScreenContainer scroll keyboardShouldPersistTaps="handled" testID={testID} contentClassName="flex-grow justify-center gap-6 px-6 py-8">
      {branding ? renderSlot(AuthBranding, slots.branding, { ...branding, testID: branding.testID ?? `${testID}-branding` }, slotProps.branding) : null}
      {providers?.length
        ? renderSlot(DefaultSocial, slots.social, { providers, testID: `${testID}-social` }, slotProps.social)
        : null}
      {renderSlot(AuthForm, slots.form, formProps, slotProps.form)}
      {footer ? renderSlot(DefaultFooter, slots.footer, { children: footer, testID: `${testID}-footer` }, slotProps.footer) : null}
    </ScreenContainer>
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
