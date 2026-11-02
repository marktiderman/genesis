import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthForm, useUiMessages, type AuthFormClient, type AuthFormMode, type AuthFormProps } from "@marktiderman/genesis-ui";
import { AuthPage } from "@marktiderman/genesis-ui/layout";
import { AUTH_ILLUSTRATION, AUTH_LOGO } from "./__fixtures__/public-brands";
import { PUBLIC_VIEWPORTS } from "./__fixtures__/viewports";

/**
 * A stand-in for `createAuthFormClient(supabase, …)` from genesis-supabase:
 * every call waits a moment and succeeds, except the password "wrong" and the
 * code "000000", which fail with Supabase Auth's codes.
 */
const demoClient: AuthFormClient = {
  signInWithPassword: async ({ password }) =>
    wait(password === "wrong" ? { error: { code: "invalid_credentials", message: "Invalid login credentials" } } : {}),
  sendMagicLink: async () => wait({}),
  sendEmailCode: async () => wait({}),
  verifyEmailCode: async ({ code }) =>
    wait(code === "000000" ? { error: { code: "otp_expired", message: "Token has expired or is invalid" } } : {}),
  signUp: async () => wait({ confirmEmail: true }),
  sendPasswordReset: async () => wait({}),
  updatePassword: async () => wait({}),
  signInWithProvider: async () => wait({}),
  providers: async () => wait(["google", "apple"]),
};

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 400));
}

const Logo = () => <img src={AUTH_LOGO} alt="Northwind Coaching" className="size-12" />;

/** AuthPage around AuthForm, the headline following the form's mode. */
function AuthDemo({ initialMode = "sign-in", aside = true, ...form }: Partial<AuthFormProps> & { initialMode?: AuthFormMode; aside?: boolean }) {
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [done, setDone] = useState<string | null>(null);
  const titles = useUiMessages().auth.titles;
  return (
    <AuthPage
      branding={{ logo: <Logo />, headline: done ?? titles[mode] }}
      legal={
        <>
          By continuing you agree to the <a href="#terms" className="underline">terms</a> and{" "}
          <a href="#privacy" className="underline">privacy policy</a>.
        </>
      }
      aside={aside ? <img src={AUTH_ILLUSTRATION} alt="" className="absolute inset-0 size-full object-cover" /> : undefined}
    >
      <AuthForm
        client={demoClient}
        mode={mode}
        onModeChange={(next) => {
          setDone(null);
          setMode(next);
        }}
        onSuccess={() => setDone("You're in")}
        {...form}
      />
    </AuthPage>
  );
}

const meta: Meta<typeof AuthForm> = {
  title: "Foundation/Patterns/AuthForm",
  component: AuthForm,
  parameters: { layout: "fullscreen", viewport: { options: PUBLIC_VIEWPORTS } },
};
export default meta;
type Story = StoryObj<typeof AuthForm>;

/** Password first, with a code or a link as the alternatives, and the providers the client discovers. Try the password "wrong". */
export const SignIn: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => <AuthDemo methods={["password", "email-code", "magic-link"]} />,
};

/** The same on a 375px phone. */
export const SignInPhone: Story = {
  name: "Sign in (375px)",
  globals: { viewport: { value: "phone375", isRotated: false } },
  render: () => <AuthDemo methods={["password", "email-code", "magic-link"]} />,
};

/** Email code first: the code step uses InputOTP, verifies on the last digit and resends after a cooldown. Try "000000". */
export const EmailCode: Story = {
  render: () => <AuthDemo methods={["email-code"]} providers={false} resendCooldown={15} aside={false} />,
};

/** Sign-up: the project confirms emails, so it ends on "check your email". */
export const SignUp: Story = {
  render: () => <AuthDemo initialMode="sign-up" aside={false} />,
};

/** Forgot password: the reset email. */
export const ForgotPassword: Story = {
  render: () => <AuthDemo initialMode="forgot-password" aside={false} />,
};

/** The page a reset link opens: a new password, twice. */
export const NewPassword: Story = {
  render: () => <AuthDemo initialMode="new-password" aside={false} />,
};
