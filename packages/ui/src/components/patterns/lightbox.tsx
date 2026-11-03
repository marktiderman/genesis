"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../../utils";
import type { GalleryItem } from "./gallery-types";
import { isAppShortcutTarget, isAppShortcutTargetElement } from "./keyboard";

/** Minimum horizontal travel, in px, for a touch to count as a swipe. */
const SWIPE_THRESHOLD = 50;

/** The viewer's words, for another language (the same keys as native, plus the arrows). */
export interface LightboxLabels {
  previous: string;
  next: string;
  /** A picture with no `alt`. */
  photo: (n: number, count: number) => string;
}

export const defaultLightboxLabels: LightboxLabels = {
  previous: "Previous image",
  next: "Next image",
  photo: (n, count) => `Image ${n} of ${count}`,
};

export interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: GalleryItem[];
  /** Index of the item on show. */
  index: number;
  onIndexChange: (index: number) => void;
  /** Replaces the default caption (the item's `caption`) under the image. */
  renderCaption?: (item: GalleryItem, index: number) => React.ReactNode;
  /** Extra controls in the top-right, beside the close button. */
  renderActions?: (item: GalleryItem, index: number) => React.ReactNode;
  /**
   * Replaces the item's picture in the stage (a video, a before/after
   * compare), per item, as on native. The stage keeps its definite height
   * and the prev/next buttons sit over it.
   */
  renderMedia?: (item: GalleryItem, index: number) => React.ReactNode;
  /** Shown in the top bar; also becomes the dialog's accessible title. */
  title?: string;
  /** Shown under the title in the top bar, muted. */
  description?: React.ReactNode;
  /**
   * Keydowns the lightbox did not handle itself (not the arrows, not Escape),
   * filtered through `isAppShortcutTarget`: never fired when the event is
   * already defaultPrevented, a ctrl/meta/alt modifier is held, or focus is
   * in a field or a widget with its own keys. For "f to favourite"-style
   * shortcuts.
   */
  onKey?: (e: KeyboardEvent) => void;
  labels?: Partial<LightboxLabels>;
  className?: string;
}

/**
 * Lightbox — a full-screen image viewer over the page, built on `Dialog`.
 *
 * Prev/next buttons, ArrowLeft/ArrowRight and a horizontal swipe step
 * through `items`; they stop at the ends (no wrap-around), and the button at
 * an end is disabled so a keyboard user is not sent to a dead control.
 * Escape closes, as every Dialog does. A "3 / 12" counter sits top-left with
 * the optional `title`/`description`; `renderActions` fills the top-right
 * beside Close; the caption (or `renderCaption`) sits under the stage, which
 * shows the image `object-contain` or whatever `renderMedia` supplies. A
 * picture with no `alt` is named by its position ("Image 3 of 12"), never
 * left unnamed. Reaching an end moves focus to the other arrow, so the
 * keyboard never lands on a disabled button.
 *
 * Controlled only: the consumer owns `open` and `index`, so the same state
 * can drive a `GalleryGrid` highlight or a URL.
 *
 * @stability Beta
 */
export function Lightbox({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
  renderCaption,
  renderActions,
  renderMedia,
  title,
  description,
  onKey,
  labels: labelOverrides,
  className,
}: LightboxProps) {
  const labels = { ...defaultLightboxLabels, ...labelOverrides };
  const prevRef = React.useRef<HTMLButtonElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const count = items.length;
  const safeIndex = count === 0 ? 0 : Math.min(Math.max(0, index), count - 1);
  const item = items[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < count - 1;
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  const goPrev = () => {
    if (hasPrev) onIndexChange(safeIndex - 1);
  };
  const goNext = () => {
    if (hasNext) onIndexChange(safeIndex + 1);
  };

  // The arrow just pressed becomes disabled at an end: hand focus to the other one, so it isn't
  // dropped to the page (and the arrow keys keep working).
  React.useEffect(() => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    if (!hasPrev && active === prevRef.current) nextRef.current?.focus();
    if (!hasNext && active === nextRef.current) prevRef.current?.focus();
  }, [hasPrev, hasNext]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // A field or widget in the slots keeps its own keys (arrows included).
    if (!isAppShortcutTarget(event.nativeEvent)) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key !== "Escape" && onKey) {
      onKey(event.nativeEvent);
    }
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStart.current = touch && isAppShortcutTargetElement(event.target) ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // At least the threshold, and clearly more horizontal than vertical, so a
    // scroll through a tall caption is never read as a page turn.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const fallbackAlt = labels.photo(safeIndex + 1, count);
  const accessibleTitle = title || item?.alt || item?.caption || fallbackAlt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileLayout="fullscreen"
        data-slot="lightbox"
        aria-describedby={undefined}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        overlayClassName="bg-background/95 backdrop-blur-sm"
        className={cn(
          // Override the centred-box defaults at every size: edge to edge,
          // translucent, no border, no shadow; a column of header / stage /
          // caption. `overflow-hidden` so the stage, not the dialog, owns the
          // remaining height.
          "inset-0 flex h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background/95 p-0 shadow-none backdrop-blur-sm sm:inset-0 sm:left-0 sm:top-0 sm:h-[100dvh] sm:max-h-none sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none",
          className,
        )}
      >
        {/* Header: counter + title left, actions right (Close is rendered by DialogContent at top-1 right-1). */}
        <div
          data-slot="lightbox-header"
          className="flex min-h-12 shrink-0 items-start justify-between gap-2 px-4 py-2 pr-14"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                data-slot="lightbox-counter"
                aria-live="polite"
                className="text-sm tabular-nums text-muted-foreground"
              >
                {count === 0 ? "0 / 0" : `${safeIndex + 1} / ${count}`}
              </span>
              <DialogTitle
                className={cn("truncate text-sm font-medium leading-tight", !title && "sr-only")}
              >
                {accessibleTitle}
              </DialogTitle>
            </div>
            {description ? (
              <DialogDescription data-slot="lightbox-description" className="truncate text-xs">
                {description}
              </DialogDescription>
            ) : null}
          </div>
          {item && renderActions ? (
            <div data-slot="lightbox-actions" className="flex shrink-0 items-center gap-1">
              {renderActions(item, safeIndex)}
            </div>
          ) : null}
        </div>

        {/* Stage: fills the dialog minus the bars; prev/next float over it. */}
        <div
          data-slot="lightbox-stage"
          className="relative flex min-h-0 flex-1 basis-0 items-center justify-center px-14"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            ref={prevRef}
            aria-label={labels.previous}
            disabled={!hasPrev}
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full"
          >
            <ChevronLeft />
          </Button>

          {item && renderMedia ? (
            <div data-slot="lightbox-media" className="flex size-full items-center justify-center">
              {renderMedia(item, safeIndex)}
            </div>
          ) : item ? (
            <img
              key={item.id}
              src={item.src}
              alt={item.alt ?? fallbackAlt}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            ref={nextRef}
            aria-label={labels.next}
            disabled={!hasNext}
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full"
          >
            <ChevronRight />
          </Button>
        </div>

        {/* Caption */}
        {item && (renderCaption || item.caption) ? (
          <div
            data-slot="lightbox-caption"
            className="shrink-0 px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {renderCaption ? renderCaption(item, safeIndex) : item.caption}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
