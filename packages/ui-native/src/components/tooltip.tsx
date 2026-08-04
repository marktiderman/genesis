/**
 * Tooltip — supplemental hint anchored to a trigger.
 *
 * @stability Stable
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

interface TooltipContextValue {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error("Tooltip compound components must be used within NativeTooltip");
  return ctx;
}

export interface NativeTooltipProps {
  children: React.ReactNode;
}

function NativeTooltip({ children }: NativeTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TooltipContext.Provider value={{ visible, setVisible }}>
      <View>{children}</View>
    </TooltipContext.Provider>
  );
}

export interface NativeTooltipTriggerProps {
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

function NativeTooltipTrigger({
  className,
  children,
  ...props
}: NativeTooltipTriggerProps) {
  const { setVisible } = useTooltipContext();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Pressable
      className={cn(className)}
      accessibilityRole="button"
      accessibilityLabel="Show tooltip"
      onLongPress={() => {
        setVisible(true);
        // Auto-hide after 2 seconds
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(false), 2000);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export interface NativeTooltipContentProps {
  className?: string;
  children: React.ReactNode;
}

function NativeTooltipContent({
  className,
  children,
}: NativeTooltipContentProps) {
  const { visible } = useTooltipContext();

  if (!visible) return null;

  return (
    <View
      className={cn(
        "absolute bottom-full left-0 mb-1 rounded-md bg-foreground px-3 py-1.5 shadow-md",
        className
      )}
    >
      {typeof children === "string" ? (
        <Text className="text-xs text-background">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export { NativeTooltip, NativeTooltipTrigger, NativeTooltipContent };
