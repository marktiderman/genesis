import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthPage } from "@marktiderman/genesis-ui/layout";
import { Button, Input, Label, Separator } from "@marktiderman/genesis-ui";
import { AUTH_ILLUSTRATION, AUTH_LOGO } from "./__fixtures__/public-brands";
import { PUBLIC_VIEWPORTS } from "./__fixtures__/viewports";

const meta: Meta<typeof AuthPage> = {
  title: "Layout/AuthPage",
  component: AuthPage,
  parameters: { layout: "fullscreen", viewport: { options: PUBLIC_VIEWPORTS } },
};
export default meta;
type Story = StoryObj<typeof AuthPage>;

const Logo = () => <img src={AUTH_LOGO} alt="Northwind Coaching" className="size-12" />;

function Field({ id, label, type = "text", autoComplete }: { id: string; label: string; type?: string; autoComplete?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} autoComplete={autoComplete} />
    </div>
  );
}

const link = "font-medium text-primary underline-offset-4 hover:underline";

const signIn = (
  <AuthPage
    branding={{ logo: <Logo />, headline: "Sign in", subhead: "Welcome back to Northwind Coaching." }}
    social={
      <>
        <Button variant="outline" className="w-full" testID="google">
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
      </>
    }
    footer={
      <>
        <a href="#reset" className={link}>
          Forgot password?
        </a>
        <a href="#sign-up" className={link}>
          Create account
        </a>
      </>
    }
    legal={
      <>
        By continuing you agree to the <a href="#terms" className="underline">terms</a> and{" "}
        <a href="#privacy" className="underline">privacy policy</a>.
      </>
    }
    aside={<img src={AUTH_ILLUSTRATION} alt="" className="absolute inset-0 size-full object-cover" />}
  >
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      <Field id="email" label="Email" type="email" autoComplete="email" />
      <Field id="password" label="Password" type="password" autoComplete="current-password" />
      <Button type="submit" className="w-full" testID="sign-in">
        Sign in
      </Button>
    </form>
  </AuthPage>
);

/** Sign-in with a provider, the email form, footer links, terms and the side panel (wide screens only). */
export const SignIn: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => signIn,
};

/** The same page on a 375px phone: the side panel is gone and nothing scrolls sideways. */
export const SignInPhone: Story = {
  name: "Sign in (375px)",
  globals: { viewport: { value: "phone375", isRotated: false } },
  render: () => signIn,
};

/** Reset password: no provider row, no side panel. */
export const ResetPassword: Story = {
  render: () => (
    <AuthPage
      branding={{ logo: <Logo />, headline: "Reset your password", subhead: "We'll email you a link to choose a new one." }}
      footer={
        <a href="#sign-in" className={link}>
          Back to sign in
        </a>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <Field id="reset-email" label="Email" type="email" autoComplete="email" />
        <Button type="submit" className="w-full" testID="send-reset">
          Send reset link
        </Button>
      </form>
    </AuthPage>
  ),
};

/** Accepting an invite: the side panel on the start side. */
export const Invite: Story = {
  render: () => (
    <AuthPage
      branding={{ logo: <Logo />, headline: "You're invited", subhead: "Sam Lee invited you to join Northwind Coaching." }}
      aside={<img src={AUTH_ILLUSTRATION} alt="" className="absolute inset-0 size-full object-cover" />}
      asidePosition="start"
      legal="Your name and email are shared with the practice."
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <Field id="invite-name" label="Your name" autoComplete="name" />
        <Field id="invite-password" label="Choose a password" type="password" autoComplete="new-password" />
        <Button type="submit" className="w-full" testID="accept-invite">
          Accept invite
        </Button>
      </form>
    </AuthPage>
  ),
};
