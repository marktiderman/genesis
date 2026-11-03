"use client";

import * as React from "react";
import { AspectRatio } from "../ui/aspect-ratio";
import { Card } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../utils";

export interface GalleryCardProps {
  /** Cover image. Without it the cover is a muted placeholder. */
  src?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  /** Overlaid top-left on the cover; several badges sit in a row with a gap. */
  badges?: React.ReactNode;
  /** Overlaid top-right on the cover (icon buttons, a menu). */
  actions?: React.ReactNode;
  /** Cover aspect ratio, width ÷ height. Default 4/3. */
  ratio?: number;
  /** Shows a skeleton cover (and title/subtitle skeletons) while the item loads. */
  loading?: boolean;
  /** Makes the whole card a button. */
  onClick?: () => void;
  className?: string;
}

/**
 * GalleryCard — a cover image with badges and actions overlaid, and a
 * title/subtitle footer. The media-first card that galleries, libraries and
 * course lists all draw: `Card` + `AspectRatio` + the two overlay slots.
 *
 * With `onClick` the cover and footer are one `<button>` named by the title
 * (or the alt text), so the surface is a single tab stop. `actions` render
 * as a sibling of that button, absolutely positioned top-right over the
 * cover, so interactive actions (icon buttons, a menu) never nest inside it;
 * `badges` are not interactive and stay inside.
 *
 * Without `src`, or while `loading`, the cover is a `bg-muted` box carrying a
 * `Skeleton`, so a grid of cards keeps its shape before the data lands.
 *
 * @stability Beta
 */
export function GalleryCard({
  src,
  alt,
  title,
  subtitle,
  badges,
  actions,
  ratio = 4 / 3,
  loading = false,
  onClick,
  className,
}: GalleryCardProps) {
  const showImage = Boolean(src) && !loading;
  // The button is named by the title and described by the subtitle and badges (a "Live" badge
  // included), so a screen reader hears all of them, not only a label laid over them.
  const id = React.useId();
  const titleId = `${id}-title`;
  const subtitleId = `${id}-subtitle`;
  const badgesId = `${id}-badges`;

  const actionsNode = actions ? (
    <div
      data-slot="gallery-card-actions"
      className="absolute right-2 top-2 flex items-center gap-1"
    >
      {actions}
    </div>
  ) : null;

  const body = (
    <>
      <AspectRatio ratio={ratio} className="bg-muted">
        {showImage ? (
          <img src={src} alt={alt ?? ""} loading="lazy" className="size-full object-cover" />
        ) : (
          <Skeleton
            data-slot="gallery-card-placeholder"
            aria-hidden="true"
            className="size-full rounded-none"
          />
        )}
        {badges ? (
          <div
            id={badgesId}
            data-slot="gallery-card-badges"
            className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5"
          >
            {badges}
          </div>
        ) : null}
        {actions && !onClick ? actionsNode : null}
      </AspectRatio>
      {loading && !title && !subtitle ? (
        <div data-slot="gallery-card-footer" className="space-y-1.5 p-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ) : title || subtitle ? (
        <div data-slot="gallery-card-footer" className="space-y-0.5 p-3">
          {title ? (
            <div id={titleId} className="truncate text-sm font-medium leading-tight text-card-foreground">
              {title}
            </div>
          ) : null}
          {subtitle ? (
            <div id={subtitleId} className="truncate text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const cardClass = cn("overflow-hidden", className);

  if (onClick) {
    return (
      <div data-slot="gallery-card-wrapper" className="relative">
        <button
          type="button"
          data-slot="gallery-card"
          data-loading={loading || undefined}
          {...(title ? { "aria-labelledby": titleId } : { "aria-label": alt })}
          aria-describedby={[subtitle ? subtitleId : null, badges ? badgesId : null].filter(Boolean).join(" ") || undefined}
          aria-busy={loading || undefined}
          onClick={onClick}
          className={cn(
            "block w-full cursor-pointer rounded-xl border bg-card p-0 text-left text-card-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
            cardClass,
          )}
        >
          {body}
        </button>
        {actionsNode}
      </div>
    );
  }

  return (
    <Card data-slot="gallery-card" data-loading={loading || undefined} aria-busy={loading || undefined} className={cardClass}>
      {body}
    </Card>
  );
}
