"use client";

/**
 * AuthForm — the web sign-in form: sign in (password, magic link or emailed
 * code), sign up, forgot password and choose a new password, with provider
 * buttons. It sits inside `AuthPage`.
 *
 * It owns the steps and the words, not the auth: every call goes through the
 * `client` it is given (`AuthFormClient`). With Supabase that is
 * `createAuthFormClient(supabase, …)` from `@marktiderman/genesis-supabase`,
 * which also discovers the providers turned on in the project. Native's
 * `AuthForm` (genesis-ui-native) is a different component: it takes
 * `onSubmit` and `errorMessage` and makes no calls, and its `mode` means
 * `password` or `magic-link`, not this form's page modes.
 *
 * @stability Beta
 */
import * as React from "react";
import { isDevelopment, reportError } from "@marktiderman/genesis-core/errors";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { fillMessage, useUiMessages, type UiMessages } from "../../messages";
import { cn } from "../../utils";

/** What the form is for. Each mode's headline is `useUiMessages().auth.titles[mode]`. */
export type AuthFormMode = "sign-in" | "sign-up" | "forgot-password" | "new-password";

/**
 * How someone signs in in `"sign-in"` mode: with their email (a password, a link or a code), or
 * with a code texted to their phone (`"phone-code"`, which needs the client's `sendPhoneCode` and
 * `verifyPhoneCode`).
 */
export type AuthSignInMethod = "password" | "magic-link" | "email-code" | "phone-code";

/**
 * Why a call failed. `code` is Supabase Auth's error code (`invalid_credentials`,
 * `otp_expired`…) or the client's own; the form shows the catalogue's copy for
 * it (`auth.errors[code]`), else `auth.errors.generic`. `message` is shown only
 * when the client marks it `displayable`; otherwise it is the server's text,
 * which the form sends to `reportError` and never shows.
 */
export interface AuthFormError {
  code?: string | undefined;
  message?: string | undefined;
  /** The client wrote `message` for people to read: show it when the catalogue has no copy for `code`. */
  displayable?: boolean | undefined;
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
  /**
   * `createUser`: false when the form doesn't allow sign-up, so an unknown email gets no account.
   * Then the form treats `otp_disabled` (Supabase's answer for an unknown email) as sent, and says
   * "if … has an account", so it never tells which emails have accounts.
   */
  sendMagicLink(input: { email: string; createUser: boolean }): Promise<AuthFormResult>;
  sendEmailCode(input: { email: string; createUser: boolean }): Promise<AuthFormResult>;
  verifyEmailCode(input: { email: string; code: string }): Promise<AuthFormResult>;
  /** `data`: what `signUpFields` collected (the new user's metadata), present only when there are any. */
  signUp(input: { email: string; password: string; data?: Record<string, string> }): Promise<AuthFormResult>;
  sendPasswordReset(input: { email: string }): Promise<AuthFormResult>;
  /**
   * Needs a session: the one a reset link opens. Show `mode="new-password"` only after the
   * client's `PASSWORD_RECOVERY` event; without that session this fails (`session_not_found`).
   */
  updatePassword(input: { password: string }): Promise<AuthFormResult>;
  /** Usually leaves the page for the provider. */
  signInWithProvider(provider: string): Promise<AuthFormResult>;
  /** The provider ids turned on (`"google"`, `"apple"`…), when the form isn't given a list. */
  providers?(): Promise<string[]>;
  /** For the `"phone-code"` method: text a code to `phone` (E.164, `+15551234567`). `createUser` as for `sendEmailCode`. */
  sendPhoneCode?(input: { phone: string; createUser: boolean }): Promise<AuthFormResult>;
  /** For the `"phone-code"` method: check the texted code. */
  verifyPhoneCode?(input: { phone: string; code: string }): Promise<AuthFormResult>;
  /**
   * The signed-in person's email, for `mode="new-password"`: the form puts it beside the new
   * password (`autocomplete="username"`) so a password manager saves the pair. Null when unknown.
   */
  currentEmail?(): Promise<string | null | undefined>;
}

