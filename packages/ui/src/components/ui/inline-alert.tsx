import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../utils";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";

export type InlineAlertVariant = "info" | "success" | "warning" | "destructive";

interface MessageProps {
  variant?: InlineAlertVariant | undefined;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** An icon before the text. */
  icon?: React.ReactNode;
  /** Shows a dismiss button. */
  onDismiss?: (() => void) | undefined;
  /** The dismiss button's accessible name. Default "Dismiss". */
  dismissLabel?: string | undefined;
  /** Content under the description (a list of the fields to fix, a status line). */
  children?: React.ReactNode;
  /** A row of buttons under the content ("Retry", "Review"). */
  actions?: React.ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
}

// The same tints as genesis-ui-native's NativeInlineAlert and NativeBanner.
const TINT: Record<InlineAlertVariant, string> = {
  info: "border-border bg-secondary text-foreground",
  success: "border-primary/30 bg-primary/10 text-foreground",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-foreground",
};
// A warning's title is the foreground token: the warning token is an amber that reads at about
// 2:1 on the tint, under the 4.5:1 text needs, so the tint and border carry the warning instead.
const TITLE: Record<InlineAlertVariant, string> = {
  info: "text-foreground",
  success: "text-primary-text",
  warning: "text-foreground",
  destructive: "text-destructive",
};

function Message({
  variant = "info",
  title,
  description,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  children,
  actions,
  className,
  testID,
  banner,
}: MessageProps & { banner: boolean }) {
  return (
    <Alert
      role={banner ? "status" : variant === "destructive" || variant === "warning" ? "alert" : "status"}
      aria-live={banner ? "polite" : undefined}
      data-slot={banner ? "banner" : "inline-alert"}
      data-variant={variant}
      data-testid={testID}
      className={cn(
        "flex gap-3 [&>svg]:static [&>svg~*]:pl-0 [&>svg+div]:translate-y-0",
        banner ? "rounded-none border-x-0 border-t-0 px-4 py-3" : "p-3",
        TINT[variant],
        className,
      )}
    >
      {icon ? (
        <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <AlertTitle className={cn("text-sm font-semibold", TITLE[variant])}>{title}</AlertTitle> : null}
        {description ? <AlertDescription className="text-foreground/80">{description}</AlertDescription> : null}
        {children ? <div className="mt-2 text-sm">{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-m-1 size-7 shrink-0"
          aria-label={dismissLabel}
          onClick={onDismiss}
          testID={testID ? `${testID}-dismiss` : undefined}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </Alert>
  );
}

export interface InlineAlertProps extends MessageProps {}

/**
 * InlineAlert — a message that sits with what it is about (between form fields, over a list): the
 * twin of genesis-ui-native's NativeInlineAlert, with the same variants (info, success, warning,
 * destructive), dismiss, content and actions. It is the Alert, tinted. Warnings and errors are
 * announced (`role="alert"`); info and success are a polite status.
 *
 * @stability Beta
 */
export function InlineAlert(props: InlineAlertProps) {
  return <Message {...props} testID={props.testID ?? `inline-alert-${props.variant ?? "info"}`} banner={false} />;
}

export interface BannerProps extends MessageProps {}

/**
 * Banner — a full-width system message across the top of a page ("You're offline"): the twin of
 * genesis-ui-native's NativeBanner. It stays until dismissed or until its condition clears, and is
 * announced politely. For a passing confirmation use a toast; for something blocking, a dialog.
 *
 * @stability Beta
 */
export function Banner(props: BannerProps) {
  return <Message {...props} testID={props.testID ?? `banner-${props.variant ?? "info"}`} banner />;
}
