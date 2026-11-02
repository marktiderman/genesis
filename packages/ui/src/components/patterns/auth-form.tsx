"use client";

/**
 * AuthForm — the web sign-in form: sign in (password, magic link or emailed
 * code), sign up, forgot password and choose a new password, with provider
 * buttons. It sits inside `AuthPage`.
 *
 * It owns the steps and the words, not the auth: every call goes through the
 * `client` it is given (`AuthFormClient`). With Supabase that is
 * `createAuthFormClient(supabase, …)` from `@marktiderman/genesis-supabase`,
 * which also discovers the providers turned on in the project. The split
 * mirrors native, where `AuthForm` (genesis-ui-native) draws the form and
 * genesis-supabase holds the sign-in calls.
 *
 * @stability Beta
 */
import * as React from "react";
import { reportError } from "@marktiderman/genesis-core/errors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { fillMessage, useUiMessages, type UiMessages } from "../../messages";
import { cn } from "../../utils";

/** What the form is for. Each mode's headline is `useUiMessages().auth.titles[mode]`. */
export type AuthFormMode = "sign-in" | "sign-up" | "forgot-password" | "new-password";

/** How someone signs in with their email in `"sign-in"` mode. */
export type AuthSignInMethod = "password" | "magic-link" | "email-code";

/**
 * Why a call failed. `code` is Supabase Auth's error code (`invalid_credentials`,
 * `otp_expired`…) or the client's own; the form shows the catalogue's copy for
 * it (`auth.errors[code]`), else `message`, else `auth.errors.generic`.
 */
export interface AuthFormError {
  code?: string | undefined;
  message?: string | undefined;
}

/** What every client call resolves with. A client never needs to throw. */
export interface AuthFormResult {
  error?: AuthFormError | null | undefined;
  /** From `signUp`: the account waits for its email to be confirmed (no session yet). */
  confirmEmail?: boolean | undefined;
}

/**
 * The auth calls the form makes. `createAuthFormClient` from
 * `@marktiderman/genesis-supabase` is one; a test or another backend can be
 * any object of this shape.
 */
export interface AuthFormClient {
  signInWithPassword(input: { email: string; password: string }): Promise<AuthFormResult>;
  /** `createUser`: false when the form doesn't allow sign-up, so an unknown email gets no account. */
  sendMagicLink(input: { email: string; createUser: boolean }): Promise<AuthFormResult>;
  sendEmailCode(input: { email: string; createUser: boolean }): Promise<AuthFormResult>;
  verifyEmailCode(input: { email: string; code: string }): Promise<AuthFormResult>;
  signUp(input: { email: string; password: string }): Promise<AuthFormResult>;
  sendPasswordReset(input: { email: string }): Promise<AuthFormResult>;
  /** Needs a session: the one a reset link opens. */
  updatePassword(input: { password: string }): Promise<AuthFormResult>;
  /** Usually leaves the page for the provider. */
  signInWithProvider(provider: string): Promise<AuthFormResult>;
  /** The provider ids turned on (`"google"`, `"apple"`…), when the form isn't given a list. */
  providers?(): Promise<string[]>;
}

/** A provider button. A plain id is enough for a known provider: the label is "Continue with Google". */
export interface AuthFormProvider {
  id: string;
  /** The button's whole label. Default `auth.continueWith` with the provider's name. */
  label?: string;
  icon?: React.ReactNode;
}

/** What finished, for `onSuccess`. */
export interface AuthFormSuccess {
  mode: AuthFormMode;
  /** In `"sign-in"` mode: how. */
  method?: AuthSignInMethod;
  email?: string;
}

