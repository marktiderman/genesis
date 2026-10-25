/**
 * Single and multiple choice (and dropdown, drawn as a single choice list). The options shown
 * are `useChoiceOptions` (narrowed by another answer when the question has a filter); a long list
 * gets a search box (`isSearchable`, decided from all its options so the control doesn't change
 * while the respondent answers); an option shows its description and its https picture; and an
 * "Other" option takes the respondent's own words, at most `OTHER_MAX_LENGTH` characters.
 */
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Text, TextInput } from "react-native";
import { choiceOptions, isSearchable, otherOption, OTHER_MAX_LENGTH, searchOptions, type ChoiceOption, type Json } from "@marktiderman/genesis-forms";
import { useChoiceOptions, type FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { ChoiceRow, FieldChrome } from "../chrome";
import { useFormNative } from "../context";
import { useFormStyles } from "../styles";
import { useFormTheme } from "../theme";

const labelOf = (o: ChoiceOption) => o.label ?? o.value;

/**
 * A question's typed "Other" answer, kept while the respondent switches between options, so
 * picking "Other" again brings back what they wrote. `typed` is the stored answer's text.
 */
function useOtherText(typed: string) {
  const [on, setOn] = useState(typed !== "");
  const [text, setText] = useState(typed);
  return { on, setOn, text, setText };
}

/** The text box of an "Other" option: what the respondent types is the answer. */
function OtherText({
  props,
  label,
  value,
  onChange,
  autoFocus,
}: {
  props: FieldRendererProps;
  label: string;
  value: string;
  onChange(text: string): void;
  autoFocus: boolean;
}) {
  const s = useFormStyles();
  const theme = useFormTheme();
  const { submit, locked } = useFormNative();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  // Puts the cursor in the box once it is shown by a tap on "Other".
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => ref.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [autoFocus]);
  return (
    <TextInput
      ref={ref}
      testID={`${props.inputId}-other-text`}
      value={value}
      maxLength={OTHER_MAX_LENGTH}
      editable={!locked}
      onChangeText={onChange}
      placeholder="Type your answer"
      placeholderTextColor={theme.tertiaryLabel as string}
      accessibilityLabel={`${label}: your answer`}
      accessibilityHint={props.binding.error ? `Error: ${props.binding.error}` : undefined}
      returnKeyType="next"
      submitBehavior="submit"
      onSubmitEditing={() => submit()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.input, focused ? s.inputFocused : null, props.binding.error ? s.inputInvalid : null]}
    />
  );
}

/** A search box over a long list: typing narrows it (`searchOptions`, the same match as on the web). */
function SearchBox({ props, query, onQuery }: { props: FieldRendererProps; query: string; onQuery(q: string): void }) {
  const s = useFormStyles();
  const theme = useFormTheme();
  const { locked } = useFormNative();
  return (
    <TextInput
      testID={`${props.inputId}-search`}
      value={query}
      onChangeText={onQuery}
      editable={!locked}
      placeholder="Type to search"
      placeholderTextColor={theme.tertiaryLabel as string}
      accessibilityRole="search"
      accessibilityLabel={`Search: ${props.binding.label}`}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      clearButtonMode="while-editing"
      style={s.boxInput}
    />
  );
}

function NoOptions({ searching }: { searching: boolean }) {
  const s = useFormStyles();
  return <Text style={s.hint}>{searching ? "No matches." : "No options to choose from."}</Text>;
}

