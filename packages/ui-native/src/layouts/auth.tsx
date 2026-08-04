/**
 * Auth primitive group (PRD-07 simplification #3).
 *
 * Auth flows are the most consumer-divergent screen in any app. Instead
 * of shipping a god-component with a sea of variants, Genesis ships
 * three small primitives that consumers compose on a regular `<View>`:
 *
 *   - <AuthBranding>   — slot for branded logo + headline + subhead
 *   - <SocialAuthRow>  — provider buttons (Apple / Google / GitHub / …)
 *   - <AuthForm>       — email + password (or magic link) + submit
 *
 * Composition lives in `apps/<consumer>/...` — see
 * `standards/usage-doctrine.md` § Auth composition for worked examples.
 *
 * @stability Beta
 */
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeButton } from "../components/button";
import { NativeInput } from "../components/input";
import { NativeText } from "../components/text";
import { cn } from "../utils";

// ---------------------------------------------------------------------------
// AuthBranding — branding slot above the form
// ---------------------------------------------------------------------------

export interface AuthBrandingProps {
  /** Brand mark (logo node). */
  logo?: ReactNode;
  /** Headline text. Renders as h1. */
  headline?: string;
  /** Subhead under the headline. Renders as muted body. */
  subhead?: string;
  /** Override the root container styling. */
  className?: string;
  testID?: string;
}

