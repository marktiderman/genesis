import * as React from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { cn } from "../../utils";

/**
 * The brand block above the card. Same fields as native `AuthBrandingProps`
 * (`logo`, `headline`, `subhead`), except that `headline` is required here:
 * it is the page's `<h1>`.
 */
export interface AuthPageBrandingProps {
  /** Brand mark (logo node). */
  logo?: React.ReactNode;
  /** "Sign in", "Reset your password", "You're invited". Renders as the page's h1. */
  headline: React.ReactNode;
  /** One line under the headline. */
  subhead?: React.ReactNode;
  testID?: string | undefined;
}

/** The parts of an {@link AuthPage} that `slots` and `slotProps` reach. Names match native `AuthScreenSlotMap`. */
export type AuthPageSlotMap = {
  branding: AuthPageBrandingProps & { testID: string };
  social: { children: React.ReactNode; testID: string };
  footer: { children: React.ReactNode; testID: string };
};

export interface AuthPageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Logo, headline (h1) and subhead above the card. */
  branding: AuthPageBrandingProps;
  /** Sign-in provider buttons (Google, Apple…), above the form inside the card. */
  social?: React.ReactNode;
  /** The form: sign-in, sign-up, reset, invite acceptance, verify. The card's body. */
  children?: React.ReactNode;
  /** Below the card: "Forgot password?", "Create account". */
  footer?: React.ReactNode;
  /** The small print under everything: terms and privacy. */
  legal?: React.ReactNode;
  /**
   * A panel beside the card on wide screens (an illustration, a quote, a
   * product shot). Hidden below the `lg` breakpoint, where the card is the
   * whole page.
   */
  aside?: React.ReactNode;
  /** Which side `aside` sits on. Default `"end"`. */
  asidePosition?: "start" | "end";
  /** Replace (a component) or drop (`null`) one part. */
  slots?: Slots<AuthPageSlotMap>;
  /** More props for a default part, merged over what the page passes. */
  slotProps?: SlotPropsFor<AuthPageSlotMap>;
  /** testID on the root. Default `"auth-page"`; parts use `${testID}-branding`, `-card`, `-social`, `-footer`, `-legal`, `-aside`. */
  testID?: string | undefined;
}

/**
 * AuthPage — the web counterpart of native `AuthScreen`: a whole-screen,
 * centred card for sign-in, sign-up, password reset, invite acceptance and
 * email verification.
 *
 * ```tsx
 * <AuthPage
 *   branding={{ logo: <Logo />, headline: "Sign in", subhead: "Welcome back." }}
 *   footer={<><a href="/reset">Forgot password?</a> · <a href="/sign-up">Create account</a></>}
 *   legal={<>By continuing you agree to the <a href="/terms">terms</a>.</>}
 *   aside={<img src={hero} alt="" />}
 * >
 *   <SignInForm />
 * </AuthPage>
 * ```
 *
 * The card column is a `<main>` landmark and the headline is its single
 * `<h1>`, so a screen reader lands on the form's purpose. The page fills the
 * viewport (`min-height: 100dvh`) and the card shrinks to the screen with a
 * 16px gutter, so nothing scrolls sideways at 375px.
 *
 * Native `AuthScreen` takes `form` and `providers` as data and renders its
 * own `AuthForm`; this one is a **layout**, so the form and the provider
 * buttons are nodes the app passes. Slots are the same contract:
 * replace or drop (`null`) `branding`, `social` or `footer`.
 *
 * @stability Beta
 */
export const AuthPage = React.forwardRef<HTMLDivElement, AuthPageProps>(
  (
    {
      branding,
      social,
      children,
      footer,
      legal,
      aside,
      asidePosition = "end",
      slots = {},
      slotProps = {},
      testID = "auth-page",
      className,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="auth-page"
      data-testid={testID}
      className={cn(
        "flex min-h-dvh w-full min-w-0 bg-background text-foreground",
        aside ? "lg:grid lg:grid-cols-2" : null,
        className,
      )}
      {...props}
    >
      <main
        data-slot="auth-page-main"
        className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6"
      >
        <div className="flex w-full max-w-sm min-w-0 flex-col gap-6">
          {renderSlot(
            DefaultBranding,
            slots.branding,
            { ...branding, testID: branding.testID ?? `${testID}-branding` },
            slotProps.branding,
          )}
          <div
            data-slot="auth-page-card"
            data-testid={`${testID}-card`}
            className="flex min-w-0 flex-col gap-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
          >
            {social ? renderSlot(DefaultSocial, slots.social, { children: social, testID: `${testID}-social` }, slotProps.social) : null}
            {children}
          </div>
          {footer
            ? renderSlot(DefaultFooter, slots.footer, { children: footer, testID: `${testID}-footer` }, slotProps.footer)
            : null}
          {legal ? (
            <p
              data-slot="auth-page-legal"
              data-testid={`${testID}-legal`}
              className="text-center text-xs text-muted-foreground"
            >
              {legal}
            </p>
          ) : null}
        </div>
      </main>
      {aside ? (
        <aside
          data-slot="auth-page-aside"
          data-testid={`${testID}-aside`}
          className={cn(
            "relative hidden min-w-0 overflow-hidden bg-muted lg:flex lg:items-center lg:justify-center",
            asidePosition === "start" ? "lg:order-first" : null,
          )}
        >
          {aside}
        </aside>
      ) : null}
    </div>
  ),
);
AuthPage.displayName = "AuthPage";

function DefaultBranding({ logo, headline, subhead, testID }: AuthPageSlotMap["branding"]) {
  return (
    <header data-slot="auth-page-branding" data-testid={testID} className="flex flex-col items-center gap-3 text-center">
      {logo ? (
        <div data-testid={`${testID}-logo`} className="mb-1">
          {logo}
        </div>
      ) : null}
      <h1 data-testid={`${testID}-headline`} className="text-2xl font-bold tracking-tight break-words">
        {headline}
      </h1>
      {subhead ? (
        <p data-testid={`${testID}-subhead`} className="text-sm text-muted-foreground">
          {subhead}
        </p>
      ) : null}
    </header>
  );
}

function DefaultSocial({ children, testID }: AuthPageSlotMap["social"]) {
  return (
    <div data-slot="auth-page-social" data-testid={testID} className="flex flex-col gap-2">
      {children}
    </div>
  );
}

function DefaultFooter({ children, testID }: AuthPageSlotMap["footer"]) {
  return (
    <div
      data-slot="auth-page-footer"
      data-testid={testID}
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}
