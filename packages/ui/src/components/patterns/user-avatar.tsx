import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../../utils";

const userAvatarVariants = cva("shrink-0", {
  variants: {
    size: {
      sm: "h-8 w-8 text-xs",
      default: "h-10 w-10 text-sm",
      lg: "h-12 w-12 text-base",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

// Built lazily once — constructing a Segmenter per call is wasteful, and a
// runtime either has Intl.Segmenter or never will.
let graphemeSegmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  return graphemeSegmenter;
}

/**
 * First user-perceived character of `word`.
 *
 * `charAt(0)` / `[0]` index UTF-16 code units, so a name starting outside the
 * BMP ("𐐀 Smith", "😊 Jones") yields a lone surrogate that renders as a
 * replacement glyph. Grapheme segmentation additionally keeps combining marks
 * attached ("é" as e + U+0301); the `Array.from` fallback is code-point based,
 * which still fixes the surrogate case on runtimes without `Intl.Segmenter`.
 */
function firstGrapheme(word: string): string {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    for (const { segment } of segmenter.segment(word)) return segment;
    return "";
  }
  return Array.from(word)[0] ?? "";
}

/** First + last initial from a display name ("Ada Lovelace" -> "AL", "Cher" -> "C"). */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = firstGrapheme(words[0]!);
  const last = firstGrapheme(words[words.length - 1]!);
  return (words.length === 1 ? first : first + last).toUpperCase();
}

export interface UserAvatarProps extends VariantProps<typeof userAvatarVariants> {
  /** Full display name. Source for the computed initials fallback and the accessible name. */
  name: string;
  /** Image URL. Omit — or let it fail to load — to show the initials fallback. */
  src?: string | null;
  className?: string;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * UserAvatar — canonical user-identity avatar. Shows the person's photo when
 * `src` is set and loads successfully; otherwise (including a failed image
 * load — Radix's Avatar swaps to the fallback automatically) it falls back
 * to initials computed from `name`. Wraps the lower-level
 * `Avatar`/`AvatarImage`/`AvatarFallback` primitives so call sites stop
 * hand-rolling initials logic per-usage.
 *
 * The root carries `role="img"` + `aria-label={name}` so the person's full name
 * is the accessible name on BOTH paths — without it the fallback route renders
 * a bare `span`, a generic element whose author-supplied label AT may ignore,
 * announcing only the visible initials ("AL").
 *
 * @stability Beta
 */
export function UserAvatar({ name, src, size, className, testID }: UserAvatarProps) {
  return (
    <Avatar
      role="img"
      aria-label={name}
      data-testid={testID}
      className={cn(userAvatarVariants({ size }), className)}
    >
      {/*
        alt="" is deliberate: the root already exposes `name` as the accessible
        name, so labelling the nested <img> too would announce the person twice
        once the image loads.
      */}
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

export { userAvatarVariants };
