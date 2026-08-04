/**
 * Input — single-line text field.
 *
 * @stability Stable
 */
import { Text, TextInput, type TextInputProps, View } from "react-native";
import { nativeColors } from "@marktiderman/genesis-design-system/tokens/native";
import { cn } from "../utils";

export interface NativeInputProps extends TextInputProps {
  className?: string;
  inputClassName?: string;
  label?: string;
  error?: string;
}

function NativeInput({
  className,
  inputClassName,
  label,
  error,
  editable = true,
  placeholderTextColor,
  ...props
}: NativeInputProps) {
  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text className="text-sm font-medium text-foreground">
          {label}
        </Text>
      ) : null}
      <TextInput
        className={cn(
          "h-10 rounded-md border border-input bg-background px-3 text-base text-foreground",
          !editable && "opacity-50",
          error && "border-destructive",
          inputClassName
        )}
        editable={editable}
        placeholderTextColor={placeholderTextColor ?? nativeColors.neutral[400]}
        accessibilityLabel={label}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

export { NativeInput };
