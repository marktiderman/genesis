/**
 * Switch — boolean toggle (iOS-style).
 *
 * @stability Stable
 */
import { Switch, type SwitchProps, View } from "react-native";
import { cn } from "../utils";

export interface NativeSwitchProps extends SwitchProps {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function NativeSwitch({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: NativeSwitchProps) {
  return (
    <View className={cn(disabled && "opacity-50", className)}>
      <Switch
        value={checked}
        onValueChange={onCheckedChange}
        disabled={disabled}
        accessibilityState={{ checked: checked, disabled }}
        {...props}
      />
    </View>
  );
}

export { NativeSwitch };
