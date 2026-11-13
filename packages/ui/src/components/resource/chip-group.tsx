"use client";

import * as React from "react";
import { cn } from "../../utils";
import { Chip } from "./chip";

export type ChipGroupMode = "single" | "multiple";

interface ChipGroupContextValue {
  mode: ChipGroupMode;
  selected: ReadonlySet<string>;
  toggle: (value: string) => void;
  disabled: boolean;
}

const ChipGroupContext = React.createContext<ChipGroupContextValue | null>(null);

export interface ChipGroupProps {
  /** One chip on at a time (`single`, the default), or any number. */
  mode?: ChipGroupMode;
  /** The chosen value (`single`) or values (`multiple`). */
  value: string | readonly string[];
  onChange: (value: string | string[]) => void;
  /** In `single` mode, pressing the chosen chip clears it. Default false (one stays chosen). */
  allowEmpty?: boolean;
  disabled?: boolean;
  /** What the chips choose, for screen readers ("Filter by level"). */
  "aria-label"?: string;
  className?: string;
  children: React.ReactNode;
  testID?: string;
}

/**
 * ChipGroup — filter chips that toggle together: the twin of genesis-ui-native's NativeChipGroup,
 * with the same `mode`, `value` and `onChange`. Each `ChipGroupItem` is the toggle Chip (the
 * resource workspace's, `aria-pressed`, Enter and Space), on while its value is chosen.
 *
 * @stability Beta
 */
export function ChipGroup({ mode = "single", value, onChange, allowEmpty = false, disabled = false, className, children, testID = "chip-group", ...aria }: ChipGroupProps) {
  const selected = React.useMemo(() => new Set(typeof value === "string" ? (value ? [value] : []) : value), [value]);
  const toggle = React.useCallback(
    (v: string) => {
      if (mode === "single") {
        if (selected.has(v)) {
          if (allowEmpty) onChange("");
          return;
        }
        onChange(v);
        return;
      }
      const next = new Set(selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      onChange([...next]);
    },
    [mode, selected, allowEmpty, onChange],
  );
  const ctx = React.useMemo(() => ({ mode, selected, toggle, disabled }), [mode, selected, toggle, disabled]);
  return (
    <ChipGroupContext.Provider value={ctx}>
      <div role="group" aria-label={aria["aria-label"]} data-slot="chip-group" data-testid={testID} className={cn("flex flex-wrap gap-2", className)}>
        {children}
      </div>
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

/** One chip of a ChipGroup. */
export function ChipGroupItem({ value, children, icon, className, testID }: ChipGroupItemProps) {
  const ctx = React.useContext(ChipGroupContext);
  if (!ctx) throw new Error("ChipGroupItem must be used inside <ChipGroup>.");
  const on = ctx.selected.has(value);
  return (
    <Chip
      tone={on ? "info" : "muted"}
      icon={icon}
      selected={on}
      onSelectedChange={() => ctx.toggle(value)}
      disabled={ctx.disabled}
      className={cn(className)}
      testID={testID ?? `chip-${value}`}
    >
      {children}
    </Chip>
  );
}
