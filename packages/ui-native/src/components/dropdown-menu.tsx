/**
 * DropdownMenu — contextual list anchored to a trigger.
 *
 * @stability Stable
 */
import React, { createContext, useContext, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { cn } from "../utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext() {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu compound components must be used within NativeDropdownMenu");
  return ctx;
}

export interface NativeDropdownMenuProps {
  children: React.ReactNode;
}

function NativeDropdownMenu({ children }: NativeDropdownMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <View>{children}</View>
    </DropdownMenuContext.Provider>
  );
}

export interface NativeDropdownMenuTriggerProps {
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

function NativeDropdownMenuTrigger({
  className,
  children,
  ...props
}: NativeDropdownMenuTriggerProps) {
  const { setOpen } = useDropdownMenuContext();

  return (
    <Pressable className={cn(className)} onPress={() => setOpen(true)} {...props}>
      {children}
    </Pressable>
  );
}

export interface NativeDropdownMenuContentProps {
  className?: string;
  children: React.ReactNode;
}

function NativeDropdownMenuContent({
  className,
  children,
}: NativeDropdownMenuContentProps) {
  const { open, setOpen } = useDropdownMenuContext();

  if (!open) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable className="flex-1" onPress={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center">
          {/* Captures touch to prevent backdrop press from closing menu when tapping content */}
          <Pressable onPress={() => {}}>
            <View
              className={cn(
                "min-w-[8rem] rounded-md border border-border bg-popover p-1 shadow-md",
                className
              )}
            >
              {children}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export interface NativeDropdownMenuItemProps {
  className?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

function NativeDropdownMenuItem({
  className,
  children,
  onPress,
  disabled,
  ...props
}: NativeDropdownMenuItemProps) {
  return (
    <Pressable
      className={cn(
        "flex-row items-center rounded-sm px-2 py-1.5",
        disabled && "opacity-50",
        className
      )}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="menuitem"
      accessibilityState={{ disabled }}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm text-popover-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export {
  NativeDropdownMenu,
  NativeDropdownMenuTrigger,
  NativeDropdownMenuContent,
  NativeDropdownMenuItem,
};
