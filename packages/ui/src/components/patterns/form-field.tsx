import * as React from "react";
import { Label } from "../ui/label";
import { cn } from "../../utils";

// ---------------------------------------------------------------------------
// FormField — wrapper div for consistent form field layout
// ---------------------------------------------------------------------------

function FormField({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormLabel — label with error styling support
// ---------------------------------------------------------------------------

interface FormLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {
  error?: boolean;
  required?: boolean;
}

const FormLabel = React.forwardRef<
  React.ComponentRef<typeof Label>,
  FormLabelProps
>(({ className, error, required, children, ...props }, ref) => (
  <Label
    ref={ref}
    className={cn(error && "text-destructive", className)}
    {...props}
  >
    {children}
    {required && <span className="text-destructive ml-1">*</span>}
  </Label>
));
FormLabel.displayName = "FormLabel";

// ---------------------------------------------------------------------------
// FormError — error message display
// ---------------------------------------------------------------------------

function FormError({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null;
  return (
    <p
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// FormDescription — help text
// ---------------------------------------------------------------------------

function FormDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null;
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export { FormField, FormLabel, FormError, FormDescription };
