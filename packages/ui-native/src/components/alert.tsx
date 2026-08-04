/**
 * Alert — inline status message (info / success / warning / destructive).
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { Text, View } from "react-native";
import { cn } from "../utils";

const alertVariants = cva(
  "rounded-lg border p-4",
  {
    variants: {
      variant: {
        default: "border-border bg-background",
        destructive: "border-destructive/50 bg-destructive/10",
        success: "border-success/50 bg-success/10",
        warning: "border-warning/50 bg-warning/10",
        info: "border-info/50 bg-info/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const alertTitleTextVariants = cva("text-base font-semibold leading-6", {
  variants: {
    variant: {
      default: "text-foreground",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
      info: "text-info",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const alertDescriptionTextVariants = cva("text-sm leading-5", {
  variants: {
    variant: {
      default: "text-muted-foreground",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
      info: "text-info",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface NativeAlertProps
  extends VariantProps<typeof alertVariants> {
  className?: string;
  children?: React.ReactNode;
  testID?: string;
}

function NativeAlert({
  className,
  variant,
  children,
  ...props
}: NativeAlertProps) {
  return (
    <View
      className={cn(alertVariants({ variant }), className)}
      accessibilityRole="alert"
      {...props}
    >
      {children}
    </View>
  );
}

export interface NativeAlertTitleProps {
  className?: string;
  children?: React.ReactNode;
  variant?: VariantProps<typeof alertTitleTextVariants>["variant"];
}

function NativeAlertTitle({
  className,
  variant,
  children,
}: NativeAlertTitleProps) {
  return (
    <Text
      className={cn(alertTitleTextVariants({ variant }), className)}
    >
      {children}
    </Text>
  );
}

export interface NativeAlertDescriptionProps {
  className?: string;
  children?: React.ReactNode;
  variant?: VariantProps<typeof alertDescriptionTextVariants>["variant"];
}

function NativeAlertDescription({
  className,
  variant,
  children,
}: NativeAlertDescriptionProps) {
  return (
    <Text
      className={cn(
        alertDescriptionTextVariants({ variant }),
        "mt-1",
        className
      )}
    >
      {children}
    </Text>
  );
}

export {
  NativeAlert,
  NativeAlertTitle,
  NativeAlertDescription,
  alertVariants,
};
