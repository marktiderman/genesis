"use client";

import * as React from "react";
import { Toolbar as ToolbarPrimitive } from "radix-ui";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "../../utils";
import { buttonVariants } from "./button";
import { toggleVariants } from "./toggle";

export const toolbarVariants = cva(
  "flex items-center gap-1 rounded-md border border-border bg-background p-1",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "w-fit flex-col",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
);

export interface ToolbarProps
  extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Root> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * Toolbar — a grouped set of controls that behaves as ONE tab stop.
 *
 * This is a primitive, not a layout, and the distinction is the whole reason
 * it wraps Radix instead of a `<div className="flex gap-1">`. Radix's Toolbar
 * owns a roving tabindex: Tab moves into and out of the whole group, and
 * Arrow/Home/End move between the items inside it. A layout, by the framework's
 * own definition, "positions things without knowing what they are" — this one
 * knows its children are focusable controls and manages their focus, so it
 * fails that test and passes the primitive one.
 *
 * `orientation` is passed to BOTH Radix (which uses it to decide whether
 * Left/Right or Up/Down are the navigation keys) and the CVA class (which uses
 * it to decide the flex direction). Splitting those would let the visual axis
 * and the keyboard axis disagree — arrows moving "down" a row of buttons.
 *
 * @stability Beta
 */
export const Toolbar = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Root>,
  ToolbarProps
>(({ className, orientation = "horizontal", testID, ...props }, ref) => (
  <ToolbarPrimitive.Root
    ref={ref}
    orientation={orientation}
    data-testid={testID}
    className={cn(toolbarVariants({ orientation }), className)}
    {...props}
  />
));
Toolbar.displayName = ToolbarPrimitive.Root.displayName;

export interface ToolbarButtonProps
  extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button>,
    VariantProps<typeof buttonVariants> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * ToolbarButton — a button that participates in the toolbar's roving tabindex.
 *
 * Styling reuses `buttonVariants` rather than declaring a second button look:
 * per the framework's "one home per concept", the question "what does a button
 * look like?" already has an answer. Only the DEFAULTS differ — `ghost`/`sm`,
 * because a toolbar is a dense strip of controls, not a page's primary action —
 * and both remain overridable.
 *
 * @stability Beta
 */
export const ToolbarButton = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Button>,
  ToolbarButtonProps
>(({ className, variant = "ghost", size = "sm", testID, ...props }, ref) => (
  <ToolbarPrimitive.Button
    ref={ref}
    data-testid={testID}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
));
ToolbarButton.displayName = ToolbarPrimitive.Button.displayName;

export interface ToolbarLinkProps
  extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Link> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * ToolbarLink — an anchor inside the toolbar's roving tabindex.
 *
 * Kept distinct from `ToolbarButton` because the element matters: a link
 * navigates and must stay an `<a>` for middle-click, "open in new tab" and the
 * screen-reader link rotor. Radix also gives it the toolbar's Enter/Space
 * handling without turning it into a button.
 *
 * @stability Beta
 */
export const ToolbarLink = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Link>,
  ToolbarLinkProps
>(({ className, testID, ...props }, ref) => (
  <ToolbarPrimitive.Link
    ref={ref}
    data-testid={testID}
    className={cn(
      "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-foreground underline-offset-4 ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
ToolbarLink.displayName = ToolbarPrimitive.Link.displayName;

export interface ToolbarSeparatorProps
  extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Separator> {}

/**
 * ToolbarSeparator — a decorative divider between toolbar groups.
 *
 * Radix excludes it from the roving tabindex, so arrow keys skip straight over
 * it instead of landing on a 1px line.
 *
 * Note the inverted axis, which is easy to get backwards: Radix gives the
 * separator the orientation PERPENDICULAR to the toolbar's, so a horizontal
 * toolbar contains separators with `data-orientation="vertical"`. The classes
 * below are keyed on the separator's own orientation accordingly — a vertical
 * separator is the tall thin rule.
 *
 * @stability Beta
 */
export const ToolbarSeparator = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Separator>,
  ToolbarSeparatorProps
>(({ className, ...props }, ref) => (
  <ToolbarPrimitive.Separator
    ref={ref}
    className={cn(
      "shrink-0 bg-border",
      "data-[orientation=vertical]:mx-1 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-4 data-[orientation=vertical]:w-px",
      "data-[orientation=horizontal]:my-1 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full",
      className
    )}
    {...props}
  />
));
ToolbarSeparator.displayName = ToolbarPrimitive.Separator.displayName;

/**
 * ToolbarToggleGroup — a set of pressed/unpressed controls inside a toolbar
 * (the classic bold / italic / underline cluster).
 *
 * @stability Beta
 */
export const ToolbarToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.ToggleGroup>,
  React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.ToggleGroup>
>(({ className, ...props }, ref) => (
  <ToolbarPrimitive.ToggleGroup
    ref={ref}
    className={cn("flex items-center gap-1", className)}
    {...props}
  />
));
ToolbarToggleGroup.displayName = ToolbarPrimitive.ToggleGroup.displayName;

export interface ToolbarToggleItemProps
  extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.ToggleItem>,
    VariantProps<typeof toggleVariants> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * ToolbarToggleItem — one member of a `ToolbarToggleGroup`.
 *
 * Reuses `toggleVariants` for the same reason `ToolbarButton` reuses
 * `buttonVariants`: `Toggle` already answers "what does a pressed control look
 * like?", and a second answer is how two implementations get born.
 *
 * @stability Beta
 */
export const ToolbarToggleItem = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.ToggleItem>,
  ToolbarToggleItemProps
>(({ className, variant, size = "sm", testID, ...props }, ref) => (
  <ToolbarPrimitive.ToggleItem
    ref={ref}
    data-testid={testID}
    className={cn(toggleVariants({ variant, size }), className)}
    {...props}
  />
));
ToolbarToggleItem.displayName = ToolbarPrimitive.ToggleItem.displayName;
