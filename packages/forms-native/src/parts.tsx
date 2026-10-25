/** Small parts the layout and renderers share. */
import { forwardRef, type ComponentRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import { Pressable, Text, type View } from "react-native";
import { useFormStyles } from "./styles";

export interface ButtonProps {
  children: string;
  onPress(): void;
  variant?: "primary" | "secondary" | "plain" | undefined;
  disabled?: boolean | undefined;
  /** Sending: disabled, and said to be busy. */
  busy?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  accessibilityHint?: string | undefined;
  testID?: string | undefined;
  icon?: ReactNode;
}

/** A button drawn from the theme: at least 48 points tall, and it grows with the text size. */
export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<ComponentRef<typeof View>>> = forwardRef<ComponentRef<typeof View>, ButtonProps>(function Button(
  { children, onPress, variant = "primary", disabled, busy, accessibilityLabel, accessibilityHint, testID, icon },
  ref,
) {
  const s = useFormStyles();
  const off = !!disabled || !!busy;
  return (
    <Pressable
      ref={ref}
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!busy }}
      style={({ pressed }) => [
        s.button,
        variant === "secondary" ? s.buttonSecondary : variant === "plain" ? s.buttonPlain : null,
        off ? s.buttonDisabled : null,
        pressed ? s.optionPressed : null,
      ]}
    >
      {icon}
      <Text style={[s.buttonText, variant === "secondary" ? s.buttonSecondaryText : variant === "plain" ? s.buttonPlainText : null]}>
        {children}
      </Text>
    </Pressable>
  );
});
