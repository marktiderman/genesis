"use client";

import * as React from "react";
import { Slot, Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../../utils";

export interface TooltipProps
  // `HTMLAttributes<T>` already declares a `content?: string` RDFa attribute
  // (React's typing of the generic `content`/`about`/`property`/... RDFa
  // metadata attributes valid on any element) — omit it before redeclaring
  // below with the widened `ReactNode` type, otherwise the two
  // incompatible `content` types conflict (TS2430).
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "content"> {
  /**
   * Tooltip body. Accepts any `ReactNode` — icons, formatted or multi-line
   * content — not just a plain string.
   */
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /**
   * Milliseconds a POINTER must rest on the trigger before the tooltip
   * opens. Keyboard focus is never delayed — Radix opens instantly on focus
   * regardless of this value.
   *
   * Defaults to `0` rather than Radix's own `700`: the CSS-only
   * implementation this replaced revealed the bubble the instant the pointer
   * entered, and inheriting a 700ms delay on upgrade would read as the
   * tooltip having broken. Raise it to get the "don't fire while the cursor
   * sweeps across the UI" behaviour the hand-rolled version could not offer.
   */
  delayDuration?: number;
}

/**
 * Sits between Radix's `Tooltip.Trigger` (`asChild`) and the caller's child so
 * the two `aria-describedby` values can be UNIONED instead of one silently
 * winning.
 *
 * Radix wires the association itself — `Tooltip.Trigger` carries
 * `aria-describedby={contentId}` while open and `Tooltip.Content` renders with
 * that same `id` and `role="tooltip"` — so the `useId` + `cloneElement` pass
 * this component used to do by hand is gone. The one thing Radix does *not* do
 * is compose: `Slot` merges child props OVER slot props for every attribute
 * that isn't `className`, `style` or an `on*` handler, so a trigger that
 * already declared `aria-describedby="hint"` would drop the tooltip's id
 * outright — reintroducing exactly the silence CMT-367-003 fixed.
 *
 * Hence this shim. It lifts Radix's id off the slot props, merges it with
 * whatever the child declared, and puts the union back ON THE CHILD, where
 * `Slot`'s child-wins rule leaves it alone. When the tooltip is closed Radix
 * passes no id, so the child is left with precisely the value it came with —
 * no dangling IDREF pointing at an unmounted bubble.
 */
const TooltipTriggerSlot = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { children: React.ReactElement }
>(function TooltipTriggerSlot(
  { children, "aria-describedby": tooltipDescribedBy, ...triggerProps },
  ref
) {
  const ownDescribedBy = (children.props as { "aria-describedby"?: string })[
    "aria-describedby"
  ];
  // `aria-describedby` is a space-separated ID list; both references are
  // legitimate, so neither may replace the other.
  const describedBy =
    ownDescribedBy && tooltipDescribedBy
      ? `${ownDescribedBy} ${tooltipDescribedBy}`
      : (tooltipDescribedBy ?? ownDescribedBy);

  return (
    <Slot.Root ref={ref} {...triggerProps}>
      {React.cloneElement(
        children as React.ReactElement<{ "aria-describedby"?: string }>,
        { "aria-describedby": describedBy }
      )}
    </Slot.Root>
  );
});

/**
 * Tooltip — hover/focus hint anchored to its trigger child.
 *
 * Backed by Radix `Tooltip`, which owns the parts a design system should not
 * be maintaining itself: open/close state, the pointer delay, opening on
 * keyboard focus and closing on blur/Escape/scroll, the portal, collision
 * detection against the viewport, and the `aria-describedby` ↔ `role="tooltip"`
 * association. The previous implementation was CSS-only — a `group` wrapper
 * plus `group-hover:block` / `group-focus-within:block` — which meant no
 * portal (so the bubble was clipped by any `overflow:hidden` ancestor), no
 * collision handling (so it ran off-screen at the edges), no dismissal, and no
 * delay.
 *
 * The wrapper `<div>` stays, and keeps `group relative inline-flex`: it is
 * where `className` and the rest of `HTMLAttributes<HTMLDivElement>` land, so
 * removing it would silently drop props callers already pass. Positioning no
 * longer depends on it.
 *
 * The bubble keeps `whitespace-nowrap`, so rich `content` does not soft wrap
 * by itself — long multi-line content needs an explicit `<br />`, or a
 * `whitespace-normal` + width class on the node you pass in. Dropping
 * `whitespace-nowrap` here would re-wrap every existing single-line string
 * tooltip, so it stays opt-out rather than opt-in.
 *
 * @stability Stable
 */
export function Tooltip({
  content,
  side = "top",
  delayDuration = 0,
  className,
  children,
  ...props
}: TooltipProps) {
  // Radix's `Slot` needs exactly one element with a real DOM node to attach the
  // trigger behaviour (and its ref) to, and THROWS on anything else. `children`
  // here has always been free-form `ReactNode` and
  // `<Tooltip content="…">plain text</Tooltip>` has always rendered, so text /
  // multiple children get a `<span>` rather than a crash.
  //
  // A FRAGMENT has to be caught explicitly: `isValidElement(<>…</>)` is `true`,
  // so a fragment would sail past a bare validity check — and then `Slot` clones
  // the fragment rather than the DOM node inside it. Fragments take no props, so
  // every handler and the ref are dropped on the floor and the tooltip simply
  // never opens (React also warns about the invalid props). Wrapping is the only
  // way to give Radix something to hold.
  //
  // The span deliberately gets no `tabIndex`: a bare text trigger was never a
  // tab stop, and inventing one would renumber every consumer's tab order. A
  // non-focusable trigger still has no keyboard path to the tooltip — pass a
  // focusable element (button, link, input) if you need one.
  const isSlottable =
    React.isValidElement(children) && children.type !== React.Fragment;
  const trigger = isSlottable ? children : <span>{children}</span>;

  // THEME SCOPE. `GenesisThemeProvider` (web) scopes mode-specific CSS variables
  // under a `[data-theme="…"]` wrapper, and a portal lands the bubble on
  // `document.body` — outside that subtree, where `bg-foreground` /
  // `text-background` would resolve against the light `:root` values and a dark
  // app would render a light tooltip.
  //
  // The fix mirrors the nearest ancestor's `data-theme` onto the bubble itself,
  // so the same `[data-theme="dark"] { … }` rule matches it directly. Mirroring
  // rather than re-parenting the portal is deliberate: portalling into the
  // themed element would put the bubble back inside a subtree that may well be
  // the `overflow:hidden` container the portal exists to escape.
  //
  // Read at open time rather than on mount, so a runtime theme toggle is picked
  // up. The read is batched with Radix's own open state, so the bubble carries
  // the attribute on its first commit — it never paints unthemed.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [themeScope, setThemeScope] = React.useState<string | null>(null);
  const handleOpenChange = React.useCallback((open: boolean) => {
    if (!open) return;
    setThemeScope(
      wrapperRef.current?.closest("[data-theme]")?.getAttribute("data-theme") ??
        null
    );
  }, []);

  return (
    // The provider is rendered per-tooltip so the public API stays a single
    // self-contained component — consumers do not have to mount one at their
    // app root the way raw Radix requires. The trade-off is that Radix's
    // "skip the delay when moving between neighbouring tooltips" grouping is
    // scoped to one tooltip, which is moot at the default `delayDuration` of 0.
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      {/*
        `disableHoverableContent` because the bubble is `pointer-events-none`:
        it can never receive the pointer, so the grace-area machinery that
        keeps a hoverable tooltip open would only cost document-level pointer
        tracking for behaviour that cannot happen. This also preserves the old
        semantics exactly — leaving the trigger closes the tooltip.
      */}
      <TooltipPrimitive.Root disableHoverableContent onOpenChange={handleOpenChange}>
        <div
          ref={wrapperRef}
          className={cn("group relative inline-flex", className)}
          {...props}
        >
          <TooltipPrimitive.Trigger asChild>
            <TooltipTriggerSlot>{trigger}</TooltipTriggerSlot>
          </TooltipPrimitive.Trigger>
        </div>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            // 8px — what the old `mb-2`/`mt-2`/`ml-2`/`mr-2` margins produced.
            sideOffset={8}
            data-theme={themeScope ?? undefined}
            className={cn(
              "pointer-events-none z-50 whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
              // The implementation this replaced had NO motion at all, so the
              // entrance animation above is new. `design-opinions.md` keeps
              // premium motion on by default and makes reduced-motion respect
              // the accessibility escape hatch rather than an opt-in, so honour
              // `prefers-reduced-motion` instead of dropping the animation.
              "motion-reduce:animate-none motion-reduce:transition-none"
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
