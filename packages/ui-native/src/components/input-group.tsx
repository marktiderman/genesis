/**
 * InputGroup — a text field with content fixed inside its border: the twin of genesis-ui's
 * InputGroup (InputGroupPrefix / InputGroupSuffix). It is NativeInput with `leading` and
 * `trailing` (`prefix` and `suffix` here, as on the web), so it keeps the input's label, error
 * and placeholder colour.
 *
 * PasswordToggleField — a password field with a Show / Hide button that keeps the typed text:
 * the twin of genesis-ui's PasswordToggleField, on the same input group.
 *
 * @stability Beta
 */
import { useState, type ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { NativeInput, type NativeInputProps } from "./input";

export interface NativeInputGroupProps extends Omit<NativeInputProps, "leading" | "trailing"> {
  /** Before the text: an icon, "$", "https://". */
  prefix?: ReactNode;
  /** After the text: a unit, a button. */
  suffix?: ReactNode;
}

export function NativeInputGroup({ prefix, suffix, ...props }: NativeInputGroupProps) {
  const text = (node: ReactNode) =>
    typeof node === "string" || typeof node === "number" ? <Text className="text-base text-muted-foreground">{node}</Text> : node;
  return <NativeInput {...props} leading={prefix != null ? text(prefix) : undefined} trailing={suffix != null ? text(suffix) : undefined} />;
}

export interface NativePasswordToggleFieldProps extends Omit<NativeInputProps, "secureTextEntry" | "trailing"> {
  /** Shown (uncontrolled start). Default false: the password is hidden. */
  defaultVisible?: boolean;
  /** Shown, to control it. */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  /** The button's words. Default "Show password" / "Hide password" (read) and "Show" / "Hide" (shown). */
  labels?: { show?: string; hide?: string; showAccessible?: string; hideAccessible?: string };
}

export function NativePasswordToggleField({
  defaultVisible = false,
  visible: visibleProp,
  onVisibleChange,
  labels = {},
  testID,
  ...props
}: NativePasswordToggleFieldProps) {
  const [visibleState, setVisibleState] = useState(defaultVisible);
  const visible = visibleProp ?? visibleState;
  const toggle = () => {
    if (visibleProp === undefined) setVisibleState(!visible);
    onVisibleChange?.(!visible);
  };
  const id = testID ?? "native-password-field";
  return (
    <NativeInput
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      autoComplete="password"
      {...props}
      testID={id}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          testID={`${id}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={visible ? (labels.hideAccessible ?? "Hide password") : (labels.showAccessible ?? "Show password")}
          accessibilityState={{ checked: visible }}
          onPress={toggle}
          hitSlop={8}
          className="min-h-[36px] min-w-[44px] items-center justify-center px-2"
        >
          <Text className="text-sm font-medium text-primary-text">{visible ? (labels.hide ?? "Hide") : (labels.show ?? "Show")}</Text>
        </Pressable>
      }
    />
  );
}
