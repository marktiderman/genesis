/**
 * InlineAlert + Banner — non-blocking system messaging.
 *
 * NativeInlineAlert: contextual message that lives inline with related
 * content (e.g., between form fields).
 *
 * NativeBanner: top-of-screen system message (e.g., "You're offline").
 * Persists until the user dismisses or the condition clears. Use
 * sparingly — for transient confirmation use <NativeToast>; for
 * blocking issues use <NativeDialog>.
 *
 * Both share variants: info / success / warning / destructive. Under the
 * description, `children` takes any content (an error summary's list of
 * links, a status line) and `actions` a row of buttons ("Retry", "Review"),
 * so neither has to be drawn by hand around the alert.
 *
 * @stability Beta
 */
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export type NativeInlineAlertVariant =
  | "info"
  | "success"
  | "warning"
  | "destructive";

interface BaseProps {
  variant?: NativeInlineAlertVariant;
  title?: string;
  description?: string;
  /** Optional icon node rendered to the left of the text. */
  icon?: React.ReactNode;
  /** When provided, renders an "✕" dismiss button with this label. */
  onDismiss?: () => void;
  /** Content under the description (a list of the fields to fix, a status line). */
  children?: React.ReactNode;
  /** A row of buttons under the content (NativeButton size="sm"). */
  actions?: React.ReactNode;
  className?: string;
  testID?: string;
}

const variantClasses: Record<NativeInlineAlertVariant, string> = {
  info: "bg-secondary border-border",
  success: "bg-primary/10 border-primary/30",
  warning: "bg-warning/10 border-warning/30",
  destructive: "bg-destructive/10 border-destructive/30",
};

const titleClasses: Record<NativeInlineAlertVariant, string> = {
  info: "text-foreground",
  success: "text-primary-text",
  // The warning token is an amber that reads at about 2:1 on the tint, under the 4.5:1 text
  // needs: the tint and border carry the warning, as on the web's InlineAlert.
  warning: "text-foreground",
  destructive: "text-destructive",
};

/** The alert's content and actions slots, under the description. */
function AlertExtras({ children, actions, testID }: { children?: React.ReactNode; actions?: React.ReactNode; testID?: string | undefined }) {
  return (
    <>
      {children ? (
        <View testID={testID ? `${testID}-content` : undefined} className="mt-2">
          {children}
        </View>
      ) : null}
      {actions ? (
        <View testID={testID ? `${testID}-actions` : undefined} className="mt-3 flex-row flex-wrap gap-2">
          {actions}
        </View>
      ) : null}
    </>
  );
}

export interface NativeInlineAlertProps extends BaseProps {}

export function NativeInlineAlert({
  variant = "info",
  title,
  description,
  icon,
  onDismiss,
  children,
  actions,
  className,
  testID,
}: NativeInlineAlertProps) {
  return (
    <View
      testID={testID ?? `inline-alert-${variant}`}
      accessibilityRole="alert"
      className={cn(
        "flex-row gap-3 rounded-md border p-3",
        variantClasses[variant],
        className
      )}
    >
      {icon ? <View className="pt-0.5">{icon}</View> : null}
      <View className="flex-1">
        {title ? (
          <Text className={cn("text-sm font-semibold", titleClasses[variant])}>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text className="mt-0.5 text-sm text-foreground/80">
            {description}
          </Text>
        ) : null}
        <AlertExtras testID={testID} actions={actions}>
          {children}
        </AlertExtras>
      </View>
      {onDismiss ? (
        <Pressable
          testID={testID ? `${testID}-dismiss` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          className="min-h-[24px] min-w-[24px] items-center justify-center"
        >
          <Text className="text-base text-muted-foreground">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface NativeBannerProps extends BaseProps {}

export function NativeBanner({
  variant = "info",
  title,
  description,
  icon,
  onDismiss,
  children,
  actions,
  className,
  testID,
}: NativeBannerProps) {
  return (
    <View
      testID={testID ?? `banner-${variant}`}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn(
        "flex-row items-start gap-3 border-b px-4 py-3",
        variantClasses[variant],
        className
      )}
    >
      {icon ? <View className="pt-0.5">{icon}</View> : null}
      <View className="flex-1">
        {title ? (
          <Text className={cn("text-sm font-semibold", titleClasses[variant])}>
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text className="mt-0.5 text-sm text-foreground/80">
            {description}
          </Text>
        ) : null}
        <AlertExtras testID={testID} actions={actions}>
          {children}
        </AlertExtras>
      </View>
      {onDismiss ? (
        <Pressable
          testID={testID ? `${testID}-dismiss` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          className="min-h-[24px] min-w-[24px] items-center justify-center"
        >
          <Text className="text-base text-muted-foreground">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
