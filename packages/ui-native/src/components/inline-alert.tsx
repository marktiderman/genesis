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
 * Both share variants: info / success / warning / destructive.
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
  success: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
};

export interface NativeInlineAlertProps extends BaseProps {}

export function NativeInlineAlert({
  variant = "info",
  title,
  description,
  icon,
  onDismiss,
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
