import * as React from "react";
import { cn } from "../../utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    // `overflow-wrap: anywhere` lets a long unbroken run (a URL, a pasted token) wrap: with
    // field-sizing-content it otherwise sets the textarea's minimum width and pushes a dialog
    // wider than the screen.
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[80px] w-full [overflow-wrap:anywhere] rounded-[var(--control-radius)] border-[length:var(--input-border-width)] border-input bg-background px-[var(--input-padding-x)] py-2 shadow-[var(--input-shadow)] text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring focus-visible:ring-offset-[length:var(--focus-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50 md:pointer-fine:text-sm aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
