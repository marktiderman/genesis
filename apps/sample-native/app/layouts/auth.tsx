import { Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import {
  AuthBranding,
  AuthForm,
  ForgotPasswordLink,
  NativeText,
  ScreenContainer,
  SocialAuthRow,
  composeHeaderOptions,
  type AuthFormValues,
  type SocialAuthProvider,
} from "@marktiderman/genesis-ui-native";

/**
 * E7 sample — composes the three auth primitives on a regular ScrollView,
 * NOT a god-component. This is the canonical "compose, don't configure"
 * recipe consumers will copy into their own auth screens.
 *
 * Per simplification #3: there is no <AuthScreen> primitive; consumers
 * arrange <AuthBranding> + <SocialAuthRow> + <AuthForm> on whatever
 * background they need.
 */
export default function AuthLayoutSample() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const providers: SocialAuthProvider[] = [
    {
      id: "apple",
      label: "Continue with Apple",
      onPress: () => {},
    },
    {
      id: "google",
      label: "Continue with Google",
      onPress: () => {},
    },
  ];

  async function handleSubmit(values: AuthFormValues) {
    setError(undefined);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    if (values.email !== "user@example.com") {
      setError("Try user@example.com / any password");
    }
  }

  return (
    <>
      <Stack.Screen
        options={composeHeaderOptions({
          headerTitle: "Sign in (E7)",
          large: false,
        })}
      />
      <ScreenContainer scroll testID="auth-screen" contentClassName="px-6 py-8">
        <AuthBranding
          testID="auth-branding"
          headline="Welcome back"
          subhead="Sign in to continue to your sample app."
        />

        <View className="mb-6">
          <SocialAuthRow testID="auth-social" providers={providers} />
        </View>

        <AuthForm
          testID="auth-form"
          onSubmit={handleSubmit}
          loading={loading}
          errorMessage={error}
          belowFields={
            <ForgotPasswordLink
              testID="auth-forgot"
              onPress={() => {}}
            />
          }
        />

        <NativeText
          preset="caption"
          className="mt-6 text-center text-muted-foreground"
        >
          By continuing you agree to the sample Terms of Service.
        </NativeText>
      </ScreenContainer>
    </>
  );
}

// Note: not exported — kept for ScrollView discoverability if anyone wants
// to convert this sample to a magic-link variant. Both variants use the
// same primitives — only the AuthForm `mode` prop changes.
void ScrollView;
