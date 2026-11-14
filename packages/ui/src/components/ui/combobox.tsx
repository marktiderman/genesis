"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { filterOptions, type ComboboxOption } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type { ComboboxOption };

export interface ComboboxProps<T extends string | number = string> {
  options: readonly ComboboxOption<T>[];
  value?: T | undefined;
  onChange: (value: T) => void;
  /** The button's words with nothing chosen. Default "Select…". */
  placeholder?: string;
  /** The search box's placeholder and accessible name. Default "Search…". */
  searchPlaceholder?: string;
  /** Shown when the search matches nothing. Default "No results." */
  emptyText?: React.ReactNode;
  /**
   * Which options a search keeps. Default: every word typed, in the label or description,
   * ignoring case and accents (genesis-core's `filterOptions`, as NativeCombobox).
   */
  filter?: (options: readonly ComboboxOption<T>[], query: string) => ComboboxOption<T>[];
  disabled?: boolean;
  /** The trigger's accessible name when no visible label points at it. */
  "aria-label"?: string;
  id?: string;
  className?: string;
  contentClassName?: string;
  testID?: string;
}

/**
 * Combobox — pick one option from a list you can search: the twin of genesis-ui-native's
 * NativeCombobox, built from Command in a Popover. The trigger is a button that opens a listbox;
 * the search box inside is the combobox (arrow keys move, Enter picks, Escape closes).
 *
 * The search is genesis-core's (`filterOptions`), so the web and the phone find the same options.
 *
 * It is a form field that picks one value. A filter bar that picks several, with counts, is the
 * data layer's `FilterCombobox`.
 *
 * @stability Beta
 */
export function Combobox<T extends string | number = string>({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  filter = filterOptions,
  disabled,
  id,
  className,
  contentClassName,
  testID = "combobox",
  ...aria
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const chosen = options.find((o) => o.value === value);
  const shown = filter(options, query);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={aria["aria-label"]}
          disabled={disabled}
          testID={`${testID}-trigger`}
          className={cn("w-full justify-between font-normal", !chosen && "text-muted-foreground", className)}
        >
          <span className="truncate">{chosen?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] min-w-56 p-0", contentClassName)} align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder} data-testid={`${testID}-search`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {shown.map((o) => (
                <CommandItem
                  key={String(o.value)}
                  value={String(o.value)}
                  disabled={o.disabled === true}
                  data-testid={`${testID}-option-${String(o.value)}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 size-4", o.value === value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.description ? <span className="truncate text-xs text-muted-foreground">{o.description}</span> : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
