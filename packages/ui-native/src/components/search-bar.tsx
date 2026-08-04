/**
 * SearchBar — text input with cancel + clear + optional voice trigger.
 *
 * Use as the search affordance for lists and result screens. iOS-style
 * "Cancel" button slides in only when the input is focused and clears
 * focus on press. The clear "✕" appears whenever there's a value.
 *
 * Voice support is opt-in: pass `onVoicePress` to render the voice
 * button. The actual STT integration is the consumer's responsibility
 * (e.g., expo-speech-recognition); this primitive only renders the
 * trigger affordance.
 *
 * @stability Beta
 */
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { cn } from "../utils";

export interface NativeSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Submit handler (return key on the keyboard). */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /**
   * Color used for the placeholder text. Defaults to a token-aware muted
   * value that matches NativeWind's `text-muted-foreground` resolution.
   * Override per-call when an alternate brand demands a different shade.
   */
  placeholderTextColor?: string;
  /** When provided, renders a microphone trigger. */
  onVoicePress?: () => void;
  /** Show the "Cancel" button when focused. Default true. */
  showCancel?: boolean;
  /** Cancel button label. Default "Cancel". */
  cancelLabel?: string;
  className?: string;
  testID?: string;
}

export function NativeSearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search",
  placeholderTextColor,
  onVoicePress,
  showCancel = true,
  cancelLabel = "Cancel",
  className,
  testID,
}: NativeSearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  return (
    <View
      testID={testID ?? "native-search-bar"}
      className={cn("flex-row items-center gap-2", className)}
    >
      <View className="flex-1 flex-row items-center rounded-md border border-input bg-background px-3">
        <Text accessibilityElementsHidden className="text-sm text-muted-foreground">
          {"\u{1F50D}"}
        </Text>
        <TextInput
          ref={inputRef}
          testID={testID ? `${testID}-input` : "search-input"}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => onSubmit?.(value)}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          accessibilityLabel={placeholder}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          className="ml-2 min-h-[44px] flex-1 text-base text-foreground"
        />
        {value.length > 0 ? (
          <Pressable
            testID={testID ? `${testID}-clear` : "search-clear"}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => onChange("")}
            className="ml-1 min-h-[24px] min-w-[24px] items-center justify-center"
          >
            <Text className="text-sm text-muted-foreground">✕</Text>
          </Pressable>
        ) : null}
        {onVoicePress ? (
          <Pressable
            testID={testID ? `${testID}-voice` : "search-voice"}
            accessibilityRole="button"
            accessibilityLabel="Voice search"
            hitSlop={8}
            onPress={onVoicePress}
            className="ml-2 min-h-[24px] min-w-[24px] items-center justify-center"
          >
            <Text className="text-sm text-muted-foreground">{"\u{1F3A4}"}</Text>
          </Pressable>
        ) : null}
      </View>
      {showCancel && focused ? (
        <Pressable
          testID={testID ? `${testID}-cancel` : "search-cancel"}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={() => {
            onChange("");
            // Dismiss the keyboard along with the cancel — matches iOS native
            // behavior. setFocused(false) will be triggered by the resulting
            // onBlur as well, but call it eagerly to hide the cancel button
            // immediately for snappier UX.
            inputRef.current?.blur();
            setFocused(false);
          }}
          className="min-h-[44px] items-center justify-center px-2"
        >
          <Text className="text-base text-primary">{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
