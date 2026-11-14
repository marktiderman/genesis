/**
 * InputOTP — a one-time code in boxes: the twin of genesis-ui's InputOTP.
 *
 * One real text field sits over the boxes, so the system's code autofill (iOS's "From Messages",
 * Android's SMS retriever with `autoComplete="sms-otp"`), paste and the screen reader all work on
 * a single field; the boxes only draw what it holds and are hidden from screen readers. The field
 * is all but invisible (transparent text, no caret, 1% opacity) rather than at 0 opacity, which
 * iOS drops from VoiceOver; it is the one labelled element, and a screen reader reads its text.
 * The characters it keeps and the caret's box come from genesis-core's `sanitizeOtp` and
 * `otpSlots`, as on the web. The field has no native length cap: `sanitizeOtp` keeps the first
 * `maxLength` characters after it strips spaces and dashes, so a pasted "123-456" stays whole.
 *
 * @stability Beta
 */
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { OTP_PATTERN_DIGITS, otpComplete, otpSlots, sanitizeOtp } from "@marktiderman/genesis-core/headless";
import { cn } from "../utils";

export interface NativeInputOTPProps {
  /** How many characters. Default 6. */
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
  /** Called once every box is filled. */
  onComplete?: (value: string) => void;
  /** Which characters a box takes, as a RegExp source. Default digits (`OTP_PATTERN_DIGITS`). */
  pattern?: string;
  /** Draws a separator after these box indexes ([2] for 123-456). */
  separatorAfter?: number[];
  disabled?: boolean;
  autoFocus?: boolean;
  /** Read by screen readers. Default "One-time code". */
  accessibilityLabel?: string;
  /** Read after the label. Default "{maxLength} characters". */
  accessibilityHint?: string;
  className?: string;
  testID?: string;
}

/** iOS leaves views at or under 0.01 opacity out of VoiceOver; just above it, the field stays reachable. */
const HIDDEN_BUT_READABLE = 0.011;

export function NativeInputOTP({
  maxLength = 6,
  value,
  onChange,
  onComplete,
  pattern = OTP_PATTERN_DIGITS,
  separatorAfter = [],
  disabled,
  autoFocus,
  accessibilityLabel = "One-time code",
  accessibilityHint,
  className,
  testID = "native-input-otp",
}: NativeInputOTPProps) {
  const input = useRef<{ focus?: () => void } | null>(null);
  const [focused, setFocused] = useState(false);
  const digits = pattern === OTP_PATTERN_DIGITS;
  const slots = otpSlots(value, maxLength, focused);

  const change = (text: string) => {
    const next = sanitizeOtp(text, maxLength, pattern);
    onChange(next);
    if (otpComplete(next, maxLength) && !otpComplete(value, maxLength)) onComplete?.(next);
  };

  return (
    <Pressable
      testID={testID}
      accessible={false}
      disabled={disabled}
      onPress={() => input.current?.focus?.()}
      className={cn("relative flex-row items-center self-start", disabled && "opacity-50", className)}
    >
      {slots.map((slot, i) => (
        <View key={i} className="flex-row items-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View
            testID={`${testID}-slot-${i}`}
            className={cn(
              "h-12 w-10 items-center justify-center border-y border-r border-input bg-background",
              (i === 0 || separatorAfter.includes(i - 1)) && "rounded-l-md border-l",
              (i === maxLength - 1 || separatorAfter.includes(i)) && "rounded-r-md",
              slot.isActive && "border-2 border-ring"
            )}
          >
            <Text className="text-lg font-medium text-foreground">{slot.char ?? ""}</Text>
          </View>
          {separatorAfter.includes(i) && i < maxLength - 1 ? (
            <Text className="mx-1 text-lg text-muted-foreground">·</Text>
          ) : null}
        </View>
      ))}
      <TextInput
        ref={input}
        testID={`${testID}-input`}
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType={digits ? "number-pad" : "default"}
        autoCapitalize="characters"
        textContentType="oneTimeCode"
        autoComplete={digits ? "sms-otp" : "one-time-code"}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint ?? `${maxLength} characters`}
        caretHidden
        className="absolute inset-0 text-transparent"
        style={{ opacity: HIDDEN_BUT_READABLE }}
      />
    </Pressable>
  );
}
