import { useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@marktiderman/genesis-ui/command";
import { cn } from "@marktiderman/genesis-ui/utils";
import { searchOptions, type ChoiceOption } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { useFormPresentation } from "./presentation";

/** A small picture beside an option's label: decorative, since the label says what it is. */
export function OptionImage({ src, large }: { src: string; large?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      data-gf-option-image=""
      className={cn("shrink-0 rounded-md bg-muted object-cover", large ? "size-12" : "size-10")}
    />
  );
}

/** An option's label with its description as a muted line under it. */
export function OptionText({ label, description }: { label: string; description?: string | undefined }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span>{label}</span>
      {description ? (
        <span className="text-sm text-muted-foreground" data-gf-option-description="">
          {description}
        </span>
      ) : null}
    </span>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-primary", on ? "opacity-100" : "opacity-0")}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** The value of the "Other" row in the list: never stored. */
export const SEARCH_OTHER_VALUE = "\u0000other";

/**
 * A long option list with a search box over it (genesis-ui `Command`): typing narrows the list
 * (`searchOptions`, the same match on every platform), arrow keys move through it, and Enter or a
 * tap picks. One pick for a single choice or dropdown, several for a multiple choice. It sits in
 * the page rather than a popover, so it works the same in classic and focus layouts and on a
 * phone. `selected` holds the values picked; `onPick` gets the value tapped (or
 * `SEARCH_OTHER_VALUE` for the "Other" row).
 */
export function SearchableOptions({
  props,
  options,
  selected,
  multiple,
  otherLabel,
  otherOn,
  onPick,
}: {
  props: FieldRendererProps;
  options: readonly ChoiceOption[];
  selected: readonly string[];
  multiple: boolean;
  otherLabel?: string | undefined;
  otherOn?: boolean | undefined;
  onPick: (value: string) => void;
}) {
  const { binding, inputId } = props;
  const [query, setQuery] = useState("");
  const { presentation } = useFormPresentation();
  const page = presentation === "page";
  const shown = searchOptions(options, query);
  const chosen = options.filter((o) => selected.includes(o.value));
  const labelOf = (o: ChoiceOption) => o.label ?? o.value;
  return (
    <div className="space-y-2" data-gf-searchable="">
      <Command shouldFilter={false} label={binding.label} className="rounded-md border border-input bg-background">
        <CommandInput
          id={inputId}
          data-gf-focus=""
          value={query}
          onValueChange={setQuery}
          placeholder="Type to search"
          aria-label={`Search: ${binding.label}`}
          aria-invalid={binding.error ? true : undefined}
          aria-required={binding.field.required || undefined}
          className={cn(page && "text-base")}
        />
        <CommandList className="max-h-72" aria-multiselectable={multiple || undefined}>
          <CommandEmpty>No matches.</CommandEmpty>
          {shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <CommandItem
                key={o.value}
                value={o.value}
                keywords={[labelOf(o)]}
                aria-checked={on}
                onSelect={() => onPick(o.value)}
                className={cn("min-h-11 gap-3 text-base", page && "min-h-12")}
                data-gf-option={o.value}
              >
                <CheckMark on={on} />
                {o.image ? <OptionImage src={o.image} /> : null}
                <OptionText label={labelOf(o)} description={o.description} />
              </CommandItem>
            );
          })}
          {otherLabel ? (
            <CommandItem
              value={SEARCH_OTHER_VALUE}
              aria-checked={!!otherOn}
              onSelect={() => onPick(SEARCH_OTHER_VALUE)}
              className={cn("min-h-11 gap-3 text-base", page && "min-h-12")}
            >
              <CheckMark on={!!otherOn} />
              <OptionText label={otherLabel} />
            </CommandItem>
          ) : null}
        </CommandList>
      </Command>
      {chosen.length ? (
        <p className="text-sm text-muted-foreground" aria-live="polite" data-gf-chosen="">
          {multiple ? "Chosen" : "Your choice"}: {chosen.map(labelOf).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
