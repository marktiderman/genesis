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
 * - `sheet` (the default): docked to the bottom edge at full width, as tall as its content up to
 *   the top safe area, scrolling inside, and padded clear of the home indicator.
 * - `fullscreen`: fills the screen, inside the safe areas. For long forms, editors and media.
 * - `center`: the centred box, kept inside the screen with side gutters and scrolling inside.
 */
export type DialogMobileLayout = "sheet" | "fullscreen" | "center";

// The desktop box. Every class is behind `sm:` so the phone layouts below never fight it.
const DIALOG_DESKTOP =
  "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:w-full sm:max-w-lg sm:max-h-[calc(100dvh-2rem)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:p-6 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]";

const DIALOG_MOBILE: Record<DialogMobileLayout, string> = {
  sheet:
    "inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] rounded-t-xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  fullscreen:
    "inset-0 h-[100dvh] content-start pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  center:
    "left-[50%] top-[50%] max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] translate-x-[-50%] translate-y-[-50%] rounded-lg border data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
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
    /** How the dialog sits on a phone. Default `sheet`. See {@link DialogMobileLayout}. */
    mobileLayout?: DialogMobileLayout;
  }
>(({ className, overlayClassName, children, showCloseButton = true, mobileLayout = "sheet", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      data-mobile-layout={mobileLayout}
      className={cn(
        // Shared by every size: a grid that scrolls inside itself when its content is taller
        // than the screen, so the actions at the bottom can always be reached.
        "fixed z-50 grid w-full gap-4 overflow-y-auto overscroll-contain border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
        DIALOG_MOBILE[mobileLayout],
        DIALOG_DESKTOP,
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        // A 44px hit area around the 16px icon, so it can be tapped on a phone.
        <DialogPrimitive.Close className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none motion-reduce:transition-none">
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
