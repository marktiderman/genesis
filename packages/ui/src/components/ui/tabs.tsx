"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../../utils";

interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /**
   * Required here even though Radix's own `defaultValue` is optional — that is
   * the existing contract, and loosening it is a separate decision.
   */
  defaultValue: string;
}

/**
 * Tabs — a tablist and its panels.
 *
 * Backed by Radix `Tabs`. The hand-rolled version was a React context plus a
 * row of plain `<button>`s: it tracked the selected value correctly and
 * nothing else. Every keyboard and screen-reader affordance the WAI-ARIA tabs
 * pattern asks for was missing — `role="tablist"`/`"tab"`/`"tabpanel"`, the
 * `aria-selected` state, the `aria-controls`/`aria-labelledby` link between a
 * tab and its panel, the roving `tabindex` that makes the whole tablist ONE
 * tab stop instead of N, and Arrow/Home/End navigation between tabs. Radix
 * supplies all of it, plus the selection state the old version already
 * handled.
 *
 * One behavioural note worth knowing: Radix selects on `mousedown` rather than
 * `click`. Pointer users see no difference, but a synthetic `fireEvent.click`
 * on a trigger no longer changes tabs.
 *
 * @stability Stable
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    className={cn("w-full", className)}
    {...props}
  />
));
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      // Same active styling as before, now keyed off the `data-state` Radix
      // maintains rather than an `isActive` boolean read from local context.
      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