/**
 * A field on the sign-up form, beyond email and password. Its value goes to `signUp` as
 * `data[name]` (with Supabase: the user's metadata, which a signup trigger reads).
 */
export interface AuthFormSignUpField {
  /** The key in `data`: `"full_name"`, say. */
  name: string;
  label: string;
  /** Default `"text"`. */
  type?: "text" | "tel" | "url";
  /** Default `"off"`; `"name"` for a full name, `"organization"`, `"tel"`… */
  autoComplete?: string;
  placeholder?: string;
  /** The form asks for it before calling. Default false; an empty optional field is left out of `data`. */
  required?: boolean;
}

/** What a `signUpFields` slot gets: the values that go to `signUp` as `data`, and a setter. */
export interface AuthFormSignUpFieldsSlot {
  values: Readonly<Record<string, string>>;
  setValue: (name: string, value: string) => void;
  /** True while a call is open. */
  disabled: boolean;
}

/** Named sign-up fields: `"full_name"` (labelled `auth.fullName`, `autocomplete="name"`, required) or your own. */
export type AuthFormSignUpFieldSpec = "full_name" | AuthFormSignUpField;

/** A provider button. A plain id is enough for a known provider: the label is "Continue with Google". */
export interface AuthFormProvider {
  id: string;
  /** The button's whole label. Default `auth.continueWith` with the provider's name. */
  label?: string;
  icon?: React.ReactNode;
}

/**
 * Why the form is showing a notice: a reset link that expired, a provider sign-in the person
 * cancelled, an account just deleted. Each has default copy in `auth.notices`.
 */
export type AuthFormNoticeKind = "reset-link-expired" | "provider-cancelled" | "account-deleted";

/**
 * A notice above the form. A `kind` alone uses the catalogue's copy (`auth.notices[kind]`); a
 * `message` replaces it, or stands alone. `tone` defaults to `"error"` for an expired reset link
 * and `"info"` otherwise: an error is announced at once (`role="alert"`), info politely
 * (`role="status"`).
 */
export type AuthFormNotice =
  | { kind: AuthFormNoticeKind; message?: string; tone?: "info" | "error" }
  | { kind?: undefined; message: string; tone?: "info" | "error" };

/** What finished, for `onSuccess`. */
export interface AuthFormSuccess {
  mode: AuthFormMode;
  /** In `"sign-in"` mode: how. */
  method?: AuthSignInMethod;
  email?: string;
  /** With `"phone-code"`: the number signed in with. */
  phone?: string;
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
  /** Initial email ("sign in as …" links). In `mode="new-password"`, the account's email, when the client can't say (`currentEmail`). */
  initialEmail?: string;
  /**
   * Digits in an emailed code. Default 6 (Supabase's default). It must match the project's
   * `otp_length` (Auth settings, "Email OTP length"): the code field takes exactly this many
   * digits, so with a mismatch no code can ever be entered whole and code sign-in fails with
   * nothing to say why. `/auth/v1/settings` doesn't report `otp_length`, so the form can't check it.
   */
  codeLength?: number;
  /** Seconds before a code can be sent again. Default 60 (Supabase's default rate limit). */
  resendCooldown?: number;
  /** For a new password. Default 8. Supabase Auth still applies its own rules. */
  minPasswordLength?: number;
  /**
   * A notice above the form, on its first step: why the person is here again ("your reset link
   * has expired", "sign-in was cancelled", "your account is deleted"). A string is a message on
   * its own. Read it from the URL the callback sent them to, say.
   */
  notice?: AuthFormNotice | string | null;
  /**
   * Opt-in: on the "check your email" screens after a magic link and after sign-up, offer "Enter
   * the code instead", which opens the code step for the same email. For someone signing in from
   * an embedded browser (an in-app web view), where the link opens in another browser and they
   * would be stuck. Needs `"email-code"` in `methods` and `{{ .Token }}` in the project's Magic
   * Link and Confirm signup email templates. Default false.
   */
  offerCodeOnConfirm?: boolean;
  /**
   * Opt-in: more fields on the sign-up form, above the email, whose values go to `client.signUp`
   * as `data` (with Supabase, `options.data`: the user's metadata, which an app's signup trigger
   * reads as `full_name`, say). Named fields (`["full_name"]`, or your own), or a slot that draws
   * its own inputs and sets the values. Default none, and `signUp` gets no `data`.
   */
  signUpFields?: ReadonlyArray<AuthFormSignUpFieldSpec> | ((slot: AuthFormSignUpFieldsSlot) => React.ReactNode);
  /**
   * Opt-in: in `mode="new-password"`, show the account's email read-only above the new password.
   * Without it the email (when known, from `initialEmail` or `client.currentEmail()`) is still in
   * the form, hidden, with `autocomplete="username"`, so a password manager saves the pair.
   * Default false.
   */
  showAccountEmail?: boolean;
  className?: string;
  /** Default `"auth-form"`; parts use `${testID}-email`, `-phone`, `-password`, `-submit`, `-error`, `-status`, `-notice`, `-code`, `-resend`, `-enter-code`, `-provider-<id>`, `-field-<name>`, `-account-email`. */
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
type Field = "email" | "phone" | "password" | "confirm" | "code" | `field-${string}`;
type AuthMessages = UiMessages["auth"];

/**
 * A plausible email, in one pass (no backtracking regex): no whitespace, exactly
 * one `@` with something before it, and a domain with a dot that is neither its
 * first nor its last character. Auth checks the rest.
 */
function isPlausibleEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  const dot = domain.indexOf(".");
  return dot > 0 && !domain.endsWith(".");
}

