import * as React from "react";
import { cn } from "../../utils";

export type LiveIndicatorState = "live" | "idle" | "offline";

export interface LiveIndicatorProps {
  /** Whether the thing is live now. Default true. Shorthand for `state`: true ≡ "live", false ≡ "idle". */
  live?: boolean;
  /**
   * Three-way state; wins over `live` when both are given. `live` pulses in
   * the destructive colour, `idle` is a still muted dot, `offline` a fainter
   * one (`bg-muted-foreground/50`).
   */
  state?: LiveIndicatorState;
  /** Text beside the dot. Default follows the state: "Live", "Idle" or "Offline". */
  label?: string;
  /** Secondary text after the label, muted — "last photo 2m ago". */
  detail?: string;
  /** `pill` (default): dot + label in a rounded chip. `dot`: the dot alone, label read by screen readers only. */
  variant?: "pill" | "dot";
  className?: string;
}

const DOT_CLASS: Record<LiveIndicatorState, string> = {
  live: "animate-pulse bg-destructive motion-reduce:animate-none",
  idle: "bg-muted-foreground",
  offline: "bg-muted-foreground/50",
};

const DEFAULT_LABEL: Record<LiveIndicatorState, string> = {
  live: "Live",
  idle: "Idle",
  offline: "Offline",
};

/**
 * LiveIndicator — the "● Live" chip for streams, classes and sessions that
 * are happening now. The dot pulses while live; idle it goes muted and
 * still, offline fainter still, so the state reads at a glance as well as by
 * colour. `detail` carries a short secondary line ("last photo 2m ago").
 *
 * `role="status"` with `aria-live="polite"` so a screen reader announces the
 * change from offline to live without stealing focus.
 *
 * @stability Beta
 */
export function LiveIndicator({
  live = true,
  state,
  label: labelProp,
  detail,
  variant = "pill",
  className,
}: LiveIndicatorProps) {
  const resolved: LiveIndicatorState = state ?? (live ? "live" : "idle");
  const isLive = resolved === "live";
  const label = labelProp ?? DEFAULT_LABEL[resolved];

  const dot = (
    <span
      aria-hidden="true"
      data-slot="live-indicator-dot"
      className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[resolved])}
    />
  );

  const detailNode = detail ? (
    <span data-slot="live-indicator-detail" className="font-normal text-muted-foreground">
      {detail}
    </span>
  ) : null;

  if (variant === "dot") {
    return (
      <span
        role="status"
        aria-live="polite"
        data-slot="live-indicator"
        data-live={isLive}
        data-state={resolved}
        className={cn("inline-flex items-center", className)}
      >
        {dot}
        <span className="sr-only">
          {label}
          {detail ? ` ${detail}` : null}
        </span>
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      data-slot="live-indicator"
      data-live={isLive}
      data-state={resolved}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium",
        isLive ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {dot}
      <span data-slot="live-indicator-label">{label}</span>
      {detailNode}
    </span>
  );
}
