"use client";

import * as React from "react";
import { unstable_PasswordToggleField as PasswordToggleFieldPrimitive } from "radix-ui";

import { cn } from "../../utils";

export interface PasswordToggleFieldProps
  extends React.ComponentPropsWithoutRef<
    typeof PasswordToggleFieldPrimitive.Root
  > {
  /** Class names for the field wrapper (the positioned box, see below). */
  className?: string;
  /** Stable test/automation selector for the wrapper (emitted as `data-testid`). */
  testID?: string;
}

/**
 * PasswordToggleField — a password input with a show/hide control that keeps
 * focus and caret position across the toggle.
 *
 * Composition:
 *
 * ```tsx
 * <PasswordToggleField>
 *   <PasswordToggleFieldInput placeholder="Password" />
 *   <PasswordToggleFieldToggle>
 *     <PasswordToggleFieldSlot visible={<EyeOff />} hidden={<Eye />} />
 *   </PasswordToggleFieldToggle>
 * </PasswordToggleField>
 * ```
 *
 * Why Radix and not five lines of `useState` plus `type={shown ? "text" :
 * "password"}`: the naive version loses the caret on every toggle, leaves the
 * button unlabelled (or labelled with a state that never updates), and — the
 * part nobody writes — leaves the password visible in the DOM after the form is
 * submitted or reset. Radix resets visibility on both `submit` and `reset`,
 * restores `selectionStart`/`selectionEnd` after the type swap, and derives the
 * toggle's `aria-label` ("Show password" / "Hide password") from the current
 * state unless the caller supplies text or a label of their own.
 *
 * Radix's own root is a **context provider with no DOM node of its own**, so
 * this wrapper renders a `relative` box around the children. That box is
 * load-bearing, not decoration: `PasswordToggleFieldToggle` is positioned
 * `absolute`, and absolute positioning resolves against the nearest positioned
 * ancestor. Without a wrapper the toggle would escape the field and land
 * against whatever positioned ancestor the consumer's page happened to have —
 * or the initial containing block, i.e. the page corner. The composition
 * documented above would put the show/hide button nowhere near the input.
 *
 * ---
 *
 * **Stability.** Radix ships this primitive as `unstable_PasswordToggleField`
 * and documents its API as subject to change; the underlying
 * `@radix-ui/react-password-toggle-field` package is still on `0.1.x`. It is
 * exported here under its stable-looking name for ergonomics, but it is the one
 * component in this package whose props may change in a minor release. Pin the
 * package if that is unacceptable, or compose `Input` + `Button` yourself.
 *
 * @stability Experimental
 */
export function PasswordToggleField({
  className,
  testID,
  children,
  ...props
}: PasswordToggleFieldProps) {
  return (
    <PasswordToggleFieldPrimitive.Root {...props}>
      <div
        data-slot="password-toggle-field"
        data-testid={testID}
        className={cn("relative w-full", className)}
      >
        {children}
      </div>
    </PasswordToggleFieldPrimitive.Root>
  );
}
PasswordToggleField.displayName = "PasswordToggleField";

export interface PasswordToggleFieldInputProps
  extends React.ComponentPropsWithoutRef<
    typeof PasswordToggleFieldPrimitive.Input
  > {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * PasswordToggleFieldInput — the field itself.
 *
 * Styling matches `Input`, with right padding reserved for the toggle so the
 * button never sits on top of the text. Radix owns `type`, which is why it is
 * absent from the props: it is derived from the field's visibility state and
 * a caller-supplied value would fight it.
 *
 * @stability Experimental
 */
export const PasswordToggleFieldInput = React.forwardRef<
  React.ComponentRef<typeof PasswordToggleFieldPrimitive.Input>,
  PasswordToggleFieldInputProps
>(({ className, testID, ...props }, ref) => (
  <PasswordToggleFieldPrimitive.Input
    ref={ref}
    data-slot="input"
    data-testid={testID}
    className={cn(
      "flex h-10 w-full min-w-0 rounded-md border border-input bg-background py-2 pl-3 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive aria-invalid:ring-destructive/20",
      className
    )}
    {...props}
  />
));
PasswordToggleFieldInput.displayName = "PasswordToggleFieldInput";

export interface PasswordToggleFieldToggleProps
  extends React.ComponentPropsWithoutRef<
    typeof PasswordToggleFieldPrimitive.Toggle
  > {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * PasswordToggleFieldToggle — the show/hide button.
 *
 * Positioned `absolute` against the `relative` box that `PasswordToggleField`
 * renders — which is why that box exists; see the root's docs. Keep this
 * component inside a `PasswordToggleField`: positioning it against an
 * arbitrary ancestor is not a supported arrangement.
 *
 * Its accessible name comes from Radix ("Show password" / "Hide password",
 * following the current state) unless you provide inner text or an
 * `aria-label`.
 *
 * @stability Experimental
 */
export const PasswordToggleFieldToggle = React.forwardRef<
  React.ComponentRef<typeof PasswordToggleFieldPrimitive.Toggle>,
  PasswordToggleFieldToggleProps
>(({ className, testID, ...props }, ref) => (
  <PasswordToggleFieldPrimitive.Toggle
    ref={ref}
    data-testid={testID}
    className={cn(
      "absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
));
PasswordToggleFieldToggle.displayName = "PasswordToggleFieldToggle";

export type PasswordToggleFieldSlotProps = React.ComponentPropsWithoutRef<
  typeof PasswordToggleFieldPrimitive.Slot
>;

/**
 * PasswordToggleFieldSlot — renders one of two nodes depending on visibility.
 *
 * Takes either the declarative pair (`visible` / `hidden`) or a `render`
 * callback receiving `{ visible }`. Unstyled by design: it is a switch, not a
 * box, and wrapping it in an element would break the toggle's `[&_svg]` icon
 * sizing.
 *
 * @stability Experimental
 */
export function PasswordToggleFieldSlot(props: PasswordToggleFieldSlotProps) {
  return <PasswordToggleFieldPrimitive.Slot {...props} />;
}
PasswordToggleFieldSlot.displayName = "PasswordToggleFieldSlot";

export interface PasswordToggleFieldIconProps
  extends React.ComponentPropsWithoutRef<
    typeof PasswordToggleFieldPrimitive.Icon
  > {}

/**
 * PasswordToggleFieldIcon — the SVG-level variant of `PasswordToggleFieldSlot`.
 *
 * Swaps the icon's inner content while keeping ONE `<svg>` element mounted, so
 * a CSS transition on the glyph survives the toggle instead of being restarted
 * by a remount.
 *
 * @stability Experimental
 */
export const PasswordToggleFieldIcon = React.forwardRef<
  React.ComponentRef<typeof PasswordToggleFieldPrimitive.Icon>,
  PasswordToggleFieldIconProps
>(({ className, ...props }, ref) => (
  <PasswordToggleFieldPrimitive.Icon
    ref={ref}
    className={cn("size-4 shrink-0", className)}
    {...props}
  />
));
PasswordToggleFieldIcon.displayName = "PasswordToggleFieldIcon";
