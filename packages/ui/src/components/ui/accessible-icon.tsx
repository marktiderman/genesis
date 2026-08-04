// No "use client" — same reasoning as visually-hidden.tsx: no hooks, no
// directive in the Radix source, so it stays server-importable.
import * as React from "react";
import { AccessibleIcon as AccessibleIconPrimitive } from "radix-ui";

export interface AccessibleIconProps {
  /**
   * The icon element. It is marked `aria-hidden` and given `focusable="false"`
   * so assistive technology reads `label` once instead of announcing the SVG's
   * own title, or nothing at all.
   */
  children: React.ReactNode;
  /**
   * The accessible name for the icon — visually hidden, announced to screen
   * readers, exactly like `alt` on an `<img>`. Required, because an icon with
   * no label is the failure this component exists to prevent.
   */
  label: string;
}

/**
 * AccessibleIcon — gives a decorative icon an accessible name.
 *
 * The pattern for every icon-only control: hide the glyph from assistive tech
 * and put a real, visually-hidden string next to it. Done by hand this is
 * three easily-forgotten steps (`aria-hidden` on the SVG, `focusable="false"`
 * for IE/Edge-era SVG focus behavior, a `VisuallyHidden` sibling), and getting
 * one wrong produces a control announced as "button" with no name — which
 * looks completely fine on screen.
 *
 * Note the shape: this renders no host element of its own. It clones the child
 * and appends the hidden label, so there is no DOM node to attach a `ref` or a
 * `className` to and, deliberately, no `forwardRef` here — unlike every other
 * primitive in this folder. Style the icon or the surrounding control instead.
 *
 * ```tsx
 * <Button size="icon">
 *   <AccessibleIcon label="Delete item">
 *     <TrashIcon />
 *   </AccessibleIcon>
 * </Button>
 * ```
 *
 * @stability Beta
 */
export function AccessibleIcon({ children, label }: AccessibleIconProps) {
  return (
    <AccessibleIconPrimitive.Root label={label}>
      {children}
    </AccessibleIconPrimitive.Root>
  );
}
AccessibleIcon.displayName = "AccessibleIcon";