/** A number as Auth takes it (E.164): spaces, dots, dashes and brackets dropped; null when it isn't `+` and 7 to 15 digits. */
function normalizedPhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : null;
}

/** The catalogue's copy for a code, if it has one. */
function catalogueCopy(code: string | undefined, m: AuthMessages): string | undefined {
  return code ? (m.errors as Record<string, string | undefined>)[code] : undefined;
}

/** The copy for a failed call: the catalogue's for its code, else a message the client marked displayable, else the generic line. */
function errorCopy(error: AuthFormError, m: AuthMessages): string {
  return catalogueCopy(error.code, m) ?? (error.displayable && error.message ? error.message : m.errors.generic);
}

/** The field a server error is about, by its code; none when it isn't about one. */
function errorField(code: string | undefined): Field | undefined {
  if (!code) return undefined;
  if (code === "weak_password" || code === "same_password") return "password";
  if (code.startsWith("email_") || code === "user_already_exists") return "email";
  if (code.startsWith("phone_") || code === "sms_send_failed") return "phone";
  if (code === "otp_expired") return "code";
  return undefined;
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
  methods: givenMethods = DEFAULT_METHODS,
  providers: givenProviders,
  allowSignUp = true,
  allowPasswordReset = true,
  onSuccess,
  initialEmail = "",
  codeLength = 6,
  resendCooldown = 60,
  minPasswordLength = 8,
  notice,
  offerCodeOnConfirm = false,
  signUpFields,
  showAccountEmail = false,
  className,
  testID = "auth-form",
}: AuthFormProps) {
  const m = useUiMessages().auth;
  const id = React.useId();
  const phoneReady = typeof client.sendPhoneCode === "function" && typeof client.verifyPhoneCode === "function";
  const methods = React.useMemo(
    () => (phoneReady ? givenMethods : givenMethods.filter((x) => x !== "phone-code")),
    [givenMethods, phoneReady],
  );
  const phoneMissing = !phoneReady && givenMethods.includes("phone-code");
  React.useEffect(() => {
    if (!phoneMissing || !isDevelopment()) return;
    // genesis-allow-console: a development-only hint for the developer, never shown to the person.
    console.warn('AuthForm: "phone-code" needs the client\'s sendPhoneCode and verifyPhoneCode; it is left out.');
  }, [phoneMissing]);
  const [ownMode, setOwnMode] = React.useState<AuthFormMode>(defaultMode);
  const mode = controlledMode ?? ownMode;
  const [method, setMethod] = React.useState<AuthSignInMethod>(methods[0] ?? "password");
  const [step, setStep] = React.useState<Step>("form");
  const [sent, setSent] = React.useState<Sent>("magic-link");
  const [email, setEmail] = React.useState(initialEmail);
  const [phone, setPhone] = React.useState("");
  const [extra, setExtra] = React.useState<Record<string, string>>({});
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<{ field?: Field; message: string } | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const sentHeading = React.useRef<HTMLHeadingElement>(null);
  const providers = useProviders(client, givenProviders);
  const cooldown = useCooldown();
  const hydrated = useHydrated();
  const codeOnConfirm = offerCodeOnConfirm && methods.includes("email-code");
  const accountEmail = useAccountEmail(client, mode, initialEmail);
  /** The code step is for a texted code: sign-in with `"phone-code"`. */
  const byPhone = mode === "sign-in" && method === "phone-code";
  const namedFields = Array.isArray(signUpFields) ? signUpFields.map((f) => signUpField(f, m)) : [];

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

  // "Check your email" replaces the form: move focus to its heading, so it is read and not lost.
  React.useEffect(() => {
    if (step === "sent") sentHeading.current?.focus();
  }, [step]);

  const goTo = (next: AuthFormMode) => {
    if (controlledMode === undefined) setOwnMode(next);
    onModeChange?.(next);
  };

  /**
   * Runs one call: one at a time, a throw reported and shown as fixed copy, the result's error shown
   * as the catalogue's copy and tied to the field its code is about. A code the catalogue has no copy
   * for is reported with the server's text, which is never shown.
   */
  const run = async (call: () => Promise<AuthFormResult>): Promise<AuthFormResult | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await call();
      if (result.error) {
        const { code, message, displayable } = result.error;
        if (!catalogueCopy(code, m) && !displayable) {
          reportError(new Error(message || "Auth call failed"), { source: "ui:auth-form", tags: { mode, code: code ?? "none" } });
        }
        const field = errorField(code);
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
    const problem = !value ? m.errors.emailRequired : !isPlausibleEmail(value) ? m.errors.emailInvalid : null;
    if (problem) fail("email", problem);
    return problem ? null : value;
  };

  /** The number in E.164, or null after showing why it won't do. */
  const checkedPhone = (): string | null => {
    const value = phone.trim();
    const normal = value ? normalizedPhone(value) : null;
    if (!normal) fail("phone", value ? m.errors.phoneInvalid : m.errors.phoneRequired);
    return normal;
  };

  /** What `signUpFields` collected, trimmed, empty ones left out; null after showing which required one is empty. */
  const signUpData = (): Record<string, string> | null => {
    const data: Record<string, string> = {};
    for (const [name, value] of Object.entries(extra)) if (value.trim()) data[name] = value.trim();
    const missing = namedFields.find((f) => f.required && !data[f.name]);
    if (missing) {
      fail(`field-${missing.name}`, fillMessage(m.errors.fieldRequired, { label: missing.label }));
      return null;
    }
    return data;
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

  /**
   * Without sign-up, Supabase answers an email with no account `otp_disabled`. Treat it as sent: the
   * copy says "if … has an account", and saying more would tell which emails have accounts.
   */
  const sentEvenIfUnknown = async (result: Promise<AuthFormResult>): Promise<AuthFormResult> => {
    const r = await result;
    if (allowSignUp || r.error?.code !== "otp_disabled") return r;
    if (isDevelopment()) {
      // The same code also comes back when email codes are off for the whole project, and then no
      // email is ever sent. Say so to the developer; never to the person signing in.
      // genesis-allow-console: a development-only hint for the developer, never shown to the person.
      console.warn(
        "AuthForm: Auth answered otp_disabled, shown as sent. If nothing arrives, check that email OTP (or, for a texted code, a phone provider) is on in the project's Auth settings.",
      );
    }
    return {};
  };

  /** Sends a code: texted, with `"phone-code"`, else emailed. */
  const sendCode = async (address: string) => {
    const result = await run(() =>
      sentEvenIfUnknown(
        byPhone && client.sendPhoneCode
          ? client.sendPhoneCode({ phone: address, createUser: allowSignUp })
          : client.sendEmailCode({ email: address, createUser: allowSignUp }),
      ),
    );
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
      if (await run(() => client.updatePassword({ password }))) {
        setStatus(m.passwordUpdated);
        onSuccess?.({ mode });
      }
      return;
    }
    if (step === "code") return verify(code);
    if (byPhone) {
      const number = checkedPhone();
      if (!number) return;
      setPhone(number);
      if (await sendCode(number)) {
        setCode("");
        setStep("code");
      }
      return;
    }
    const data = mode === "sign-up" && signUpFields ? signUpData() : {};
    if (!data) return;
    const address = checkedEmail();
    if (!address) return;
    if (mode === "forgot-password") {
      if (await run(() => client.sendPasswordReset({ email: address }))) {
        setSent("reset");
        setStep("sent");
      }
      return;
    }
    if (mode === "sign-up") {
      if (!checkNewPassword()) return;
      const result = await run(() => client.signUp({ email: address, password, ...(Object.keys(data).length ? { data } : {}) }));
      if (!result) return;
      if (result.confirmEmail) {
        if (codeOnConfirm) cooldown.start(resendCooldown);
        setSent("confirm");
        setStep("sent");
      } else onSuccess?.({ mode, email: address });
      return;
    }
    if (method === "password") {
      if (!password) return fail("password", m.errors.passwordRequired);
      if (await run(() => client.signInWithPassword({ email: address, password }))) {
        onSuccess?.({ mode, method, email: address });
      }
      return;
    }
    if (method === "magic-link") {
      if (await run(() => sentEvenIfUnknown(client.sendMagicLink({ email: address, createUser: allowSignUp })))) {
        // The same email carries the code, so "Enter the code instead" waits out the cooldown before a resend.
        if (codeOnConfirm) cooldown.start(resendCooldown);
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
    let rejected = false;
    const result = await run(async () => {
      const r =
        byPhone && client.verifyPhoneCode
          ? await client.verifyPhoneCode({ phone, code: value })
          : await client.verifyEmailCode({ email: email.trim(), code: value });
      rejected = r.error?.code === "otp_expired";
      return r;
    });
    if (result) {
      onSuccess?.(byPhone ? { mode, method: "phone-code", phone } : { mode, method: "email-code", email: email.trim() });
      return;
    }
    setCode("");
    if (rejected && isDevelopment()) {
      // A code of the wrong length is answered like a wrong one. Say so to the developer; never to the person.
      // genesis-allow-console: a development-only hint for the developer, never shown to the person.
      console.warn(
        `AuthForm: Auth refused a ${codeLength}-digit code (otp_expired). If every code fails, check that codeLength matches the project's otp_length (Auth settings, Email OTP length).`,
      );
    }
  };

  /** From "check your email": the same email's code, in the code step. */
  const enterCode = () => {
    setCode("");
    setError(null);
    setStatus(null);
    setStep("code");
  };

  const resend = async () => {
    if (cooldown.left > 0) return;
    if (await sendCode(byPhone ? phone : email.trim())) setStatus(m.codeResent);
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
  const shownNotice = step === "form" ? noticeOf(notice, m) : null;

  return (
    <div data-slot="auth-form" data-testid={testID} data-mode={mode} className={cn("flex min-w-0 flex-col gap-6", className)}>
      {shownNotice ? (
        <Alert
          role={shownNotice.tone === "error" ? "alert" : "status"}
          variant={shownNotice.tone === "error" ? "destructive" : "default"}
          data-testid={`${testID}-notice`}
          {...(shownNotice.kind ? { "data-kind": shownNotice.kind } : {})}
        >
          <AlertDescription>{shownNotice.message}</AlertDescription>
        </Alert>
      ) : null}
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
            <h2 ref={sentHeading} tabIndex={-1} data-testid={`${testID}-status-title`} className="font-medium outline-none">
              {m.checkEmailTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {fillMessage(
                sent === "reset"
                  ? m.resetSent
                  : sent === "confirm"
                    ? m.confirmSent
                    : allowSignUp
                      ? m.magicLinkSent
                      : m.magicLinkSentIfAccount,
                { email: email.trim() },
              )}
            </p>
          </div>
          {codeOnConfirm && sent !== "reset" ? (
            <Button type="button" variant="outline" testID={`${testID}-enter-code`} onClick={enterCode}>
              {m.enterCodeInstead}
            </Button>
          ) : null}
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
        // method="post": should a submit ever slip through before hydration, the email goes in the
        // body, never the URL. The submit stays disabled until then (below).
        <form noValidate method="post" aria-label={m.titles[mode]} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
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
                // Not disabled while it verifies: that would drop focus and the screen reader's place.
                readOnly={busy}
                {...(busy ? { "aria-busy": true as const } : {})}
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
                {byPhone
                  ? fillMessage(allowSignUp ? m.phoneCodeSent : m.phoneCodeSentIfAccount, { length: codeLength, phone })
                  : fillMessage(allowSignUp ? m.codeSent : m.codeSentIfAccount, { length: codeLength, email: email.trim() })}
              </p>
            </div>
          ) : (
            <>
              {mode === "sign-up" && typeof signUpFields === "function"
                ? signUpFields({ values: extra, setValue: (name, value) => setExtra((v) => ({ ...v, [name]: value })), disabled: busy })
                : null}
              {mode === "sign-up"
                ? namedFields.map((f) => (
                    <div key={f.name} className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-field-${f.name}`}>{f.label}</Label>
                      <Input
                        id={`${id}-field-${f.name}`}
                        data-testid={`${testID}-field-${f.name}`}
                        type={f.type ?? "text"}
                        name={f.name}
                        autoComplete={f.autoComplete ?? "off"}
                        {...(f.placeholder ? { placeholder: f.placeholder } : {})}
                        value={extra[f.name] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setExtra((v) => ({ ...v, [f.name]: value }));
                        }}
                        disabled={busy}
                        required={f.required ?? false}
                        {...fieldProps(`field-${f.name}`)}
                      />
                    </div>
                  ))
                : null}
              {mode === "new-password" && accountEmail ? (
                showAccountEmail ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`${id}-account-email`}>{m.email}</Label>
                    <Input
                      id={`${id}-account-email`}
                      data-testid={`${testID}-account-email`}
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={accountEmail}
                      readOnly
                    />
                  </div>
                ) : (
                  // Hidden, for the password manager: the account the new password belongs to.
                  <input
                    data-testid={`${testID}-account-email`}
                    type="email"
                    name="email"
                    autoComplete="username"
                    value={accountEmail}
                    readOnly
                    hidden
                  />
                )
              ) : null}
              {byPhone ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-phone`}>{m.phone}</Label>
                  <Input
                    id={`${id}-phone`}
                    data-testid={`${testID}-phone`}
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={m.phonePlaceholder}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={busy}
                    required
                    {...fieldProps("phone", `${id}-phone-hint`)}
                  />
                  <p id={`${id}-phone-hint`} className="text-sm text-muted-foreground">
                    {m.phoneHint}
                  </p>
                </div>
              ) : null}
              {mode !== "new-password" && !byPhone ? (
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

          {/*
            Until React hydrates a server-rendered page, the browser's own submit would send a GET
            and drop what was typed. A disabled default button stops both the click and Enter's
            implicit submit; it is drawn as enabled, so nothing changes on screen.
          */}
          <Button
            type="submit"
            className={cn("w-full", !hydrated && "disabled:opacity-100")}
            loading={busy}
            disabled={!hydrated}
            testID={`${testID}-submit`}
          >
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
                {byPhone ? m.useDifferentPhone : m.useDifferentEmail}
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

const noopSubscribe = () => () => {};

/**
 * False on the server and while React hydrates a server-rendered page, true from then on, and
 * true at once on a client-only render (no extra render, nothing that flips after mount).
 */
function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** The notice to show: its own message, else the catalogue's for its kind, with its tone. */
function noticeOf(
  notice: AuthFormNotice | string | null | undefined,
  m: AuthMessages,
): { kind?: AuthFormNoticeKind; message: string; tone: "info" | "error" } | null {
  if (!notice) return null;
  if (typeof notice === "string") return { message: notice, tone: "info" };
  const message = notice.message || (notice.kind ? m.notices[notice.kind] : "");
  if (!message) return null;
  const tone = notice.tone ?? (notice.kind === "reset-link-expired" ? "error" : "info");
  return { ...(notice.kind ? { kind: notice.kind } : {}), message, tone };
}

function submitLabel(mode: AuthFormMode, step: Step, method: AuthSignInMethod, m: AuthMessages): string {
  if (step === "code") return m.verifyCode;
  if (mode === "sign-up") return m.signUp;
  if (mode === "forgot-password") return m.sendReset;
  if (mode === "new-password") return m.savePassword;
  return method === "magic-link" ? m.sendMagicLink : method === "email-code" ? m.sendCode : method === "phone-code" ? m.sendPhoneCode : m.signIn;
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
  const methodLabel = { password: m.usePassword, "magic-link": m.useMagicLink, "email-code": m.useCode, "phone-code": m.usePhoneCode };
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

/**
 * The given providers, or the client's, asked once per mount: a parent that renders again, or
 * builds a new client object each render, doesn't ask again. To point the form at another
 * project, remount it (a `key`). A failed lookup shows none and is reported; a lookup still out
 * when the form unmounts is ignored.
 */
function useProviders(client: AuthFormClient, given: AuthFormProps["providers"]): AuthFormProvider[] {
  const [found, setFound] = React.useState<AuthFormProvider[]>([]);
  const discover = given === undefined && typeof client.providers === "function";
  const clientRef = React.useRef(client);
  React.useEffect(() => {
    clientRef.current = client;
  });
  React.useEffect(() => {
    if (!discover) return;
    let live = true;
    const lookup = clientRef.current.providers;
    if (!lookup) return;
    lookup.call(clientRef.current).then(
      (ids) => live && setFound(ids.map((id) => ({ id }))),
      (e: unknown) => reportError(e, { source: "ui:auth-form", tags: { step: "providers" } }),
    );
    return () => {
      live = false;
    };
  }, [discover]);
  if (given === false) return [];
  if (given) return given.map((p) => (typeof p === "string" ? { id: p } : p));
  return found;
}

/** A named sign-up field, the `"full_name"` preset filled in. */
function signUpField(spec: AuthFormSignUpFieldSpec, m: AuthMessages): AuthFormSignUpField {
  if (spec === "full_name") return { name: "full_name", label: m.fullName, autoComplete: "name", required: true };
  return spec;
}

/**
 * In `mode="new-password"`, the account's email: `initialEmail`, else `client.currentEmail()`,
 * asked once per mount. Empty when neither knows it.
 */
function useAccountEmail(client: AuthFormClient, mode: AuthFormMode, given: string): string {
  const [found, setFound] = React.useState("");
  const clientRef = React.useRef(client);
  React.useEffect(() => {
    clientRef.current = client;
  });
  const ask = mode === "new-password" && !given.trim() && typeof client.currentEmail === "function";
  React.useEffect(() => {
    if (!ask) return;
    let live = true;
    const lookup = clientRef.current.currentEmail;
    if (!lookup) return;
    lookup.call(clientRef.current).then(
      (value) => live && setFound(value?.trim() ?? ""),
      (e: unknown) => reportError(e, { source: "ui:auth-form", tags: { step: "current-email" } }),
    );
    return () => {
      live = false;
    };
  }, [ask]);
  if (mode !== "new-password") return "";
  return given.trim() || found;
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
