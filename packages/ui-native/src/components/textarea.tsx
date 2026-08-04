/**
 * Textarea — multi-line text field.
 *
 * @stability Stable
 */
import { Text, TextInput, type TextInputProps, View } from "react-native";
import { nativeColors } from "@marktiderman/genesis-design-system/tokens/native";
import { cn } from "../utils";

export interface NativeTextareaProps extends TextInputProps {
  className?: string;
  inputClassName?: string;
  label?: string;
  error?: string;
  rows?: number;
}

function NativeTextarea({
  className,
  inputClassName,
  label,
  error,
  editable = true,
  rows = 4,
  placeholderTextColor,
  ...props
}: NativeTextareaProps) {
  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text className="text-sm font-medium text-foreground">{label}</Text>
      ) : null}
      <TextInput
        className={cn(
          "rounded-md border border-input bg-background px-3 py-2 text-base text-foreground",
          !editable && "opacity-50",
          error && "border-destructive",
          inputClassName
        )}
        multiline
        numberOfLines={rows}
        editable={editable}
        placeholderTextColor={placeholderTextColor ?? nativeColors.neutral[400]}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

export { NativeTextarea };
