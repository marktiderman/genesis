/** Small parts the layout and renderers share. */
import { forwardRef, type ComponentRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import { Text, type View } from "react-native";
import { NativeButton } from "@marktiderman/genesis-ui-native/components";
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

const VARIANT = { primary: "default", secondary: "secondary", plain: "ghost" } as const;

/**
 * A form's button: genesis-ui-native's `NativeButton` (its press feedback and accessibility), sized
 * for a form (at least 48 points tall, growing with the text size) and colored from the form's
 * theme, so a host's `tint` still applies.
 *
 * @stability Beta
 */
export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<ComponentRef<typeof View>>> = forwardRef<ComponentRef<typeof View>, ButtonProps>(function Button(
  { children, onPress, variant = "primary", disabled, busy, accessibilityLabel, accessibilityHint, testID, icon },
  ref,
) {
  const s = useFormStyles();
  const off = !!disabled || !!busy;
  // NativeButton hands what it doesn't name (the ref, the style) to its Pressable.
  const pass = {
    ref,
    style: [s.button, variant === "secondary" ? s.buttonSecondary : variant === "plain" ? s.buttonPlain : null, off ? s.buttonDisabled : null],
  } as object;
  return (
    <NativeButton
      {...pass}
      variant={VARIANT[variant]}
      // The size variant's fixed height would cap `s.button`'s minHeight: the button grows with the text size.
      className="h-auto"
      {...(testID !== undefined ? { testID } : {})}
      onPress={onPress}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? children}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: off, busy: !!busy }}
    >
      {icon}
      <Text style={[s.buttonText, variant === "secondary" ? s.buttonSecondaryText : variant === "plain" ? s.buttonPlainText : null]}>
        {children}
      </Text>
    </NativeButton>
  );
});
