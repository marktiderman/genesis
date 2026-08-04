/**
 * EmptyState — what to show when a list / screen has no data.
 *
 * Three semantic variants drive default messaging:
 *   - "first-run": user has never had data here. Optimistic.
 *   - "no-results": user filtered/searched and got nothing. Suggest reset.
 *   - "error": fetching failed. Suggest retry.
 *
 * The variant only sets sensible defaults for `title` and tone — pass
 * your own `title`, `body`, `primaryAction`, `secondaryAction`, etc. to
 * override. Mirrors the @marktiderman/genesis-ui web `<EmptyState>` API where
 * possible (illustration vs icon slot, primary/secondary actions).
 *
 * @stability Beta
 */
import { Text, View } from "react-native";
import { cn } from "../utils";

export type NativeEmptyStateVariant = "first-run" | "no-results" | "error";

/**
 * Action descriptor for primary/secondary CTAs. Either pass a structured
 * object (renders a Pressable button via the consumer's button slot) or
 * pass an arbitrary node via `action` for maximum flexibility.
 */
export interface NativeEmptyStateAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface NativeEmptyStateProps {
  /** Variant drives default tone + default title. Default "first-run". */
  variant?: NativeEmptyStateVariant;
  /** Headline. Falls back to a variant-specific default. */
  title?: string;
  /** Body copy shown below the title. (Alias: `description`.) */
  body?: string;
  /**
   * @deprecated Prefer `body`. `description` remains for back-compat with
   * the original C3 API; both are accepted but `body` wins if both passed.
   */
  description?: string;
  /** Optional illustration (artwork node) above the title. */
  illustration?: React.ReactNode;
  /** Optional icon node above the title (use either icon or illustration). */
  icon?: React.ReactNode;
  /**
   * Primary CTA. When provided, the consumer is responsible for rendering
   * the button itself (we accept a node, not a label) so brand + token
   * styling is honored. The web API takes a `{label, onPress}` descriptor;
   * on native, prefer to pass a `<NativeButton>` directly to avoid
   * cross-package coupling.
   */
  primaryAction?: React.ReactNode;
  /** Secondary CTA, rendered below the primary. */
  secondaryAction?: React.ReactNode;
  /**
   * Free-form action slot. Equivalent to `primaryAction`; accepted for
   * back-compat with the C3 API. If both `action` and `primaryAction` are
   * passed, `primaryAction` wins.
   */
  action?: React.ReactNode;
  /**
   * Developer-facing error details. Only rendered when __DEV__ is true at
   * runtime (we infer by reading `process.env.NODE_ENV !== "production"`).
   */
  details?: string;
  className?: string;
  testID?: string;
}

const defaults: Record<NativeEmptyStateVariant, { title: string; tone: string }> = {
  "first-run": { title: "Nothing here yet", tone: "text-muted-foreground" },
  "no-results": { title: "No results", tone: "text-muted-foreground" },
  error: { title: "Something went wrong", tone: "text-destructive" },
};

export function NativeEmptyState({
  variant = "first-run",
  title,
  body,
  description,
  illustration,
  icon,
  primaryAction,
  secondaryAction,
  action,
  details,
  className,
  testID,
}: NativeEmptyStateProps) {
  const meta = defaults[variant];
  const resolvedBody = body ?? description;
  const resolvedPrimary = primaryAction ?? action;
  // Read NODE_ENV defensively — some bundlers don't define `process` at
  // runtime (e.g., RN classic), so we guard via globalThis. The `details`
  // slot is dev-only; we explicitly enumerate non-production values so an
  // undefined NODE_ENV doesn't accidentally leak diagnostic strings.
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process;
  const nodeEnv = proc?.env?.NODE_ENV;
  const isDev = nodeEnv === "development" || nodeEnv === "test";

  return (
    <View
      testID={testID ?? `empty-state-${variant}`}
      accessibilityRole="summary"
      className={cn(
        "items-center justify-center gap-3 px-8 py-12",
        className
      )}
    >
      {illustration ? <View accessibilityElementsHidden>{illustration}</View> : null}
      {icon && !illustration ? (
        <View accessibilityElementsHidden>{icon}</View>
      ) : null}
      <Text
        testID={testID ? `${testID}-title` : undefined}
        className={cn(
          "text-center text-lg font-semibold",
          variant === "error" ? "text-destructive" : "text-foreground"
        )}
      >
        {title ?? meta.title}
      </Text>
      {resolvedBody ? (
        <Text
          testID={testID ? `${testID}-body` : undefined}
          className={cn("max-w-sm text-center text-sm", meta.tone)}
        >
          {resolvedBody}
        </Text>
      ) : null}
      {resolvedPrimary ? (
        <View
          testID={testID ? `${testID}-primary-action` : undefined}
          className="mt-2"
        >
          {resolvedPrimary}
        </View>
      ) : null}
      {secondaryAction ? (
        <View
          testID={testID ? `${testID}-secondary-action` : undefined}
          className="mt-1"
        >
          {secondaryAction}
        </View>
      ) : null}
      {details && isDev ? (
        <Text
          testID={testID ? `${testID}-details` : undefined}
          className="mt-2 max-w-sm text-center text-xs text-muted-foreground"
        >
          {details}
        </Text>
      ) : null}
    </View>
  );
}