export function AuthBranding({
  logo,
  headline,
  subhead,
  className,
  testID = "auth-branding",
}: AuthBrandingProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="header"
      className={cn("items-center gap-3 pb-8", className)}
    >
      {logo ? (
        <View testID={`${testID}-logo`} className="mb-2">
          {logo}
        </View>
      ) : null}
      {headline ? (
        <NativeText
          preset="h1"
          testID={`${testID}-headline`}
          className="text-center"
        >
          {headline}
        </NativeText>
      ) : null}
      {subhead ? (
        <NativeText
          preset="body"
          testID={`${testID}-subhead`}
          className="text-center text-muted-foreground"
        >
          {subhead}
        </NativeText>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SocialAuthRow — provider buttons
// ---------------------------------------------------------------------------

export type SocialAuthProvider = {
  /** Stable id used as React key + testID suffix. */
  id: string;
  /** Visible label, e.g., "Continue with Apple". */
  label: string;
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Press handler. */
  onPress: () => void | Promise<void>;
  /** When true, the button is disabled (e.g., loading). */
  disabled?: boolean;
};

export interface SocialAuthRowProps {
  providers: SocialAuthProvider[];
  /**
   * Optional separator label rendered between social row and the form
   * below (e.g., "or"). Pass `null` to suppress. Default `"or"`.
   */
  separator?: string | null;
  /** Override root container styling. */
  className?: string;
  testID?: string;
}

export function SocialAuthRow({
  providers,
  separator = "or",
  className,
  testID = "social-auth-row",
}: SocialAuthRowProps) {
  if (providers.length === 0) return null;
  return (
    <View testID={testID} className={cn("gap-3", className)}>
      <View className="gap-2">
        {providers.map((p) => (
          <NativeButton
            key={p.id}
            testID={`${testID}-${p.id}`}
            variant="outline"
            disabled={p.disabled}
            onPress={() => {
              void p.onPress();
            }}
          >
            <View className="flex-row items-center gap-2">
              {p.icon}
              <Text className="text-sm font-medium text-foreground">
                {p.label}
              </Text>
            </View>
          </NativeButton>
        ))}
      </View>
      {separator !== null && separator !== undefined ? (
        <View
          testID={`${testID}-separator`}
          className="my-2 flex-row items-center gap-3"
          accessibilityElementsHidden
        >
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs uppercase tracking-wider text-muted-foreground">
            {separator}
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AuthForm — email + password (or magic link) + submit
// ---------------------------------------------------------------------------

export interface AuthFormValues {
  email: string;
  /** Empty string when `mode === "magic-link"`. */
  password: string;
}

export interface AuthFormProps {
  /**
   * `"password"` (default) renders email + password.
   * `"magic-link"` renders email only and the submit button label
   * defaults to "Send magic link".
   */
  mode?: "password" | "magic-link";
  /** Submit handler. Receives the current form values. */
  onSubmit: (values: AuthFormValues) => void | Promise<void>;
  /**
   * Optional validation slot — return `null` to allow submission, or a
   * string error message to block. Called on every submit.
   */
  validate?: (values: AuthFormValues) => string | null;
  /** Override the submit button label. */
  submitLabel?: string;
  /** When true, submit button is disabled and shows a busy indicator. */
  loading?: boolean;
  /**
   * Top-level error (set by the consumer after a server-side rejection,
   * e.g., "Invalid credentials"). Shown above the submit button.
   */
  errorMessage?: string;
  /** Initial email. Useful for "log in as <user>" deep links. */
  initialEmail?: string;
  /** Slot rendered AFTER the inputs but BEFORE the submit (e.g., "Forgot password" link). */
  belowFields?: ReactNode;
  /** Override root container styling. */
  className?: string;
  testID?: string;
}

export function AuthForm({
  mode = "password",
  onSubmit,
  validate,
  submitLabel,
  loading,
  errorMessage,
  initialEmail = "",
  belowFields,
  className,
  testID = "auth-form",
}: AuthFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isMagic = mode === "magic-link";
  const resolvedSubmitLabel =
    submitLabel ?? (isMagic ? "Send magic link" : "Sign in");

  const handleSubmit = useCallback(async () => {
    // Guard against double-tap and stacked submits — the user's onSubmit
    // is async, so we own a local `submitting` flag in addition to the
    // parent-controlled `loading` prop.
    if (submitting || loading) return;

    setLocalError(null);
    const values: AuthFormValues = {
      email: email.trim(),
      password: isMagic ? "" : password,
    };
    if (validate) {
      const err = validate(values);
      if (err) {
        setLocalError(err);
        return;
      }
    }
    if (!values.email) {
      setLocalError("Email is required");
      return;
    }
    if (!isMagic && !values.password) {
      setLocalError("Password is required");
      return;
    }

    // Await the consumer's onSubmit so we surface unhandled rejections
    // as a local error string instead of dropping them on the floor.
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, isMagic, validate, onSubmit, submitting, loading]);

  const visibleError = errorMessage ?? localError ?? null;

  return (
    <View testID={testID} className={cn("gap-3", className)}>
      <View className="gap-1">
        <Text className="text-sm font-medium text-foreground">Email</Text>
        <NativeInput
          testID={`${testID}-email`}
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType={isMagic ? "send" : "next"}
          editable={!loading && !submitting}
          // In magic-link mode the email field is the last input, so the
          // return key dispatches submit. In password mode the next return
          // moves focus to password (default RN behavior); the password
          // field's onSubmitEditing handles the actual send.
          onSubmitEditing={isMagic ? handleSubmit : undefined}
        />
      </View>

      {isMagic ? null : (
        <View className="gap-1">
          <Text className="text-sm font-medium text-foreground">Password</Text>
          <NativeInput
            testID={`${testID}-password`}
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            editable={!loading && !submitting}
            onSubmitEditing={handleSubmit}
          />
        </View>
      )}

      {belowFields}

      {visibleError ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          className="text-sm text-destructive"
        >
          {visibleError}
        </Text>
      ) : null}

      <NativeButton
        testID={`${testID}-submit`}
        onPress={() => {
          void handleSubmit();
        }}
        loading={loading || submitting}
        disabled={loading || submitting}
      >
        {resolvedSubmitLabel}
      </NativeButton>
    </View>
  );
}

// Convenience: a "Forgot password?" link consumers can drop into the
// `belowFields` slot. Kept as a simple Pressable so it inherits brand
// tokens via the consumer's tailwind config.
export function ForgotPasswordLink({
  onPress,
  label = "Forgot password?",
  testID = "auth-forgot-password",
}: {
  onPress: () => void;
  label?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      className="self-end"
    >
      <Text className="text-sm font-medium text-primary">{label}</Text>
    </Pressable>
  );
}
