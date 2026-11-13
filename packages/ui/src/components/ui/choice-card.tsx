"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../utils";

export interface ChoiceCardProps {
  title: React.ReactNode;
  /** A second line under the title, muted. */
  description?: React.ReactNode;
  /** Left of the text: a thumbnail, an icon. */
  media?: React.ReactNode;
  selected: boolean;
  /** Called when it is pressed (Space or Enter, or a click). */
  onSelectedChange: (selected: boolean) => void;
  /** A checkbox (several can be chosen) rather than a radio. */
  multiple?: boolean | undefined;
  disabled?: boolean | undefined;
  /** The question still needs an answer: a destructive border, and said to screen readers. */
  invalid?: boolean | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

/**
 * ChoiceCard — one option as a card a person picks (a plan, a class, an answer with a picture):
 * the twin of genesis-ui-native's NativeChoiceCard, with the same `title`, `description`, `media`,
 * `selected`, `multiple`, `invalid` and `disabled`.
 *
 * It is a radio (or, with `multiple`, a checkbox) to assistive technology, with its state; put
 * several in an element with `role="radiogroup"` (or `group`) and a label. The card's surface is
 * the Card's (`bg-card`, `border`, `rounded-lg`).
 *
 * @stability Beta
 */
export const ChoiceCard = React.forwardRef<HTMLButtonElement, ChoiceCardProps>(
  ({ title, description, media, selected, onSelectedChange, multiple = false, disabled = false, invalid = false, className, testID = "choice-card" }, ref) => (
    <button
      ref={ref}
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      data-slot="choice-card"
      data-state={selected ? "checked" : "unchecked"}
      data-testid={testID}
      onClick={() => onSelectedChange(multiple ? !selected : true)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-primary bg-primary/5" : invalid ? "border-destructive" : "border-border",
        className,
      )}
    >
      <span
        aria-hidden
        data-testid={`${testID}-indicator`}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border",
          multiple ? "rounded" : "rounded-full",
          selected ? "border-primary" : "border-input",
          selected && multiple && "bg-primary text-primary-foreground",
        )}
      >
        {selected ? multiple ? <Check className="size-3.5" /> : <span className="size-2.5 rounded-full bg-primary" /> : null}
      </span>
      {media ? (
        <span aria-hidden className="shrink-0" data-testid={`${testID}-media`}>
          {media}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description ? <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span> : null}
      </span>
    </button>
  ),
);
ChoiceCard.displayName = "ChoiceCard";
