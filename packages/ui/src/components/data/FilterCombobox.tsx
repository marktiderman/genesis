"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Button } from "../ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../utils";
import type { LucideIcon } from "lucide-react";

export interface FilterOption {
  value: string;
  label?: string;
  count?: number;
}

interface FilterComboboxProps {
  label: string;
  icon: LucideIcon;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder?: string;
  allLabel?: string;
  /** Optional map of value -> display label */
  labelMap?: Record<string, string>;
}

export function FilterCombobox({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  searchPlaceholder,
  allLabel,
  labelMap,
}: FilterComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const getDisplayLabel = (value: string) => labelMap?.[value] || value;

  const triggerLabel =
    selected.length === 0
      ? allLabel || `All ${label}`
      : selected.length === 1
        ? getDisplayLabel(selected[0])
        : `${selected.length} ${label.toLowerCase()}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selected.length > 0 ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 gap-1.5"
        >
          <Icon className="h-3 w-3" />
          {triggerLabel}
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[220px] max-w-[calc(100vw-2rem)] p-0 bg-popover z-50"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
          />
          <CommandList>
            <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__all_${label.toLowerCase()}__`}
                onSelect={() => onChange([])}
              >
                <Check
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    selected.length === 0 ? "opacity-100" : "opacity-0",
                  )}
                />
                {allLabel || `All ${label}`}
              </CommandItem>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label || getDisplayLabel(opt.value)}
                  onSelect={() => toggle(opt.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      selected.includes(opt.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="flex-1">
                    {opt.label || getDisplayLabel(opt.value)}
                  </span>
                  {opt.count !== undefined && (
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {opt.count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
