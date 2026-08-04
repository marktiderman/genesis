"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import { cn } from "../../utils";

interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /**
   * Which axes get a scrollbar. `"vertical"` (the default) also clips
   * horizontal overflow, `"horizontal"` clips vertical overflow, `"both"`
   * scrolls either way — the same meaning the `overflow-*` utilities this
   * replaced had, because Radix's viewport derives `overflow-x`/`overflow-y`
   * from which scrollbars are mounted.
   */
  orientation?: "vertical" | "horizontal" | "both";
  /**
   * Props for the inner viewport — the element that actually scrolls.
   *
   * The root that this component's `ref`, `className` and remaining props land
   * on is `overflow: hidden`; scrolling happens one level in. `onScroll`,
   * `onScrollCapture` and `nonce` are routed to the viewport automatically
   * because they have no other correct destination. Anything else that must
   * address the scroller specifically — a `ref` for programmatic `scrollTop`, a
   * `tabIndex`, an `id`, `aria-*` — goes here. Values passed here win over the
   * automatically routed ones.
   */
  viewportProps?: React.ComponentPropsWithRef<
    typeof ScrollAreaPrimitive.Viewport
  >;
}

/**
 * The scrollbar track + thumb. Not exported: `ScrollArea` mounts the ones
 * `orientation` asks for, which is the whole of the existing public API.
 */
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2 border-l border-l-transparent",
      orientation === "horizontal" && "h-2 flex-col border-t border-t-transparent",
      className
    )}
    {...props}
  >
    {/*
      Same thumb the `::-webkit-scrollbar-thumb` rules drew: `w-2` track,
      fully rounded, `bg-border` at rest, `bg-muted-foreground/30` on hover.
    */}
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border transition-colors hover:bg-muted-foreground/30" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

/**
 * ScrollArea — a scroll container with a consistent, styled scrollbar.
 *
 * Backed by Radix `ScrollArea`. The hand-rolled version was a single
 * `overflow-auto` div plus a stack of `::-webkit-scrollbar` pseudo-element
 * rules, which is a WebKit-only vocabulary: Firefox ignored every one of them
 * and rendered the OS scrollbar instead, so the "design system scrollbar" was
 * a Chrome/Safari-only promise. Radix hides the native scrollbar and renders a
 * real element in its place, so the same thumb appears in every browser, can
 * be dragged, and participates in the same hover/transition styling as the
 * rest of the system.
 *
 * `type` defaults to `"auto"` — scrollbar present exactly while the content
 * overflows — because that is what `overflow-auto` did. Radix's own default is
 * `"hover"`; pass `type` explicitly for `"hover"`, `"always"` or `"scroll"`.
 *
 * NOTE ON PROP DESTINATIONS. This used to be one element; it is now a root plus
 * an inner viewport, and the root does not scroll. Three props therefore have to
 * be routed inward rather than spread onto the root with the rest, because for
 * them the root is not merely a different element — it is an element on which
 * they do nothing at all, silently:
 *
 *   - `onScroll` / `onScrollCapture` — `scroll` events do not bubble, so a
 *     handler on the root would never fire once. Infinite-loading and
 *     scroll-position UI would break with no error.
 *   - `nonce` — Radix injects its scrollbar-hiding `<style>` from the viewport
 *     and only reads a nonce given to that component. Under a strict
 *     `style-src 'nonce-…'` policy the rule is blocked and the native scrollbar
 *     shows up alongside the custom one.
 *
 * Everything else keeps landing on the root, which is the component's box and
 * the right owner for `className`, `style`, `id`, `role`, `aria-*`, `data-*`
 * and bubbling handlers. `viewportProps` is the escape hatch for the remainder
 * — most importantly a `ref`, since `ref` on this component addresses the root
 * and setting `scrollTop` there does nothing.
 *
 * @stability Stable
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    {
      className,
      orientation = "vertical",
      type = "auto",
      children,
      onScroll,
      onScrollCapture,
      nonce,
      viewportProps,
      ...props
    },
    ref
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      type={type}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        onScroll={onScroll}
        onScrollCapture={onScrollCapture}
        nonce={nonce}
        {...viewportProps}
        className={cn(
          "h-full w-full rounded-[inherit]",
          viewportProps?.className
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea };
