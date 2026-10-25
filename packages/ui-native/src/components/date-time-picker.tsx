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
 * Optional backend: pass `@expo/ui`'s drop-in picker as `modules.datePicker`
 * (`import DateTimePicker from "@expo/ui/community/datetime-picker"`) on
 * `GenesisModulesProvider` to draw SwiftUI / Jetpack Compose pickers instead.
 * Same props and behavior; the community picker stays the fallback.
 *
 * @stability Beta
 */
import { useMemo, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { cn } from "../utils";
import { useGenesisModules, type GenesisDatePickerComponent } from "../native-modules";

function resolveDateTimePicker(): React.ComponentType<{
  value: Date;
  mode: "date" | "time";
  display?: string;
  onChange: (e: unknown, d?: Date) => void;
  disabled?: boolean;
  style?: object;
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
  const { datePicker: ExpoUiPicker } = useGenesisModules();
  const Picker = ExpoUiPicker ? null : resolveDateTimePicker();
  const [showAndroid, setShowAndroid] = useState(false);
  const isIOS = Platform.OS === "ios";

  const label = useMemo(() => {
    if (formatLabel) return formatLabel(value);
    if (mode === "date") return value.toDateString();
    return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [formatLabel, mode, value]);

  if (ExpoUiPicker) {
    return (
      <ExpoUiPickerButton
        Picker={ExpoUiPicker}
        value={value}
        onChange={onChange}
        mode={mode}
        label={label}
        disabled={disabled}
        className={className}
        testID={testID}
      />
    );
  }

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

  // iOS: the compact picker is itself the button (it shows the value and
  // opens the wheel), so it renders alone; a button beside it showed the
  // value twice.
  if (isIOS) {
    return (
      <Picker
        testID={testID ?? `native-${mode}-picker`}
        value={value}
        mode={mode}
        display="compact"
        disabled={disabled}
        style={disabled ? { opacity: 0.5 } : undefined}
        onChange={(_e, d) => {
          if (d && !disabled) onChange(d);
        }}
      />
    );
  }

  // Android: a button that opens the platform dialog.
  return (
    <>
      <Pressable
        testID={testID ?? `native-${mode}-picker`}
        accessibilityRole="button"
        accessibilityLabel={`Pick a ${mode}`}
        accessibilityValue={{ text: label }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setShowAndroid(true)}
        className={cn(
          "min-h-[44px] flex-row items-center rounded-md border border-input bg-background px-3",
          disabled && "opacity-50",
          className
        )}
      >
        <Text className="flex-1 text-base text-foreground">{label}</Text>
      </Pressable>
      {showAndroid ? (
        <Picker
          testID={testID ? `${testID}-picker` : undefined}
          value={value}
          mode={mode}
          display="default"
          onChange={(_e, d) => {
            setShowAndroid(false);
            if (d) onChange(d);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The @expo/ui backend (`@expo/ui/community/datetime-picker`, SwiftUI on iOS
 * and Jetpack Compose on Android), a drop-in for the community picker. iOS:
 * the compact picker is the button, as above. Android: a button that mounts
 * the picker as a dialog; it fires `onValueChange` on confirm and
 * `onDismiss` on cancel, and is unmounted on either.
 */
function ExpoUiPickerButton({
  Picker,
  value,
  onChange,
  mode,
  label,
  disabled,
  className,
  testID,
}: {
  Picker: GenesisDatePickerComponent;
  value: Date;
  onChange: (next: Date) => void;
  mode: "date" | "time";
  label: string;
  disabled?: boolean;
  className?: string;
  testID?: string;
}) {
  const [showAndroid, setShowAndroid] = useState(false);
  if (Platform.OS === "ios") {
    // As with the community picker: the native compact picker draws and
    // announces its own value, so `className` and the button label don't apply.
    return (
      <Picker
        testID={testID ?? `native-${mode}-picker`}
        value={value}
        mode={mode}
        display="compact"
        disabled={disabled}
        style={disabled ? { opacity: 0.5 } : undefined}
        onValueChange={(_e, d) => {
          if (d && !disabled) onChange(d);
        }}
      />
    );
  }
  return (
    <>
      <Pressable
        testID={testID ?? `native-${mode}-picker`}
        accessibilityRole="button"
        accessibilityLabel={`Pick a ${mode}`}
        accessibilityValue={{ text: label }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setShowAndroid(true)}
        className={cn(
          "min-h-[44px] flex-row items-center rounded-md border border-input bg-background px-3",
          disabled && "opacity-50",
          className
        )}
      >
        <Text className="flex-1 text-base text-foreground">{label}</Text>
      </Pressable>
      {showAndroid ? (
        <Picker
          testID={testID ? `${testID}-picker` : undefined}
          value={value}
          mode={mode}
          presentation="dialog"
          onValueChange={(_e, d) => {
            setShowAndroid(false);
            if (d) onChange(d);
          }}
          onDismiss={() => setShowAndroid(false)}
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
