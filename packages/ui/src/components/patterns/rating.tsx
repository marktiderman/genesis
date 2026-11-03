"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "../../utils";

export interface RatingProps {
  /** Current value, 0..`max`. Fractions are rounded for display. */
  value: number;
  /** Number of stars. Default 5. */
  max?: number;
  /**
   * Called with the new value when a star is chosen. Absent, the rating is
   * read-only and renders as a single `img` named "N of M stars".
   */
  onChange?: (value: number) => void;
  /** Star size. Default `md`. */
  size?: "sm" | "md" | "lg";
  /** Accessible name for the control (or the image, when read-only). */
  label?: string;
  /** Read-only even with `onChange` present (e.g. while saving). */
  readOnly?: boolean;
  /** Replaces the default "N of M stars" value text used in aria labels. */
  getLabel?: (value: number, max: number) => string;
  className?: string;
}

const STAR_SIZE: Record<NonNullable<RatingProps["size"]>, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

/**
 * The value a click on `star` produces: that star, or 0 when it is already
 * the current value, so the one gesture also clears the rating.
 */
export function nextRating(value: number, star: number): number {
  return star === value ? 0 : star;
}

function clamp(value: number, max: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/**
 * Rating — a row of stars, read-only or interactive.
 *
 * Read-only (no `onChange`): one `img` role whose label reads "3 of 5 stars",
 * so a screen reader hears the value once instead of five icons.
 *
 * Interactive: a `radiogroup` of buttons, one per star, with the current
 * value `aria-checked`; ArrowLeft/ArrowRight (and Up/Down) move the value,
 * Home/End jump to the ends, and clicking the current value clears it to 0
 * (`nextRating`). `readOnly` forces the read-only rendering while keeping
 * `onChange` wired for later. Filled stars use `text-warning`, empty ones
 * `text-muted-foreground`; no raw colours.
 *
 * @stability Beta
 */
export function Rating({
  value,
  max = 5,
  onChange,
  size = "md",
  label,
  readOnly = false,
  getLabel,
  className,
}: RatingProps) {
  const groupRef = React.useRef<HTMLDivElement>(null);
  const count = Math.max(1, Math.floor(max));
  const current = clamp(value, count);
  const describe = (v: number) => (getLabel ? getLabel(v, count) : `${v} of ${count} stars`);
  const name = describe(current);
  const starClass = STAR_SIZE[size];

  const stars = Array.from({ length: count }, (_, i) => i + 1);

  if (!onChange || readOnly) {
    return (
      <span
        role="img"
        aria-label={label ? `${label}: ${name}` : name}
        data-slot="rating"
        className={cn("inline-flex items-center gap-0.5", className)}
      >
        {stars.map((n) => (
          <Star
            key={n}
            aria-hidden="true"
            className={cn(
              starClass,
              n <= current ? "fill-current text-warning" : "text-muted-foreground",
            )}
          />
        ))}
      </span>
    );
  }

  const commit = (next: number) => {
    const clamped = clamp(next, count);
    if (clamped !== current) onChange(clamped);
    // Keep focus on the star that now holds the value.
    const target = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-value="${clamped}"]`,
    );
    target?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        commit(current + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        commit(current - 1);
        break;
      case "Home":
        event.preventDefault();
        commit(1);
        break;
      case "End":
        event.preventDefault();
        commit(count);
        break;
      default:
    }
  };

  // Roving tabindex: the checked star is the tab stop (the first star when
  // nothing is chosen yet), arrows move between the rest.
  const tabStop = current === 0 ? 1 : current;

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label ?? "Rating"}
      data-slot="rating"
      className={cn("inline-flex items-center gap-0.5", className)}
      onKeyDown={onKeyDown}
    >
      {stars.map((n) => {
        const filled = n <= current;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === current}
            aria-label={describe(n)}
            data-value={n}
            tabIndex={n === tabStop ? 0 : -1}
            onClick={() => commit(nextRating(current, n))}
            className={cn(
              "inline-flex items-center justify-center rounded-sm transition-colors hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              filled ? "text-warning" : "text-muted-foreground",
            )}
          >
            <Star aria-hidden="true" className={cn(starClass, filled && "fill-current")} />
          </button>
        );
      })}
    </div>
  );
}
