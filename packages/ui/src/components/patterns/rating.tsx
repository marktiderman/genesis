"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
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
 * Interactive: Radix's `RadioGroup` (G1: the radiogroup pattern is Radix's,
 * roving focus, arrow keys and right-to-left included), one radio per star
 * named "N of M stars". The arrows move between stars and choose as they go;
 * re-clicking the chosen star clears it to 0 (`nextRating`), and the arrows
 * never clear. The stars up to the chosen one are filled, `text-warning`;
 * empty ones `text-muted-foreground`; no raw colours. `readOnly` forces the
 * read-only rendering while keeping `onChange` wired for later.
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
  const count = Math.max(1, Math.floor(max));
  const current = clamp(value, count);
  // Radix takes direction from its DirectionProvider, not the page: read the page's `dir` so the
  // arrows swap in a right-to-left layout either way.
  const groupRef = React.useRef<HTMLDivElement>(null);
  const [dir, setDir] = React.useState<"ltr" | "rtl" | undefined>(undefined);
  React.useLayoutEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    const found = el.parentElement?.closest("[dir]")?.getAttribute("dir");
    setDir(found === "rtl" ? "rtl" : found === "ltr" ? "ltr" : undefined);
  }, []);
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

  return (
    <RadioGroupPrimitive.Root
      ref={groupRef}
      {...(dir ? { dir } : {})}
      aria-label={label ?? "Rating"}
      data-slot="rating"
      orientation="horizontal"
      loop={false}
      // Nothing chosen yet: "" leaves every radio unchecked (the first star is the tab stop).
      value={current === 0 ? "" : String(current)}
      onValueChange={(v) => {
        const next = clamp(Number(v), count);
        if (next !== current) onChange(next);
      }}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {stars.map((n) => {
        const filled = n <= current;
        return (
          <RadioGroupPrimitive.Item
            key={n}
            value={String(n)}
            aria-label={describe(n)}
            data-value={n}
            // Re-clicking the chosen star clears it; Radix leaves a checked radio as it is.
            onClick={() => {
              if (nextRating(current, n) === 0) onChange(0);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-sm transition-colors hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              filled ? "text-warning" : "text-muted-foreground",
            )}
          >
            <Star aria-hidden="true" className={cn(starClass, filled && "fill-current")} />
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
