/**
 * InputGroup — a text field with content fixed inside its border: the twin of genesis-ui's
 * InputGroup (InputGroupPrefix / InputGroupSuffix). It is NativeInput with `leading` and
 * `trailing` (`prefix` and `suffix` here, as on the web), so it keeps the input's label, error
 * and placeholder colour.
 *
 * PasswordToggleField — a password field with a Show / Hide button that keeps the typed text:
 * the twin of genesis-ui's PasswordToggleField, on the same input group. Toggling keeps the cursor
 * where it was (Android otherwise moves it to the start). On iOS, the system clears a hidden
 * password field when typing resumes after it was shown and hidden again; that rule is the OS's
 * (it guards against a shoulder-surfed edit), and the field follows it.
 *
 * @stability Beta
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { NativeInput, type NativeInputProps } from "./input";

type Selection = { start: number; end: number };

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
  onSelectionChange,
  onChangeText,
  ...props
}: NativePasswordToggleFieldProps) {
  const [visibleState, setVisibleState] = useState(defaultVisible);
  const visible = visibleProp ?? visibleState;
  // The cursor, kept so a toggle can put it back; held only until the person moves it or types.
  const selection = useRef<Selection | null>(null);
  const [restore, setRestore] = useState<Selection | null>(null);
  const toggle = () => {
    if (selection.current) setRestore(selection.current);
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
      {...(restore ? { selection: restore } : {})}
      onSelectionChange={(e) => {
        selection.current = e.nativeEvent.selection;
        if (restore && (e.nativeEvent.selection.start !== restore.start || e.nativeEvent.selection.end !== restore.end)) setRestore(null);
        onSelectionChange?.(e);
      }}
      onChangeText={(text) => {
        if (restore) setRestore(null);
        onChangeText?.(text);
      }}
      trailing={
        <Pressable
          testID={`${id}-toggle`}
          accessibilityRole="button"
          // A plain button whose name says what it does next; no checked state, which VoiceOver reads as a checkbox's.
          accessibilityLabel={visible ? (labels.hideAccessible ?? "Hide password") : (labels.showAccessible ?? "Show password")}
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