/** One pick: a single choice or a dropdown. */
export function SingleChoiceField(props: FieldRendererProps) {
  const { binding, onAdvance } = props;
  const { field } = binding;
  const { haptics, locked } = useFormNative();
  const s = useFormStyles();
  const options = useChoiceOptions(props.engine, field.id);
  const other = otherOption(field);
  const searchable = isSearchable(field);
  const [query, setQuery] = useState("");
  const current = typeof binding.value === "string" ? binding.value : "";
  // Typed text is "Other" only when it isn't one of the options (all of them, not just those shown).
  const typed = other && current && !choiceOptions(field).some((o) => o.value === current) ? current : "";
  const otherText = useOtherText(typed);
  const [focusOther, setFocusOther] = useState(false);
  const shown = searchable ? searchOptions(options, query) : options;
  const total = options.length + (other ? 1 : 0);
  const pick = (value: string) => {
    haptics.selection?.();
    otherText.setOn(false);
    setFocusOther(false);
    binding.setValue(value);
    onAdvance?.();
  };
  const pickOther = () => {
    haptics.selection?.();
    otherText.setOn(true);
    setFocusOther(true);
    // No auto-advance: the respondent still has to type.
    binding.setValue(otherText.text.trim() ? otherText.text : undefined);
  };
  const chosen = options.find((o) => o.value === current && !otherText.on);
  return (
    <FieldChrome props={props} groupRole="radiogroup">
      {searchable ? <SearchBox props={props} query={query} onQuery={setQuery} /> : null}
      {shown.length === 0 && !other ? <NoOptions searching={searchable && query.trim() !== ""} /> : null}
      {shown.length === 0 && other && searchable && query.trim() ? <NoOptions searching /> : null}
      {shown.map((o) => (
        <ChoiceRow
          key={o.value}
          testID={`${props.inputId}-option-${o.value}`}
          label={labelOf(o)}
          description={o.description}
          image={o.image}
          selected={!otherText.on && current === o.value}
          multiple={false}
          disabled={locked}
          invalid={!!binding.error}
          position={`${options.indexOf(o) + 1} of ${total}`}
          onPress={() => pick(o.value)}
        />
      ))}
      {other ? (
        <ChoiceRow
          testID={`${props.inputId}-option-other`}
          label={other.label}
          selected={otherText.on}
          multiple={false}
          disabled={locked}
          invalid={!!binding.error}
          position={`${total} of ${total}`}
          onPress={pickOther}
        />
      ) : null}
      {other && otherText.on ? (
        <OtherText
          props={props}
          label={other.label}
          value={otherText.text}
          autoFocus={focusOther}
          onChange={(text) => {
            otherText.setText(text);
            binding.setValue(text.trim() ? text : undefined);
          }}
        />
      ) : null}
      {searchable && (chosen || (otherText.on && otherText.text.trim())) ? (
        <Text style={s.hint} accessibilityLiveRegion="polite">
          Your choice: {chosen ? labelOf(chosen) : otherText.text}
        </Text>
      ) : null}
    </FieldChrome>
  );
}

/** Several picks. The typed "Other" answer is one more item while it is ticked and not blank. */
export function MultiChoiceField(props: FieldRendererProps) {
  const { binding } = props;
  const { field } = binding;
  const { haptics, locked } = useFormNative();
  const s = useFormStyles();
  const options = useChoiceOptions(props.engine, field.id);
  const other = otherOption(field);
  const searchable = isSearchable(field);
  const [query, setQuery] = useState("");
  const selected = Array.isArray(binding.value) ? (binding.value.filter((v) => typeof v === "string") as string[]) : [];
  const known = new Set(choiceOptions(field).map((o) => o.value));
  const chosen = selected.filter((v) => known.has(v));
  const otherText = useOtherText(other ? (selected.find((v) => !known.has(v)) ?? "") : "");
  const [focusOther, setFocusOther] = useState(false);
  const shown = searchable ? searchOptions(options, query) : options;
  const commit = (picked: string[], otherOn: boolean, text: string) => {
    const next = otherOn && text.trim() ? [...picked, text] : picked;
    binding.setValue(next.length ? (next as Json) : undefined);
  };
  const toggle = (value: string) => {
    haptics.selection?.();
    commit(chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value], otherText.on, otherText.text);
  };
  const names = options.filter((o) => chosen.includes(o.value)).map(labelOf);
  if (otherText.on && otherText.text.trim()) names.push(otherText.text);
  return (
    <FieldChrome props={props} groupRole="list">
      <Text style={s.hint}>Choose as many as you like</Text>
      {searchable ? <SearchBox props={props} query={query} onQuery={setQuery} /> : null}
      {shown.length === 0 && (!other || (searchable && query.trim())) ? <NoOptions searching={searchable && query.trim() !== ""} /> : null}
      {shown.map((o) => (
        <ChoiceRow
          key={o.value}
          testID={`${props.inputId}-option-${o.value}`}
          label={labelOf(o)}
          description={o.description}
          image={o.image}
          selected={chosen.includes(o.value)}
          multiple
          disabled={locked}
          invalid={!!binding.error}
          onPress={() => toggle(o.value)}
        />
      ))}
      {other ? (
        <ChoiceRow
          testID={`${props.inputId}-option-other`}
          label={other.label}
          selected={otherText.on}
          multiple
          disabled={locked}
          invalid={!!binding.error}
          onPress={() => {
            haptics.selection?.();
            const on = !otherText.on;
            otherText.setOn(on);
            setFocusOther(on);
            commit(chosen, on, otherText.text);
          }}
        />
      ) : null}
      {other && otherText.on ? (
        <OtherText
          props={props}
          label={other.label}
          value={otherText.text}
          autoFocus={focusOther}
          onChange={(text) => {
            otherText.setText(text);
            commit(chosen, true, text);
          }}
        />
      ) : null}
      {searchable && names.length ? (
        <Text style={s.hint} accessibilityLiveRegion="polite">
          Chosen: {names.join(", ")}
        </Text>
      ) : null}
    </FieldChrome>
  );
}
