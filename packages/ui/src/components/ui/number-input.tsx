"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { canStepNumber, clampNumber, readNumberDraft, stepNumber } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";
import { Button } from "./button";
import { InputGroup, InputGroupInput } from "./input-group";

export interface NumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  /** Each press of − or +, and each arrow key. Default 1. */
  step?: number;
  /** Decimal places shown. Default 0. */
  precision?: number;
  /**
   * The locale whose marks typed numbers use ("de-DE" reads "1.234,5"). Default: worked out from
   * the text ("1,234" is 1234, "1,5" is 1.5), genesis-core's `parseNumberInput`.
   */
  locale?: string | undefined;
  disabled?: boolean | undefined;
  /** Keep the steppers but not typing. */
  readOnlyInput?: boolean | undefined;
  /** The field's name in a form. */
  name?: string | undefined;
  /** Called when the field is left, after a typed number is committed. */
  onBlur?: React.FocusEventHandler<HTMLInputElement> | undefined;
  /** The field's accessible name when no `<label htmlFor>` names it. */
  "aria-label"?: string;
  id?: string;
  /** The stepper buttons' names. Default "Decrement" / "Increment". */
  labels?: { decrement?: string; increment?: string };
  className?: string;
  testID?: string;
}

/**
 * NumberInput — a number with − and + buttons: the twin of genesis-ui-native's NativeNumberInput,
 * with the same `value`, `min`, `max`, `step` and `precision`. The field is a `spinbutton` (↑ and ↓
 * step it, Page Up and Page Down by ten steps, Home and End go to the ends); typing "1,5" reads as
 * 1.5 and "1,234" as 1234. Clamping, stepping and reading what was typed are genesis-core's, as on
 * the phone.
 *
 * A typed number is passed on as it is typed only while it is inside `min` and `max`; one outside
 * is clamped when the field is left or Enter is pressed, so typing "1" on the way to "15" with
 * `min` 10 never sends 10. The ref is the input's, so a form library can register it with `name`
 * and `onBlur`.
 *
 * It is the InputGroup with the buttons at its ends.
 *
 * @stability Beta
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    onChange,
    min,
    max,
    step = 1,
    precision = 0,
    locale,
    disabled,
    readOnlyInput,
    name,
    onBlur,
    id,
    labels = {},
    className,
    testID = "number-input",
    ...aria
  },
  ref,
) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const range = { min, max, step };
  const set = (next: number) => onChange(clampNumber(next, min, max));
  const decBlocked = disabled || !canStepNumber(value, -1, range);
  const incBlocked = disabled || !canStepNumber(value, 1, range);

  /** What's typed, clamped and passed on; the field then shows the value again. */
  const commit = () => {
    if (draft === null) return;
    const { value: typed } = readNumberDraft(draft, { min, max, locale });
    setDraft(null);
    if (typed !== null && clampNumber(typed, min, max) !== value) set(typed);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit();
      return;
    }
    const big = { ...range, step: step * 10 };
    const moves: Record<string, () => number | null> = {
      ArrowUp: () => stepNumber(value, 1, range),
      ArrowDown: () => stepNumber(value, -1, range),
      PageUp: () => stepNumber(value, 1, big),
      PageDown: () => stepNumber(value, -1, big),
      Home: () => (min ?? null),
      End: () => (max ?? null),
    };
    const move = moves[e.key]?.();
    if (move === undefined || move === null || disabled) return;
    e.preventDefault();
    setDraft(null);
    set(move);
  };

  return (
    <InputGroup data-testid={testID} className={cn("w-auto overflow-hidden p-0", disabled && "opacity-50", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none border-r border-input"
        aria-label={labels.decrement ?? "Decrement"}
        disabled={decBlocked}
        onClick={() => {
          setDraft(null);
          set(stepNumber(value, -1, range));
        }}
        testID={`${testID}-decrement`}
        tabIndex={-1}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <InputGroupInput
        ref={ref}
        id={id}
        name={name}
        role="spinbutton"
        inputMode="decimal"
        aria-label={aria["aria-label"]}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        disabled={disabled}
        readOnly={readOnlyInput}
        value={draft ?? value.toFixed(precision)}
        onChange={(e) => {
          setDraft(e.target.value);
          const typed = readNumberDraft(e.target.value, { min, max, locale });
          if (typed.inRange && typed.value !== null && typed.value !== value) onChange(typed.value);
        }}
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={onKeyDown}
        className="min-w-16 text-center tabular-nums"
        data-testid={`${testID}-field`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none border-l border-input"
        aria-label={labels.increment ?? "Increment"}
        disabled={incBlocked}
        onClick={() => {
          setDraft(null);
          set(stepNumber(value, 1, range));
        }}
        testID={`${testID}-increment`}
        tabIndex={-1}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </InputGroup>
  );
});