export interface AuthFormProps {
  /** Every call goes through it. */
  client: AuthFormClient;
  /** The mode, controlled. Pair with `onModeChange` (a route per mode, say). */
  mode?: AuthFormMode;
  /** The first mode, uncontrolled. Default `"sign-in"`. */
  defaultMode?: AuthFormMode;
  /** The form's links ("Create one", "Forgot password?", "Back to sign in") ask for a mode. */
  onModeChange?: (mode: AuthFormMode) => void;
  /**
   * How to sign in, in order: the first is shown, the rest are links under the
   * form. Default `["password"]`.
   */
  methods?: readonly AuthSignInMethod[];
  /**
   * Provider buttons. Ids or objects; `false` for none. Left out, the form asks
   * `client.providers()` (with Supabase: the providers turned on in the project).
   */
  providers?: ReadonlyArray<string | AuthFormProvider> | false;
  /** Offer "Create one", and let a magic link or code make an account. Default true. */
  allowSignUp?: boolean;
  /** Offer "Forgot password?" with the password method. Default true. */
  allowPasswordReset?: boolean;
  /** Signed in, signed up with a session, or a new password saved. Navigate from here. */
  onSuccess?: (result: AuthFormSuccess) => void;
  /** Initial email ("sign in as …" links). */
  initialEmail?: string;
  /** Digits in an emailed code. Default 6 (Supabase's default). */
  codeLength?: number;
  /** Seconds before a code can be sent again. Default 60 (Supabase's default rate limit). */
  resendCooldown?: number;
  /** For a new password. Default 8. Supabase Auth still applies its own rules. */
  minPasswordLength?: number;
  className?: string;
  /** Default `"auth-form"`; parts use `${testID}-email`, `-password`, `-submit`, `-error`, `-status`, `-code`, `-resend`, `-provider-<id>`. */
  testID?: string;
}

/** Brand names for provider ids Supabase Auth knows. Not translated. */
export const AUTH_PROVIDER_NAMES: Readonly<Record<string, string>> = {
  apple: "Apple",
  azure: "Microsoft",
  bitbucket: "Bitbucket",
  discord: "Discord",
  facebook: "Facebook",
  figma: "Figma",
  github: "GitHub",
  gitlab: "GitLab",
  google: "Google",
  kakao: "Kakao",
  keycloak: "Keycloak",
  linkedin_oidc: "LinkedIn",
  notion: "Notion",
  slack_oidc: "Slack",
  spotify: "Spotify",
  twitch: "Twitch",
  twitter: "X",
  workos: "WorkOS",
  zoom: "Zoom",
};

