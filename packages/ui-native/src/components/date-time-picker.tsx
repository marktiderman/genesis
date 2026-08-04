/**
 * DatePicker / TimePicker — wraps @react-native-community/datetimepicker
 * with platform-correct UX (iOS wheel, Android calendar/clock dialog).
 *
 * NativeDatePicker exposes a date as a Pressable button labeled with the
 * formatted value; tapping presents the platform-native picker. Same
 * pattern for NativeTimePicker.
 *
 * Consumers must install @react-native-community/datetimepicker (peer
 * dep, marked optional). When the dep is missing, the component falls
 * back to a read-only Text label so screens still render — useful for
 * sample/demo apps without native module setup.
 *
 * @stability Beta
 */
import { useMemo, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { cn } from "../utils";

function resolveDateTimePicker(): React.ComponentType<{
  value: Date;
  mode: "date" | "time";
  display?: string;
  onChange: (e: unknown, d?: Date) => void;
  testID?: string;
}> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-community/datetimepicker").default;
  } catch {
    return null;
  }
}

interface BasePickerProps {
  value: Date;
  onChange: (next: Date) => void;
  /** Disable the picker. */
  disabled?: boolean;
  /** Override the rendered button text. */
  formatLabel?: (d: Date) => string;
  className?: string;
  testID?: string;
}

export type NativeDatePickerProps = BasePickerProps;
export type NativeTimePickerProps = BasePickerProps;

function PickerButton({
  value,
  onChange,
  mode,
  formatLabel,
  disabled,
  className,
  testID,
}: BasePickerProps & { mode: "date" | "time" }) {
  const Picker = resolveDateTimePicker();
  const [showAndroid, setShowAndroid] = useState(false);
  const isIOS = Platform.OS === "ios";

  const label = useMemo(() => {
    if (formatLabel) return formatLabel(value);
    if (mode === "date") return value.toDateString();
    return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [formatLabel, mode, value]);

  if (!Picker) {
    return (
      <Text
        testID={testID}
        className={cn(
          "min-h-[44px] rounded-md border border-input bg-background px-3 py-3 text-base text-muted-foreground",
          className
        )}
      >
        {label} (picker module not installed)
      </Text>
    );
  }

  // iOS: render the inline picker directly when consumer wants it that
  // way; default exposes a button that toggles a sheet-like dialog. For
  // simplicity in this primitive we render the button + the picker inline.
  return (
    <>
      <Pressable
        testID={testID ?? `native-${mode}-picker`}
        accessibilityRole="button"
        accessibilityLabel={`Pick a ${mode}`}
        accessibilityValue={{ text: label }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (!isIOS) setShowAndroid(true);
        }}
        className={cn(
          "min-h-[44px] flex-row items-center rounded-md border border-input bg-background px-3",
          disabled && "opacity-50",
          className
        )}
      >
        <Text className="flex-1 text-base text-foreground">{label}</Text>
      </Pressable>
      {(isIOS || showAndroid) ? (
        <Picker
          testID={testID ? `${testID}-picker` : undefined}
          value={value}
          mode={mode}
          display={isIOS ? "compact" : "default"}
          onChange={(_e, d) => {
            if (!isIOS) setShowAndroid(false);
            if (d) onChange(d);
          }}
        />
      ) : null}
    </>
  );
}

export function NativeDatePicker(props: NativeDatePickerProps) {
  return <PickerButton {...props} mode="date" />;
}

export function NativeTimePicker(props: NativeTimePickerProps) {
  return <PickerButton {...props} mode="time" />;
}
