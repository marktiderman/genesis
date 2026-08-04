// No "use client": this renders a span with inline styles and no hooks, and
// neither `radix-ui` nor `@radix-ui/react-visually-hidden` carries the
// directive itself. Leaving it off keeps the primitive importable from an RSC
// server component — which matters, because the label an icon-only control
// needs is very often rendered on the server.
import * as React from "react";
import { VisuallyHidden as VisuallyHiddenPrimitive } from "radix-ui";

import { cn } from "../../utils";

export interface VisuallyHiddenProps
  extends React.ComponentPropsWithoutRef<typeof VisuallyHiddenPrimitive.Root> {
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * VisuallyHidden — content removed from the visual layout but kept in the
 * accessibility tree.
 *
 * This is the correct tool for the label an icon-only control needs, for the
 * `DialogTitle` a dialog must have even when the design shows none, and for
 * live-region status text. It is NOT `display: none` and it is NOT
 * `visibility: hidden` — both of those remove the node from the a11y tree too,
 * which is the exact opposite of the intent.
 *
 * Why Radix rather than Tailwind's `sr-only`: the two produce the same result,
 * but `sr-only` is a class a consumer's `@apply`, a purge misconfiguration, or
 * a competing utility can quietly defeat, and the failure is silent — the text
 * simply becomes visible, or the layout shifts, and nothing in a build catches
 * it. Radix applies the clip rectangle as inline styles on the element itself,
 * so there is no stylesheet for the consumer's build to lose.
 *
 * **That robustness cuts both ways, and it is the one thing to know before
 * reaching for this.** An inline style beats any ordinary class declaration, so
 * a `className` cannot override the clipping either — not accidentally, and
 * not on purpose. `className` is merged for non-visual concerns (a test hook, a
 * data attribute target); it is NOT a way to reveal the content.
 *
 * The escape hatch is the `style` prop, which Radix spreads *after* its own
 * (`{...VISUALLY_HIDDEN_STYLES, ...props.style}`) and which therefore wins.
 * Both behaviours are pinned in this component's tests, because the docs above
 * depend on them.
 *
 * **This is therefore the wrong primitive for a skip link.** A skip link is
 * hidden until focused, and "until focused" is state, not a class — a static
 * `style` prop cannot express it and `focus-within:` utilities cannot win
 * against the inline rule. Give a skip link its own element with real CSS, or
 * drive the `style` prop from `onFocus`/`onBlur`. Use `VisuallyHidden` for text
 * that stays hidden: control labels, dialog titles a design omits, live-region
 * status text.
 *
 * @stability Beta
 */
export const VisuallyHidden = React.forwardRef<
  React.ComponentRef<typeof VisuallyHiddenPrimitive.Root>,
  VisuallyHiddenProps
>(({ className, testID, ...props }, ref) => (
  <VisuallyHiddenPrimitive.Root
    ref={ref}
    data-testid={testID}
    className={cn(className)}
    {...props}
  />
));
VisuallyHidden.displayName = VisuallyHiddenPrimitive.Root.displayName;
