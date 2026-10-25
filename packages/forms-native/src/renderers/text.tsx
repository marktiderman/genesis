/**
 * Typed answers: short and long text, email, phone, number and date. The input takes the
 * keyboard when its step appears; the return key moves on (or sends from the last question),
 * except in long text, where it starts a new line.
 */
import { useCallback, useEffect, useState, type ComponentRef } from "react";
import { InputAccessoryView, Platform, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from "react-native";
import { dateLimits, getFieldType, isIsoDate, numberLimits } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { accessibilityHint, FieldChrome, questionLabel } from "../chrome";
import { useFormNative } from "../context";
import { useFormStyles } from "../styles";
import { useFormTheme } from "../theme";
import { Button } from "../parts";

const NO_RETURN_KEY = new Set(["number-pad", "decimal-pad", "phone-pad", "numeric"]);

/** The placeholder a focus-layout answer line shows. */
export const ANSWER_PLACEHOLDER = "Type your answer here…";

type Hints = Pick<TextInputProps, "keyboardType" | "textContentType" | "autoComplete" | "autoCapitalize" | "autoCorrect">;

/** Keyboard and autofill hints from the field type's manifest (`a11y.inputMode`, `autocomplete`). */
export function keyboardHints(type: string): Hints {
  const a11y = getFieldType(type)?.a11y;
  const mode = a11y?.inputMode;
  const auto = a11y?.autocomplete;
  if (mode === "email" || auto === "email") {
    return { keyboardType: "email-address", textContentType: "emailAddress", autoComplete: "email", autoCapitalize: "none", autoCorrect: false };
  }
  if (mode === "tel" || auto === "tel") return { keyboardType: "phone-pad", textContentType: "telephoneNumber", autoComplete: "tel" };
  if (mode === "url") return { keyboardType: "url", textContentType: "URL", autoCapitalize: "none", autoCorrect: false };
  if (mode === "numeric") return { keyboardType: "number-pad" };
  if (mode === "decimal") return { keyboardType: "decimal-pad" };
  return {};
}

/** A one-line or multi-line answer, wired to the form's focus and return key. */
export function AnswerInput({
  props,
  value,
  onChangeText,
  multiline,
  hints,
  placeholder,
}: {
  props: FieldRendererProps;
  value: string;
  onChangeText(text: string): void;
  multiline?: boolean | undefined;
  hints?: Hints | undefined;
  placeholder?: string | undefined;
}) {
  const s = useFormStyles();
  const theme = useFormTheme();
  const { focus, submit, locked, isLast, submitLabel } = useFormNative();
  const [focused, setFocused] = useState(false);
  const { field, error } = props.binding;
  const id = field.id;
  const ref = useCallback((node: ComponentRef<typeof TextInput> | null) => focus.setControl(id, locked ? null : node), [focus, id, locked]);
  // iOS's number and phone pads have no return key: a bar above them carries Next (or Send).
  const accessoryID = Platform.OS === "ios" && !multiline && NO_RETURN_KEY.has(String(hints?.keyboardType)) ? `${props.inputId}-keys` : undefined;
  return (
    <>
    <TextInput
      ref={ref}
      inputAccessoryViewID={accessoryID}
      testID={props.inputId}
      value={value}
      onChangeText={onChangeText}
      editable={!locked}
      multiline={multiline}
      placeholder={placeholder ?? field.placeholder ?? ANSWER_PLACEHOLDER}
      placeholderTextColor={theme.tertiaryLabel as string}
      accessibilityLabel={questionLabel(props)}
      accessibilityHint={accessibilityHint(props)}
      accessibilityState={{ disabled: locked }}
      returnKeyType={multiline ? "default" : isLast ? "send" : "next"}
      submitBehavior={multiline ? "newline" : "submit"}
      onSubmitEditing={multiline ? undefined : () => submit()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.input, multiline ? s.multiline : null, focused ? s.inputFocused : null, error ? s.inputInvalid : null]}
      {...hints}
    />
    {accessoryID ? (
      <InputAccessoryView nativeID={accessoryID}>
        <View style={s.accessory}>
          <Button variant="plain" onPress={() => submit()} testID={`${props.inputId}-keys-next`}>
            {submitLabel}
          </Button>
        </View>
      </InputAccessoryView>
    ) : null}
    </>
  );
}

