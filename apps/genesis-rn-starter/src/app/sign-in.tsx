import { useState } from "react";
import { Alert } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "@marktiderman/genesis-native";
import { AuthScreen, NativeButton, appleProvider } from "@marktiderman/genesis-ui-native";
import starter from "../../starter.config";
import { copy, format } from "@/copy";
import { AppleAuthentication, appleSignIn, emailSignIn } from "@/lib/auth";

const t = copy.signIn;
const { features } = starter;

/** Sign in (or create an account) with email and, on iOS, Apple. A signed-in person goes home. */
export default function SignInScreen() {
  const { status } = useSession();
  const [create, setCreate] = useState(false);
  const [error, setError] = useState<string>();
  if (status === "signedIn") return <Redirect href="/" />;

  const onEmail = async ({ email, password }: { email: string; password: string }) => {
    setError(undefined);
    const result = await emailSignIn(email, password, create);
    if (!result.ok) return setError(result.message);
    if (result.confirmEmail) {
      Alert.alert(t.checkInboxTitle, format(t.checkInboxBody, { email }));
      setCreate(false);
    }
  };
  const onApple = async () => {
    setError(undefined);
    const message = await appleSignIn();
    if (message) setError(message);
  };

  return (
    <AuthScreen
      branding={{ headline: t.headline, subhead: t.subhead }}
      providers={[features.appleSignIn && appleProvider({ apple: AppleAuthentication, onPress: onApple })]}
      form={{
        onSubmit: onEmail,
        submitLabel: create ? t.createSubmit : t.submit,
        errorMessage: error,
        validate: ({ email, password }) => (!email ? t.emailRequired : !password ? t.passwordRequired : null),
      }}
      slots={features.emailSignIn ? undefined : { form: null, footer: null }}
      footer={
        <NativeButton variant="ghost" testID="sign-in-switch" onPress={() => setCreate((c) => !c)}>
          {create ? t.switchToSignIn : t.switchToCreate}
        </NativeButton>
      }
    />
  );
}
