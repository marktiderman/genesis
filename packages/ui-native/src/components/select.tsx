/**
 * Select — single-selection dropdown trigger + content.
 *
 * @stability Stable
 */
import { createContext, useContext, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { cn } from "../utils";

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelect() {
  const context = useContext(SelectContext);
  if (!context)
    throw new Error("Select components must be used within <NativeSelect>");
  return context;
}

export interface NativeSelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function NativeSelect({
  value: controlledValue,
  defaultValue = "",
  onValueChange: controlledOnValueChange,
  children,
}: NativeSelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const value = controlledValue ?? uncontrolledValue;
  const onValueChange = controlledOnValueChange ?? setUncontrolledValue;

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      {children}
    </SelectContext.Provider>
  );
}

export interface NativeSelectTriggerProps {
  className?: string;
  children?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
}

function NativeSelectTrigger({
  className,
  children,
  placeholder,
  disabled,
  ...props
}: NativeSelectTriggerProps) {
  const { value, open, setOpen } = useSelect();

  return (
    <Pressable
      className={cn(
        "h-10 flex-row items-center justify-between rounded-md border border-input bg-background px-3",
        disabled && "opacity-50",
        className
      )}
      onPress={() => setOpen(true)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ expanded: open, disabled }}
      {...props}
    >
      {children ?? (
        <Text
          className={cn(
            "text-sm",
            value ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {value || placeholder || "Select..."}
        </Text>
      )}
      <Text className="text-sm text-muted-foreground">{"\u25BE"}</Text>
    </Pressable>
  );
}

export interface NativeSelectContentProps {
  className?: string;
  children: React.ReactNode;
}

function NativeSelectContent({
  className,
  children,
}: NativeSelectContentProps) {
  const { open, setOpen } = useSelect();

  if (!open) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable className="flex-1 items-center justify-center bg-black/50" onPress={() => setOpen(false)}>
        {/* Intentional no-op: prevents overlay press from closing the modal when touching content area */}
        <Pressable onPress={() => {}}>
          <View
            className={cn(
              "min-w-[10rem] rounded-md border border-border bg-popover p-1 shadow-md",
              className
            )}
          >
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface NativeSelectItemProps {
  className?: string;
  value: string;
  children: React.ReactNode;
  testID?: string;
}

function NativeSelectItem({
  className,
  value,
  children,
  ...props
}: NativeSelectItemProps) {
  const { value: selectedValue, onValueChange, setOpen } = useSelect();
  const isSelected = selectedValue === value;

  return (
    <Pressable
      className={cn(
        "flex-row items-center rounded-sm px-2 py-1.5",
        isSelected && "bg-accent",
        className
      )}
      onPress={() => {
        onValueChange(value);
        setOpen(false);
      }}
      {...props}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            "text-sm",
            isSelected ? "text-accent-foreground" : "text-popover-foreground"
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

export {
  NativeSelect,
  NativeSelectTrigger,
  NativeSelectContent,
  NativeSelectItem,
};
