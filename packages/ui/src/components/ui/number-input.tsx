"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { canStepNumber, clampNumber, parseNumberInput, stepNumber } from "@marktiderman/genesis-core/headless";
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
  disabled?: boolean | undefined;
  /** Keep the steppers but not typing. */
  readOnlyInput?: boolean | undefined;
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
 * 1.5. Clamping, stepping and reading what was typed are genesis-core's, as on the phone.
 *
 * It is the InputGroup with the buttons at its ends.
 *
 * @stability Beta
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  disabled,
  readOnlyInput,
  id,
  labels = {},
  className,
  testID = "number-input",
  ...aria
}: NumberInputProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const range = { min, max, step };
  const set = (next: number) => onChange(clampNumber(next, min, max));
  const decBlocked = disabled || !canStepNumber(value, -1, range);
  const incBlocked = disabled || !canStepNumber(value, 1, range);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        onClick={() => set(stepNumber(value, -1, range))}
        testID={`${testID}-decrement`}
        tabIndex={-1}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <InputGroupInput
        id={id}
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
          const parsed = parseNumberInput(e.target.value);
          if (parsed !== null) set(parsed);
        }}
        onBlur={() => setDraft(null)}
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
        onClick={() => set(stepNumber(value, 1, range))}
        testID={`${testID}-increment`}
        tabIndex={-1}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </InputGroup>
  );
}
