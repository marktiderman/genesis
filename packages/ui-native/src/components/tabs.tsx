/**
 * Tabs — top-level navigation between sibling views.
 *
 * @stability Stable
 */
import { createContext, useContext, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context)
    throw new Error("Tabs components must be used within <NativeTabs>");
  return context;
}

export interface NativeTabsProps {
  className?: string;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  testID?: string;
}

function NativeTabs({
  className,
  defaultValue,
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  children,
  ...props
}: NativeTabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const onValueChange = controlledOnValueChange ?? setUncontrolledValue;

  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <View className={cn("w-full", className)} {...props}>
        {children}
      </View>
    </TabsContext.Provider>
  );
}

export interface NativeTabsListProps {
  className?: string;
  children: React.ReactNode;
}

function NativeTabsList({ className, children }: NativeTabsListProps) {
  return (
    <View
      className={cn(
        "flex-row items-center rounded-md bg-muted p-1",
        className
      )}
      accessibilityRole="tablist"
    >
      {children}
    </View>
  );
}

export interface NativeTabsTriggerProps {
  className?: string;
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  testID?: string;
}

function NativeTabsTrigger({
  className,
  value,
  children,
  disabled,
  ...props
}: NativeTabsTriggerProps) {
  const { value: selectedValue, onValueChange } = useTabs();
  const isActive = selectedValue === value;

  return (
    <Pressable
      className={cn(
        "flex-1 items-center justify-center rounded-sm px-3 py-1.5",
        isActive && "bg-background shadow-sm",
        disabled && "opacity-50",
        className
      )}
      onPress={() => onValueChange(value)}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      {...props}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-sm font-medium",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export interface NativeTabsContentProps {
  className?: string;
  value: string;
  children: React.ReactNode;
}

function NativeTabsContent({
  className,
  value,
  children,
}: NativeTabsContentProps) {
  const { value: selectedValue } = useTabs();
  if (selectedValue !== value) return null;

  return (
    <View className={cn("mt-2", className)}>
      {children}
    </View>
  );
}

export {
  NativeTabs,
  NativeTabsList,
  NativeTabsTrigger,
  NativeTabsContent,
};
