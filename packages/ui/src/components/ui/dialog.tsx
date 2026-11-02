"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "../../utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * How a dialog sits on a phone (below the `sm` breakpoint). From `sm` up every dialog is the same
 * centred box.
 *
 * - `center` (the default): the centred box dialogs have always been, kept inside the screen
 *   with side gutters, capped to the screen's height clear of the safe areas, scrolling inside.
 * - `sheet` (opt-in): docked to the bottom edge at full width, as tall as its content up to the
 *   top safe area, scrolling inside, and padded clear of the home indicator. Suits forms and
 *   pickers a thumb reaches for.
 * - `fullscreen` (opt-in): fills the screen, inside the safe areas. For long forms, editors and
 *   media.
 */
export type DialogMobileLayout = "sheet" | "fullscreen" | "center";

// The desktop box's padding, border and width are unprefixed classes, as they have always been,
// so a caller's `p-0` or `max-w-2xl` still wins at every size; only what a phone layout moves
// (position, height, corners, motion) is undone behind `sm:`. The safe-area paddings below
// equal `p-6` on a screen without insets.
const DIALOG_RECENTER =
  "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]";

const DIALOG_LAYOUT: Record<DialogMobileLayout, string> = {
  sheet: cn(
    "inset-x-0 bottom-0 max-w-none max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] rounded-t-xl pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
    DIALOG_RECENTER
  ),
  fullscreen: cn(
    "inset-0 max-w-none h-[100dvh] content-start pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
    DIALOG_RECENTER
  ),
  // The centred box dialogs have always been, plus the height cap.
  center:
    "left-[50%] top-[50%] max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] sm:rounded-lg data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
};

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    /**
     * Classes for the backdrop rendered behind the content, merged after the defaults, e.g.
     * `z-[60]` to lift it above a side panel that sits at `z-50`. Raise the content's own
     * `className` to match.
     */
    overlayClassName?: string;
    /**
     * How the dialog sits on a phone. Default `center`, the centred box; `sheet` and `fullscreen`
     * are opt-in. See {@link DialogMobileLayout}.
     */
    mobileLayout?: DialogMobileLayout;
  }
>(({ className, overlayClassName, children, showCloseButton = true, mobileLayout = "center", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      data-mobile-layout={mobileLayout}
      className={cn(
        // Shared by every size: a grid that scrolls inside itself when its content is taller
        // than the screen, so the actions at the bottom can always be reached.
        "fixed z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg gap-4 overflow-y-auto overscroll-contain border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
        DIALOG_LAYOUT[mobileLayout],
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        // A 44px hit area around the 16px icon, so it can be tapped on a phone. Full screen, the
        // dialog's top edge is the screen's, so the button clears the notch itself.
        <DialogPrimitive.Close
          className={cn(
            "absolute right-1 inline-flex size-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none motion-reduce:transition-none",
            mobileLayout === "fullscreen" ? "top-[max(0.25rem,env(safe-area-inset-top))]" : "top-1"
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
);

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
