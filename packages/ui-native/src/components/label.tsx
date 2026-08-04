/**
 * Label — form-control label, paired via htmlFor / nativeID.
 *
 * @stability Stable
 */
import { Text, type TextProps } from "react-native";
import { cn } from "../utils";

export interface NativeLabelProps extends TextProps {
  children: React.ReactNode;
  disabled?: boolean;
}

function NativeLabel({
  className,
  children,
  disabled,
  ...props
}: NativeLabelProps) {
  return (
    <Text
      className={cn(
        "text-sm font-medium text-foreground",
        disabled && "opacity-70",
        className
      )}
      accessibilityState={disabled ? { disabled } : undefined}
      {...props}
    >
      {children}
    </Text>
  );
}

export { NativeLabel };