export function TextField(props: FieldRendererProps & { multiline?: boolean }) {
  const { binding } = props;
  return (
    <FieldChrome props={props}>
      <AnswerInput
        props={props}
        multiline={props.multiline}
        value={typeof binding.value === "string" ? binding.value : ""}
        onChangeText={(text) => binding.setValue(text)}
        hints={keyboardHints(binding.field.type)}
      />
    </FieldChrome>
  );
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** The keypad for a number's range: digits only, digits and a decimal point, or a minus sign too. */
function numberKeyboard(min: number | undefined, step: number | undefined): KeyboardTypeOptions {
  // Whole numbers only when the step says so: without a step any value is valid, so a decimal point is needed.
  if (min !== undefined && min >= 0) return step !== undefined && Number.isInteger(step) ? "number-pad" : "decimal-pad";
  // iOS's number and decimal pads have no minus key.
  return Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric";
}

/**
 * A number, typed as text: what was typed is kept while it isn't a number yet ("-", "1."), and
 * stored as a number once it is. Text that never becomes one is kept as text, so validation says
 * so. A comma works as the decimal point.
 */
export function NumberField(props: FieldRendererProps) {
  const s = useFormStyles();
  const { binding } = props;
  const { min, max, step } = numberLimits(binding.field);
  const shown = typeof binding.value === "number" ? String(binding.value) : typeof binding.value === "string" ? binding.value : "";
  const [text, setText] = useState(shown);
  // A value set from outside (Back, a draft, a prefill) replaces what was typed.
  useEffect(() => {
    setText((typed) => (typed.trim() !== "" && Number(typed.trim().replace(",", ".")) === binding.value ? typed : shown));
  }, [shown, binding.value]);
  return (
    <FieldChrome props={props}>
      <AnswerInput
        props={props}
        value={text}
        hints={{ keyboardType: numberKeyboard(min, step), autoCorrect: false }}
        onChangeText={(raw) => {
          setText(raw);
          const t = raw.trim().replace(",", ".");
          if (t === "") binding.setValue(undefined);
          else {
            const n = Number(t);
            binding.setValue(Number.isFinite(n) && NUMBER.test(t) ? n : raw);
          }
        }}
      />
      {min !== undefined || max !== undefined ? (
        <Text style={s.hint}>{min !== undefined && max !== undefined ? `From ${min} to ${max}` : min !== undefined ? `${min} or more` : `${max} or less`}</Text>
      ) : null}
    </FieldChrome>
  );
}

/** Digits typed into a date, shaped as `YYYY-MM-DD` as they come (the dashes are added). */
export function shapeDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** A date in words for the device's language ("Friday 24 October 2026"), or "" when it can't be. */
function longDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch {
    return "";
  }
}

/**
 * A calendar day, typed: digits become `YYYY-MM-DD` (the stored form) as they are typed, and a
 * whole date is read back in words. Text that isn't a date yet is kept as text, so validation
 * says what's wrong. Register a renderer for `date` with a higher rank to use a picker instead.
 */
export function DateField(props: FieldRendererProps) {
  const s = useFormStyles();
  const { binding } = props;
  const { min, max } = dateLimits(binding.field);
  const value = typeof binding.value === "string" ? binding.value : "";
  const whole = isIsoDate(value);
  return (
    <FieldChrome props={props}>
      <AnswerInput
        props={props}
        value={value}
        placeholder={binding.field.placeholder ?? "YYYY-MM-DD"}
        hints={{ keyboardType: "number-pad", autoCorrect: false }}
        onChangeText={(raw) => {
          const shaped = shapeDate(raw);
          binding.setValue(shaped === "" ? undefined : shaped);
        }}
      />
      {whole ? <Text style={s.hint}>{longDate(value)}</Text> : null}
      {min !== undefined || max !== undefined ? (
        <Text style={s.hint}>{min !== undefined && max !== undefined ? `From ${min} to ${max}` : min !== undefined ? `${min} or later` : `${max} or earlier`}</Text>
      ) : null}
    </FieldChrome>
  );
}
