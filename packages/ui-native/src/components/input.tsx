/**
 * Input — single-line text field.
 *
 * @stability Stable
 */
import type { ComponentRef, Ref } from "react";
import { Text, TextInput, type TextInputProps, View } from "react-native";
import { nativeColors } from "@marktiderman/genesis-design-system/tokens/native";
import { cn } from "../utils";

export interface NativeInputProps extends TextInputProps {
  className?: string;
  inputClassName?: string;
  label?: string;
  error?: string;
  /**
   * Content fixed before the text, inside the field's border: an icon, a currency sign, "https://".
   * With `leading` or `trailing` the field is an input group (NativeInputGroup).
   */
  leading?: React.ReactNode;
  /** Content fixed after the text, inside the field's border: a unit, a clear or show button. */
  trailing?: React.ReactNode;
  /** The underlying TextInput (React 19 passes `ref` as a prop). */
  ref?: Ref<ComponentRef<typeof TextInput>> | undefined;
}

function NativeInput({
  className,
  inputClassName,
  label,
  error,
  editable = true,
  placeholderTextColor,
  leading,
  trailing,
  ...props
}: NativeInputProps) {
  const grouped = leading != null || trailing != null;
  const input = (
    <TextInput
      className={cn(
        "h-10 rounded-md border border-input bg-background px-3 text-base text-foreground",
        !editable && !grouped && "opacity-50",
        error && "border-destructive",
        grouped && "h-full min-w-0 flex-1 border-0 bg-transparent",
        inputClassName
      )}
      editable={editable}
      placeholderTextColor={placeholderTextColor ?? nativeColors.neutral[400]}
      accessibilityLabel={label}
      {...props}
    />
  );
  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text className="text-sm font-medium text-foreground">
          {label}
        </Text>
      ) : null}
      {grouped ? (
        <View
          className={cn(
            "h-10 flex-row items-center rounded-md border border-input bg-background",
            !editable && "opacity-50",
            error && "border-destructive"
          )}
        >
          {leading != null ? <View className="pl-3">{leading}</View> : null}
          {input}
          {trailing != null ? <View className="pr-1">{trailing}</View> : null}
        </View>
      ) : (
        input
      )}
      {error ? (
        <Text className="text-sm text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

export { NativeInput };
