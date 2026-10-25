/**
 * The question around a control: its text (a header screen readers move to on each step), its
 * description, the control, and its error. Every field renderer draws inside it.
 */
import { useCallback, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { getFieldType } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { useFormNative } from "./context";
import { useFormStyles } from "./styles";

/** What a screen reader hears after a control's name: the description, then the error. */
export function accessibilityHint(props: FieldRendererProps): string | undefined {
  const { field, error } = props.binding;
  const description = field.description ? props.engine.text(field.description) : "";
  const parts = [description, error ? `Error: ${error}` : ""].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}

/** The question as a screen reader reads it: the label, and "required" when it is. */
export function questionLabel(props: FieldRendererProps): string {
  return props.binding.field.required ? `${props.binding.label}, required` : props.binding.label;
}

export interface FieldChromeProps {
  props: FieldRendererProps;
  children: ReactNode;
  /**
   * The group's role for its options (`radiogroup` for one pick), named by the question. Text
   * controls take their name from the question themselves, so leave it out for them.
   */
  groupRole?: "radiogroup" | "list" | undefined;
}

export function FieldChrome({ props, children, groupRole }: FieldChromeProps) {
  const s = useFormStyles();
  const { focus } = useFormNative();
  const { field, error, label } = props.binding;
  const id = field.id;
  const description = field.description ? props.engine.text(field.description) : undefined;
  const group = getFieldType(field.type)?.a11y.semantics === "group";
  const questionRef = useCallback((node: unknown) => focus.setQuestion(id, node), [focus, id]);
  return (
    <View testID={`${props.inputId}-field`}>
      <Text ref={questionRef} accessibilityRole="header" accessibilityLabel={questionLabel(props)} style={s.question} nativeID={`${props.inputId}-label`}>
        {label}
        {field.required ? <Text style={s.required}> *</Text> : null}
      </Text>
      {description ? (
        <Text style={s.description} nativeID={`${props.inputId}-desc`}>
          {description}
        </Text>
      ) : null}
      <View
        style={s.answer}
        {...(group && groupRole
          ? { accessibilityRole: groupRole, accessibilityLabel: label, accessibilityHint: accessibilityHint(props) }
          : {})}
      >
        {children}
      </View>
      {error ? (
        <Text style={s.error} testID={`${props.inputId}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A small decorative picture beside an option's label: the label says what it is. */
export function OptionImage({ uri }: { uri: string }) {
  const s = useFormStyles();
  return <Image source={{ uri }} style={s.optionImage} accessible={false} accessibilityIgnoresInvertColors resizeMode="cover" />;
}

/** The radio dot or check box drawn beside an option. Decorative: the row carries the state. */
export function Indicator({ on, multiple }: { on: boolean; multiple: boolean }) {
  const s = useFormStyles();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[s.indicator, multiple ? s.indicatorBox : s.indicatorRadio, on ? s.indicatorOn : null]}
    >
      {on ? multiple ? <Text style={s.indicatorCheck}>✓</Text> : <View style={s.indicatorDot} /> : null}
    </View>
  );
}

export interface ChoiceRowProps {
  label: string;
  description?: string | undefined;
  image?: string | undefined;
  selected: boolean;
  multiple: boolean;
  disabled?: boolean | undefined;
  onPress(): void;
  testID?: string | undefined;
  /** "2 of 5", read after the label. */
  position?: string | undefined;
  invalid?: boolean | undefined;
}

/** One option: the whole row is the target (at least 52 points tall), a real radio or checkbox. */
export function ChoiceRow({ label, description, image, selected, multiple, disabled, onPress, testID, position, invalid }: ChoiceRowProps) {
  const s = useFormStyles();
  const name = [label, description].filter(Boolean).join(", ");
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={name}
      accessibilityHint={[position, invalid ? "Needs an answer" : ""].filter(Boolean).join(". ") || undefined}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      style={({ pressed }) => [s.option, selected ? s.optionSelected : null, pressed ? s.optionPressed : null, disabled ? s.optionDisabled : null]}
    >
      <Indicator on={selected} multiple={multiple} />
      {image ? <OptionImage uri={image} /> : null}
      <View style={s.optionText}>
        <Text style={s.optionLabel}>{label}</Text>
        {description ? <Text style={s.optionDescription}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}
