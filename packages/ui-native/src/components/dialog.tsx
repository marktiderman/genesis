/**
 * Dialog — modal overlay for confirmations and short forms.
 *
 * @stability Stable
 */
import { Modal, Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function NativeDialog({ open, onOpenChange, children }: NativeDialogProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange?.(false)}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50"
        onPress={() => onOpenChange?.(false)}
      >
        {/* Captures touch to prevent backdrop press from closing dialog when tapping content */}
        <Pressable onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface NativeDialogContentProps {
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

function NativeDialogContent({
  className,
  children,
  ...props
}: NativeDialogContentProps) {
  return (
    <View
      className={cn(
        "w-80 gap-4 rounded-lg border border-border bg-background p-6 shadow-lg",
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
}

export interface NativeDialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

function NativeDialogHeader({
  className,
  children,
}: NativeDialogHeaderProps) {
  return (
    <View className={cn("gap-1.5", className)}>
      {children}
    </View>
  );
}

export interface NativeDialogTitleProps {
  className?: string;
  children: React.ReactNode;
}

function NativeDialogTitle({
  className,
  children,
}: NativeDialogTitleProps) {
  return (
    <Text className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </Text>
  );
}

export interface NativeDialogDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

function NativeDialogDescription({
  className,
  children,
}: NativeDialogDescriptionProps) {
  return (
    <Text className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

export interface NativeDialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

function NativeDialogFooter({
  className,
  children,
}: NativeDialogFooterProps) {
  return (
    <View className={cn("flex-row justify-end gap-2", className)}>
      {children}
    </View>
  );
}

export {
  NativeDialog,
  NativeDialogContent,
  NativeDialogHeader,
  NativeDialogTitle,
  NativeDialogDescription,
  NativeDialogFooter,
};
