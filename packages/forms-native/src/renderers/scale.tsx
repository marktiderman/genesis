/**
 * Picks drawn as a row of buttons: rating (numbers or stars), NPS (0 to 10), yes/no. Each is a
 * real radio ("3 of 5, selected"), so VoiceOver and TalkBack read the scale and the choice. Also
 * consent (one checkbox) and calculated (the engine's value, read-only).
 */
import { Pressable, Text, View } from "react-native";
import { formatCalculated, ratingDisplay, scaleLabels } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { accessibilityHint, ChoiceRow, FieldChrome } from "../chrome";
import { useFormNative } from "../context";
import { useFormStyles } from "../styles";

function scaleValues(type: string, max: number): number[] {
  if (type === "nps") return Array.from({ length: 11 }, (_, i) => i);
  return Array.from({ length: max }, (_, i) => i + 1);
}

/** The words under a scale's ends: the field's `lowLabel` / `highLabel`, else NPS's defaults. */
function endLabels(props: FieldRendererProps): { low?: string; high?: string } {
  const own = scaleLabels(props.binding.field);
  if (props.binding.field.type !== "nps") return own;
  return { low: own.low ?? "Not likely", high: own.high ?? "Very likely" };
}

interface ScaleOption {
  value: string;
  /** What is drawn. */
  text: string;
  /** What a screen reader says. */
  name: string;
  hint?: string | undefined;
}

/** A row of large buttons that wraps (NPS on a phone; any scale at a large text size). */
function ButtonRow({
  props,
  options,
  value,
  onPick,
  stars,
}: {
  props: FieldRendererProps;
  options: ScaleOption[];
  value: string;
  onPick(value: string): void;
  stars?: boolean | undefined;
}) {
  const s = useFormStyles();
  const { locked } = useFormNative();
  const chosen = stars && value !== "" ? Number(value) : null;
  return (
    <View style={s.scaleRow}>
      {options.map((o, i) => {
        const selected = value === o.value;
        const filled = chosen !== null && Number(o.value) <= chosen;
        return (
          <Pressable
            key={o.value}
            testID={`${props.inputId}-option-${o.value}`}
            onPress={() => onPick(o.value)}
            disabled={locked}
            accessibilityRole="radio"
            accessibilityLabel={o.name}
            accessibilityHint={[o.hint, `${i + 1} of ${options.length}`].filter(Boolean).join(". ")}
            accessibilityState={{ checked: selected, disabled: locked }}
            style={({ pressed }) => [
              s.scaleItem,
              stars ? { borderWidth: 0, backgroundColor: "transparent" } : selected ? s.scaleItemSelected : null,
              pressed ? s.optionPressed : null,
              locked ? s.optionDisabled : null,
            ]}
          >
            <Text style={stars ? [s.star, filled ? s.starOn : null] : [s.scaleText, selected ? s.scaleTextSelected : null]} maxFontSizeMultiplier={2}>
              {stars ? (filled ? "★" : "☆") : o.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function usePick(props: FieldRendererProps, set: (value: string) => void) {
  const { haptics } = useFormNative();
  return (value: string) => {
    haptics.selection?.();
    set(value);
    // A tap is always a deliberate pick; the layout never moves on from the last question.
    props.onAdvance?.();
  };
}

export function ScaleField(props: FieldRendererProps) {
  const s = useFormStyles();
  const { binding } = props;
  const { field } = binding;
  const max = typeof field.props?.max === "number" ? field.props.max : 5;
  const values = scaleValues(field.type, max);
  const { low, high } = endLabels(props);
  const stars = field.type === "rating" && ratingDisplay(field) === "stars";
  const last = values[values.length - 1] ?? max;
  const value = typeof binding.value === "number" ? String(binding.value) : "";
  const pick = usePick(props, (v) => binding.setValue(Number(v)));
  const options: ScaleOption[] = values.map((n, i) => ({
    value: String(n),
    text: String(n),
    name: stars ? `${n} of ${last} stars` : String(n),
    hint: i === 0 ? low : i === values.length - 1 ? high : undefined,
  }));
  return (
    <FieldChrome props={props} groupRole="radiogroup">
      <ButtonRow props={props} options={options} value={value} onPick={pick} stars={stars} />
      {low || high ? (
        <View style={s.endLabels} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={s.endLabel}>{low ?? ""}</Text>
          <Text style={[s.endLabel, { textAlign: "right" }]}>{high ?? ""}</Text>
        </View>
      ) : null}
    </FieldChrome>
  );
}

export function YesNoField(props: FieldRendererProps) {
  const { binding } = props;
  const value = binding.value === true ? "yes" : binding.value === false ? "no" : "";
  const pick = usePick(props, (v) => binding.setValue(v === "yes"));
  return (
    <FieldChrome props={props} groupRole="radiogroup">
      <ButtonRow
        props={props}
        value={value}
        onPick={pick}
        options={[
          { value: "yes", text: "Yes", name: "Yes" },
          { value: "no", text: "No", name: "No" },
        ]}
      />
    </FieldChrome>
  );
}

/** One checkbox to agree to something: the question is the header, `props.text` the box's words. */
export function ConsentField(props: FieldRendererProps) {
  const { binding } = props;
  const { haptics, locked } = useFormNative();
  const raw = binding.field.props?.text;
  const text = typeof raw === "string" && raw.trim() ? raw : "I agree";
  return (
    <FieldChrome props={props}>
      <ChoiceRow
        testID={`${props.inputId}-option-agree`}
        label={props.engine.text(text)}
        selected={binding.value === true}
        multiple
        disabled={locked}
        invalid={!!binding.error}
        onPress={() => {
          haptics.selection?.();
          binding.setValue(binding.value === true ? undefined : true);
        }}
      />
    </FieldChrome>
  );
}

/** The value the engine worked out, read-only; read again as the answers it uses change. */
export function CalculatedField(props: FieldRendererProps) {
  const s = useFormStyles();
  const text = formatCalculated(props.binding.value, props.binding.field);
  return (
    <FieldChrome props={props}>
      <Text
        testID={props.inputId}
        style={s.calculated}
        accessibilityLabel={`${props.binding.label}: ${text || "not worked out yet"}`}
        accessibilityHint={accessibilityHint(props)}
        accessibilityLiveRegion="polite"
      >
        {text || "—"}
      </Text>
    </FieldChrome>
  );
}