type Step = "form" | "code" | "sent";
type Sent = "magic-link" | "reset" | "confirm";
type Field = "email" | "password" | "confirm" | "code";
type AuthMessages = UiMessages["auth"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The copy for a failed call: the catalogue's for its code, else its own message, else the generic line. */
function errorCopy(error: AuthFormError, m: AuthMessages): string {
  const byCode = error.code ? (m.errors as Record<string, string>)[error.code] : undefined;
  return byCode ?? (error.message || m.errors.generic);
}

/**
 * The web sign-in form. See the file's header.
 *
 * ```tsx
 * const client = createAuthFormClient(supabase, { url, publishableKey, redirectTo: `${origin}/auth/callback` });
 * <AuthPage branding={{ headline: messages.auth.titles[mode] }}>
 *   <AuthForm client={client} mode={mode} onModeChange={setMode} methods={["password", "email-code"]} onSuccess={() => navigate("/")} />
 * </AuthPage>
 * ```
 *
 * @stability Beta
 */
export function AuthForm({
  client,
  mode: controlledMode,
  defaultMode = "sign-in",
  onModeChange,
  methods = DEFAULT_METHODS,
  providers: givenProviders,
  allowSignUp = true,
  allowPasswordReset = true,
  onSuccess,
  initialEmail = "",
  codeLength = 6,
  resendCooldown = 60,
  minPasswordLength = 8,
  className,
  testID = "auth-form",
}: AuthFormProps) {
  const m = useUiMessages().auth;
  const id = React.useId();
  const [ownMode, setOwnMode] = React.useState<AuthFormMode>(defaultMode);
  const mode = controlledMode ?? ownMode;
  const [method, setMethod] = React.useState<AuthSignInMethod>(methods[0] ?? "password");
  const [step, setStep] = React.useState<Step>("form");
  const [sent, setSent] = React.useState<Sent>("magic-link");
  const [email, setEmail] = React.useState(initialEmail);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<{ field?: Field; message: string } | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const providers = useProviders(client, givenProviders);
  const cooldown = useCooldown();

  // A controlled mode change from outside (a route) starts that mode fresh.
  const shownMode = React.useRef(mode);
  React.useEffect(() => {
    if (shownMode.current === mode) return;
    shownMode.current = mode;
    setStep("form");
    setError(null);
    setStatus(null);
    setPassword("");
    setConfirm("");
    setCode("");
  }, [mode]);

  const goTo = (next: AuthFormMode) => {
    if (controlledMode === undefined) setOwnMode(next);
    onModeChange?.(next);
  };

  /** Runs one call: one at a time, a throw reported and shown as fixed copy, the result's error shown. */
  const run = async (call: () => Promise<AuthFormResult>, field?: Field): Promise<AuthFormResult | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await call();
      if (result.error) {
        setError({ ...(field ? { field } : {}), message: errorCopy(result.error, m) });
        return null;
      }
      return result;
    } catch (e) {
      reportError(e, { source: "ui:auth-form", tags: { mode } });
      setError({ message: e instanceof TypeError ? m.errors.network : m.errors.generic });
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const fail = (field: Field, message: string) => setError({ field, message });

  /** The trimmed email, or null after showing why it won't do. */
  const checkedEmail = (): string | null => {
    const value = email.trim();
    const problem = !value ? m.errors.emailRequired : !EMAIL.test(value) ? m.errors.emailInvalid : null;
    if (problem) fail("email", problem);
    return problem ? null : value;
  };

  const checkNewPassword = (): boolean => {
    const problem = !password
      ? m.errors.passwordRequired
      : password.length < minPasswordLength
        ? fillMessage(m.errors.passwordTooShort, { min: minPasswordLength })
        : null;
    if (problem) fail("password", problem);
    return !problem;
  };

  const sendCode = async (address: string) => {
    const result = await run(() => client.sendEmailCode({ email: address, createUser: allowSignUp }), "email");
    if (!result) return false;
    cooldown.start(resendCooldown);
    return true;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    setError(null);
    if (mode === "new-password") {
      if (!checkNewPassword()) return;
      if (password !== confirm) return fail("confirm", m.errors.passwordMismatch);
      if (await run(() => client.updatePassword({ password }), "password")) {
        setStatus(m.passwordUpdated);
        onSuccess?.({ mode });
      }
      return;
    }
    if (step === "code") return verify(code);
    const address = checkedEmail();
    if (!address) return;
    if (mode === "forgot-password") {
      if (await run(() => client.sendPasswordReset({ email: address }), "email")) {
        setSent("reset");
        setStep("sent");
      }
      return;
    }
    if (mode === "sign-up") {
      if (!checkNewPassword()) return;
      const result = await run(() => client.signUp({ email: address, password }), "email");
      if (!result) return;
      if (result.confirmEmail) {
        setSent("confirm");
        setStep("sent");
      } else onSuccess?.({ mode, email: address });
      return;
    }
    if (method === "password") {
      if (!password) return fail("password", m.errors.passwordRequired);
      if (await run(() => client.signInWithPassword({ email: address, password }), "password")) {
        onSuccess?.({ mode, method, email: address });
      }
      return;
    }
    if (method === "magic-link") {
      if (await run(() => client.sendMagicLink({ email: address, createUser: allowSignUp }), "email")) {
        setSent("magic-link");
        setStep("sent");
      }
      return;
    }
    if (await sendCode(address)) {
      setCode("");
      setStep("code");
    }
  };

  const verify = async (value: string) => {
    if (value.length !== codeLength) return fail("code", fillMessage(m.errors.codeRequired, { length: codeLength }));
    if (await run(() => client.verifyEmailCode({ email: email.trim(), code: value }), "code")) {
      onSuccess?.({ mode, method: "email-code", email: email.trim() });
    } else setCode("");
  };

  const resend = async () => {
    if (cooldown.left > 0) return;
    if (await sendCode(email.trim())) setStatus(m.codeResent);
  };

  const startOver = () => {
    setStep("form");
    setError(null);
    setStatus(null);
    setCode("");
  };

  const errorId = `${id}-error`;
  /** aria-invalid and aria-describedby for a field: its hint, and the error when it is about this field. */
  const fieldProps = (field: Field, hintId?: string) => {
    const invalid = error?.field === field;
    const describedBy = [hintId, invalid ? errorId : undefined].filter(Boolean).join(" ");
    return { ...(invalid ? { "aria-invalid": true as const } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) };
  };
  const showProviders = step === "form" && (mode === "sign-in" || mode === "sign-up") && providers.length > 0;

  return (
    <div data-slot="auth-form" data-testid={testID} data-mode={mode} className={cn("flex min-w-0 flex-col gap-6", className)}>
      {showProviders ? (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label={m.providers} className="flex flex-col gap-2">
            {providers.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                className="w-full"
                testID={`${testID}-provider-${p.id}`}
                disabled={busy}
                onClick={() => void run(() => client.signInWithProvider(p.id))}
              >
                {p.icon}
                {p.label ?? fillMessage(m.continueWith, { provider: AUTH_PROVIDER_NAMES[p.id] ?? p.id })}
              </Button>
            ))}
          </div>
          <div aria-hidden className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <Separator className="flex-1" />
            {m.or}
            <Separator className="flex-1" />
          </div>
        </div>
      ) : null}

      {step === "sent" ? (
        <div className="flex flex-col gap-4 text-center">
          <div role="status" data-testid={`${testID}-status`} className="flex flex-col gap-2">
            <p className="font-medium">{m.checkEmailTitle}</p>
            <p className="text-sm text-muted-foreground">
              {fillMessage(sent === "reset" ? m.resetSent : sent === "confirm" ? m.confirmSent : m.magicLinkSent, { email: email.trim() })}
            </p>
          </div>
          {sent === "magic-link" ? (
            <Button type="button" variant="link" testID={`${testID}-start-over`} onClick={startOver}>
              {m.useDifferentEmail}
            </Button>
          ) : (
            <Button type="button" variant="link" testID={`${testID}-mode-sign-in`} onClick={() => {
                startOver();
                goTo("sign-in");
              }}>
              {m.backToSignIn}
            </Button>
          )}
        </div>
      ) : (
        <form noValidate aria-label={m.titles[mode]} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          {step === "code" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-code`}>{m.code}</Label>
              <InputOTP
                id={`${id}-code`}
                data-testid={`${testID}-code`}
                maxLength={codeLength}
                value={code}
                onChange={(value) => setCode(value.replace(/\D/g, ""))}
                onComplete={(value: string) => void verify(value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="^[0-9]+$"
                autoFocus
                disabled={busy}
                containerClassName="justify-center"
                {...fieldProps("code", `${id}-code-hint`)}
              >
                <InputOTPGroup>
                  {Array.from({ length: codeLength }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p id={`${id}-code-hint`} className="text-center text-sm text-muted-foreground">
                {fillMessage(m.codeSent, { length: codeLength, email: email.trim() })}
              </p>
            </div>
          ) : (
            <>
              {mode !== "new-password" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-email`}>{m.email}</Label>
                  <Input
                    id={`${id}-email`}
                    data-testid={`${testID}-email`}
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={m.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    required
                    {...fieldProps("email")}
                  />
                </div>
              ) : null}
              {(mode === "sign-in" && method === "password") || mode === "sign-up" || mode === "new-password" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`${id}-password`}>{mode === "new-password" ? m.newPassword : m.password}</Label>
                    {mode === "sign-in" && allowPasswordReset ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-sm"
                        testID={`${testID}-mode-forgot-password`}
                        onClick={() => goTo("forgot-password")}
                      >
                        {m.forgotPassword}
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    id={`${id}-password`}
                    data-testid={`${testID}-password`}
                    type="password"
                    name={mode === "sign-in" ? "password" : "new-password"}
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    required
                    {...(mode === "sign-in" ? {} : { minLength: minPasswordLength })}
                    {...fieldProps("password", mode === "sign-in" ? undefined : `${id}-password-hint`)}
                  />
                  {mode !== "sign-in" ? (
                    <p id={`${id}-password-hint`} className="text-sm text-muted-foreground">
                      {fillMessage(m.passwordHint, { min: minPasswordLength })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {mode === "new-password" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-confirm`}>{m.confirmPassword}</Label>
                  <Input
                    id={`${id}-confirm`}
                    data-testid={`${testID}-confirm`}
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    required
                    {...fieldProps("confirm")}
                  />
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p id={errorId} role="alert" data-testid={`${testID}-error`} className="text-sm font-medium text-destructive">
              {error.message}
            </p>
          ) : null}
          {status ? (
            <p role="status" data-testid={`${testID}-status`} className="text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}

          <Button type="submit" className="w-full" loading={busy} testID={`${testID}-submit`}>
            {submitLabel(mode, step, method, m)}
          </Button>

          {step === "code" ? (
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="link"
                testID={`${testID}-resend`}
                disabled={busy || cooldown.left > 0}
                onClick={() => void resend()}
              >
                {cooldown.left > 0 ? fillMessage(m.resendIn, { seconds: cooldown.left }) : m.resendCode}
              </Button>
              <Button type="button" variant="link" testID={`${testID}-start-over`} onClick={startOver}>
                {m.useDifferentEmail}
              </Button>
            </div>
          ) : (
            <FormLinks
              mode={mode}
              method={method}
              methods={methods}
              allowSignUp={allowSignUp}
              testID={testID}
              m={m}
              onMethod={(next) => {
                setMethod(next);
                setError(null);
              }}
              onMode={goTo}
            />
          )}
        </form>
      )}
    </div>
  );
}

const DEFAULT_METHODS: readonly AuthSignInMethod[] = ["password"];

function submitLabel(mode: AuthFormMode, step: Step, method: AuthSignInMethod, m: AuthMessages): string {
  if (step === "code") return m.verifyCode;
  if (mode === "sign-up") return m.signUp;
  if (mode === "forgot-password") return m.sendReset;
  if (mode === "new-password") return m.savePassword;
  return method === "magic-link" ? m.sendMagicLink : method === "email-code" ? m.sendCode : m.signIn;
}

function FormLinks({
  mode,
  method,
  methods,
  allowSignUp,
  testID,
  m,
  onMethod,
  onMode,
}: {
  mode: AuthFormMode;
  method: AuthSignInMethod;
  methods: readonly AuthSignInMethod[];
  allowSignUp: boolean;
  testID: string;
  m: AuthMessages;
  onMethod: (method: AuthSignInMethod) => void;
  onMode: (mode: AuthFormMode) => void;
}) {
  if (mode === "new-password") return null;
  const others = mode === "sign-in" ? methods.filter((x) => x !== method) : [];
  const methodLabel = { password: m.usePassword, "magic-link": m.useMagicLink, "email-code": m.useCode };
  return (
    <div className="flex flex-col items-center gap-1 text-sm">
      {others.map((x) => (
        <Button key={x} type="button" variant="link" testID={`${testID}-method-${x}`} onClick={() => onMethod(x)}>
          {methodLabel[x]}
        </Button>
      ))}
      {mode === "sign-in" && allowSignUp ? (
        <p className="text-muted-foreground">
          {m.noAccount}{" "}
          <Button type="button" variant="link" className="h-auto p-0" testID={`${testID}-mode-sign-up`} onClick={() => onMode("sign-up")}>
            {m.createAccount}
          </Button>
        </p>
      ) : null}
      {mode === "sign-up" ? (
        <p className="text-muted-foreground">
          {m.haveAccount}{" "}
          <Button type="button" variant="link" className="h-auto p-0" testID={`${testID}-mode-sign-in`} onClick={() => onMode("sign-in")}>
            {m.signIn}
          </Button>
        </p>
      ) : null}
      {mode === "forgot-password" ? (
        <Button type="button" variant="link" testID={`${testID}-mode-sign-in`} onClick={() => onMode("sign-in")}>
          {m.backToSignIn}
        </Button>
      ) : null}
    </div>
  );
}

/** The given providers, or the client's, asked once. A failed lookup shows none and is reported. */
function useProviders(client: AuthFormClient, given: AuthFormProps["providers"]): AuthFormProvider[] {
  const [found, setFound] = React.useState<AuthFormProvider[]>([]);
  const discover = given === undefined && typeof client.providers === "function";
  React.useEffect(() => {
    if (!discover) return;
    let live = true;
    client.providers!().then(
      (ids) => live && setFound(ids.map((id) => ({ id }))),
      (e: unknown) => reportError(e, { source: "ui:auth-form", tags: { step: "providers" } }),
    );
    return () => {
      live = false;
    };
  }, [client, discover]);
  if (given === false) return [];
  if (given) return given.map((p) => (typeof p === "string" ? { id: p } : p));
  return found;
}

/** Seconds left before the next send, ticking once a second while it counts. */
function useCooldown() {
  const [until, setUntil] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (until <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [until, now]);
  return {
    left: Math.max(0, Math.ceil((until - now) / 1000)),
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}
