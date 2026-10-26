/**
 * @feat:chat
 * A 44-point icon button (a header's Search, the topic bar's options): genesis-ui-native's
 * NativeIcon in a Pressable with its label, for VoiceOver and TalkBack.
 */
import { Pressable } from "react-native";
import { NativeIcon, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";

export interface ChatIconButtonProps {
  icon: NativeIconName;
  /** Read by screen readers (the button has no text). */
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** The theme's tint by default. */
  color?: unknown;
  size?: number;
  testID?: string;
}

export function ChatIconButton({ icon, label, onPress, onLongPress, disabled = false, color, size = 22, testID }: ChatIconButtonProps) {
  const colors = useThemeRoles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={4}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <NativeIcon name={icon} size={size} color={(color ?? colors.tint) as string} />
    </Pressable>
  );
}
