"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "../../utils";

interface ChoiceCardBaseProps {
  title: React.ReactNode;
  /** A second line under the title, muted. */
  description?: React.ReactNode;
  /** Left of the text: a thumbnail, an icon. */
  media?: React.ReactNode;
  disabled?: boolean | undefined;
  /** The question still needs an answer: a destructive border, and said to screen readers. */
  invalid?: boolean | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

/**
 * One of several, inside a `RadioGroup` (genesis-ui's, Radix): the group holds which is chosen
 * (`value`, `onValueChange`) and gives the cards one tab stop and the arrow keys.
 */
export interface ChoiceCardRadioProps extends ChoiceCardBaseProps {
  multiple?: false | undefined;
  /** This card's value in its RadioGroup. */
  value: string;
}

/** Any number of these can be chosen: each card is a checkbox with its own state. */
export interface ChoiceCardCheckboxProps extends ChoiceCardBaseProps {
  multiple: true;
  selected: boolean;
  /** Called when it is pressed (Space, or a click), with the new state. */
  onSelectedChange: (selected: boolean) => void;
}

export type ChoiceCardProps = ChoiceCardRadioProps | ChoiceCardCheckboxProps;

/**
 * ChoiceCard — one option as a card a person picks (a plan, a class, an answer with a picture):
 * the twin of genesis-ui-native's NativeChoiceCard, with the same `title`, `description`, `media`,
 * `multiple`, `invalid` and `disabled`.
 *
 * One of several (the default) is a radio built on the RadioGroup's item, so it goes in a
 * `RadioGroup` with a label: the group is one tab stop, the arrow keys move the choice, and the
 * group's `value` is the chosen card's. With `multiple` it is a checkbox with its own `selected`
 * and `onSelectedChange`; put those in an element with `role="group"` and a label.
 *
 * ```tsx
 * <RadioGroup aria-label="Plan" value={plan} onValueChange={setPlan}>
 *   <ChoiceCard value="monthly" title="Monthly" description="$20 a month" />
 *   <ChoiceCard value="yearly" title="Yearly" description="$200 a year" />
 * </RadioGroup>
 * ```
 *
 * The card's surface is the Card's (`bg-card`, `border`, `rounded-lg`).
 *
 * @stability Beta
 */
export const ChoiceCard = React.forwardRef<HTMLButtonElement, ChoiceCardProps>((props, ref) => {
  const { title, description, media, disabled = false, invalid = false, className, testID = "choice-card" } = props;
  const classes = cn(
    "group flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
    "hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    invalid ? "border-destructive" : "border-border",
    "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
    className,
  );
  const text = (
    <>
      {media ? (
        <span aria-hidden className="shrink-0" data-testid={`${testID}-media`}>
          {media}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description ? <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span> : null}
      </span>
    </>
  );
  const indicator = cn(
    "flex size-5 shrink-0 items-center justify-center border border-input group-data-[state=checked]:border-primary",
    props.multiple ? "rounded group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground" : "rounded-full",
  );

  if (props.multiple) {
    const { selected, onSelectedChange } = props;
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        data-slot="choice-card"
        data-state={selected ? "checked" : "unchecked"}
        data-testid={testID}
        onClick={() => onSelectedChange(!selected)}
        className={classes}
      >
        <span aria-hidden data-testid={`${testID}-indicator`} className={indicator}>
          {selected ? <Check className="size-3.5" /> : null}
        </span>
        {text}
      </button>
    );
  }

  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      value={props.value}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      data-slot="choice-card"
      data-testid={testID}
      className={classes}
    >
      <span aria-hidden data-testid={`${testID}-indicator`} className={indicator}>
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary" />
      </span>
      {text}
    </RadioGroupPrimitive.Item>
  );
});
ChoiceCard.displayName = "ChoiceCard";
