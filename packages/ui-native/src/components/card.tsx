/**
 * Card — flat container surface. The 90% case is `<Card>{children}</Card>`. See HeaderCard for structured layouts.
 *
 * @stability Stable
 */
import { Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeCardProps {
  className?: string;
  children?: React.ReactNode;
  testID?: string;
}

function NativeCard({ className, children, ...props }: NativeCardProps) {
  return (
    <View
      className={cn(
        "rounded-xl border border-border bg-card p-0 shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
}

function NativeCardHeader({
  className,
  children,
  ...props
}: NativeCardProps) {
  return (
    <View className={cn("flex-col gap-1.5 p-6", className)} {...props}>
      {children}
    </View>
  );
}

export interface NativeCardTitleProps {
  className?: string;
  children?: React.ReactNode;
  testID?: string;
}

function NativeCardTitle({
  className,
  children,
  ...props
}: NativeCardTitleProps) {
  return (
    <Text
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight text-card-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Text>
  );
}

export interface NativeCardDescriptionProps {
  className?: string;
  children?: React.ReactNode;
  testID?: string;
}

function NativeCardDescription({
  className,
  children,
  ...props
}: NativeCardDescriptionProps) {
  return (
    <Text
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </Text>
  );
}

function NativeCardContent({
  className,
  children,
  ...props
}: NativeCardProps) {
  return (
    <View className={cn("p-6 pt-0", className)} {...props}>
      {children}
    </View>
  );
}

function NativeCardFooter({
  className,
  children,
  ...props
}: NativeCardProps) {
  return (
    <View
      className={cn("flex-row items-center p-6 pt-0", className)}
      {...props}
    >
      {children}
    </View>
  );
}

export {
  NativeCard,
  NativeCardHeader,
  NativeCardTitle,
  NativeCardDescription,
  NativeCardContent,
  NativeCardFooter,
};
