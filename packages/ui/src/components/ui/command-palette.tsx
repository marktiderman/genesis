"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./command";

export interface CommandPaletteItem {
  id: string;
  label: string;
  shortcut?: string;
  group?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandPaletteItem[];
  placeholder?: string;
  emptyMessage?: string;
  title?: string;
}

/**
 * Thin action registry over `CommandDialog` / cmdk.
 * Consumers register flat commands; optional `group` buckets them.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = "Type a command or search…",
  emptyMessage = "No results found.",
  title = "Command palette",
}: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandPaletteItem[]>();
    for (const cmd of commands) {
      const key = cmd.group ?? "Actions";
      const list = map.get(key) ?? [];
      list.push(cmd);
      map.set(key, list);
    }
    return map;
  }, [commands]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={placeholder} aria-label={title} />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {Array.from(groups.entries()).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={`${cmd.id} ${cmd.label}`}
                onSelect={() => {
                  onOpenChange(false);
                  cmd.onSelect();
                }}
              >
                {cmd.label}
                {cmd.shortcut ? (
                  <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Toggle a command palette with Cmd/Ctrl+K.
 * Returns `[open, setOpen]` — pass into `<CommandPalette open onOpenChange />`.
 */
export function useCommandPaletteHotkey(
  enabled = true,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  return [open, setOpen];
}
