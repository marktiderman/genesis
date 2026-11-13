"use client";

// A row's menu (ADR 0017 §2): a trailing "More" button and the same items on right-click. A
// refused item stays in the menu, disabled, with the guard's sentence under its label (and as its
// accessible description), so people learn why rather than finding it missing.

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ContextMenuItem, ContextMenuSeparator } from "../ui/context-menu";
import { cn } from "../../utils";

/**
 * One item in a row's menu.
 *
 * @stability Beta
 */
export interface ResourceRowMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** Drawn in the destructive style, and placed last. */
  destructive?: boolean | undefined;
  /** Why it can't run on this row: the item stays, disabled, with these words. */
  reason?: string | undefined;
}

function sorted(items: readonly ResourceRowMenuItem[]) {
  // Destructive last, the rest in their order.
  return [...items.filter((i) => !i.destructive), ...items.filter((i) => i.destructive)];
}

function Label({ item }: { item: ResourceRowMenuItem }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{item.label}</span>
      {item.reason ? <span className="text-xs text-muted-foreground whitespace-normal">{item.reason}</span> : null}
    </span>
  );
}

/**
 * The "More" button and its menu for one row.
 *
 * @stability Beta
 */
export function RowMenuButton({ items, label, testID }: { items: readonly ResourceRowMenuItem[]; label: string; testID?: string }): ReactNode {
  if (!items.length) return null;
  const list = sorted(items);
  const firstDestructive = list.findIndex((i) => i.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={label} data-testid={testID}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {list.map((item, i) => [
          i === firstDestructive && i > 0 ? <DropdownMenuSeparator key={`${item.key}:sep`} /> : null,
          <DropdownMenuItem
            key={item.key}
            disabled={!!item.reason}
            onSelect={item.reason ? undefined : item.onSelect}
            className={cn(item.destructive && "text-destructive focus:text-destructive")}
            data-testid={testID ? `${testID}-${item.key}` : undefined}
            {...(item.reason ? { "aria-description": item.reason, title: item.reason } : {})}
          >
            <Label item={item} />
          </DropdownMenuItem>,
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The same items as context-menu items, for a right-click on the row. @stability Beta */
export function RowContextMenuItems({ items }: { items: readonly ResourceRowMenuItem[] }): ReactNode {
  const list = sorted(items);
  const firstDestructive = list.findIndex((i) => i.destructive);
  return (
    <>
      {list.map((item, i) => [
        i === firstDestructive && i > 0 ? <ContextMenuSeparator key={`${item.key}:sep`} /> : null,
        <ContextMenuItem
          key={item.key}
          disabled={!!item.reason}
          onSelect={item.reason ? undefined : item.onSelect}
          className={cn(item.destructive && "text-destructive focus:text-destructive")}
          {...(item.reason ? { "aria-description": item.reason, title: item.reason } : {})}
        >
          <Label item={item} />
        </ContextMenuItem>,
      ])}
    </>
  );
}
