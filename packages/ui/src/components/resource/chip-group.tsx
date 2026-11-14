"use client";

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "../../utils";
import { Chip } from "./chip";

export type ChipGroupMode = "single" | "multiple";

interface ChipGroupBaseProps {
  disabled?: boolean;
  /** What the chips choose, for screen readers ("Filter by level"). */
  "aria-label"?: string;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

/** Any number of chips on (the default, as NativeChipGroup's). */
export interface ChipGroupMultipleProps extends ChipGroupBaseProps {
  mode?: "multiple" | undefined;
  value: readonly string[];
  onChange: (value: string[]) => void;
}

/** One chip on at a time. */
export interface ChipGroupSingleProps extends ChipGroupBaseProps {
  mode: "single";
  value: string;
  onChange: (value: string) => void;
  /** Pressing the chosen chip clears it (`onChange("")`). Default false: one stays chosen. */
  allowEmpty?: boolean;
}

export type ChipGroupProps = ChipGroupMultipleProps | ChipGroupSingleProps;

const ChipGroupContext = React.createContext<{ selected: (value: string) => boolean } | null>(null);

/**
 * ChipGroup — filter chips that toggle together: the twin of genesis-ui-native's NativeChipGroup,
 * with the same `mode` (default `multiple`), `value` and `onChange`; `onChange` gets a string in
 * `single` mode and a list in `multiple`.
 *
 * It is Radix's ToggleGroup, as genesis-ui's ToggleGroup is: one tab stop, the arrow keys move
 * between chips, Enter and Space toggle. Each `ChipGroupItem` draws the resource workspace's Chip,
 * ringed while it is on.
 *
 * @stability Beta
 */
export function ChipGroup(props: ChipGroupProps) {
  const { disabled = false, className, children, testID = "chip-group" } = props;
  const common = {
    disabled,
    "aria-label": props["aria-label"],
    "data-slot": "chip-group",
    "data-testid": testID,
    className: cn("flex flex-wrap gap-2", className),
  };
  if (props.mode === "single") {
    const { value, onChange, allowEmpty = false } = props;
    return (
      <ChipGroupContext.Provider value={{ selected: (v) => v === value }}>
        <ToggleGroupPrimitive.Root
          {...common}
          type="single"
          value={value}
          onValueChange={(next) => {
            // Radix clears a single group when its chosen item is pressed again.
            if (next === "" && !allowEmpty) return;
            onChange(next);
          }}
        >
          {children}
        </ToggleGroupPrimitive.Root>
      </ChipGroupContext.Provider>
    );
  }
  const { value, onChange } = props;
  return (
    <ChipGroupContext.Provider value={{ selected: (v) => value.includes(v) }}>
      <ToggleGroupPrimitive.Root {...common} type="multiple" value={[...value]} onValueChange={onChange}>
        {children}
      </ToggleGroupPrimitive.Root>
    </ChipGroupContext.Provider>
  );
}

export interface ChipGroupItemProps {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  testID?: string;
}

/** One chip of a ChipGroup: the group's toggle item, drawn as the Chip. */
export function ChipGroupItem({ value, children, icon, className, testID }: ChipGroupItemProps) {
  const ctx = React.useContext(ChipGroupContext);
  if (!ctx) throw new Error("ChipGroupItem must be used inside <ChipGroup>.");
  const on = ctx.selected(value);
  return (
    <ToggleGroupPrimitive.Item
      value={value}
      data-testid={testID ?? `chip-${value}`}
      className={cn(
        "inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <Chip tone={on ? "info" : "muted"} icon={icon} selected={on}>
        {children}
      </Chip>
    </ToggleGroupPrimitive.Item>
  );
}
