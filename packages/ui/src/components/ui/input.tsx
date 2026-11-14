import * as React from "react";

import { cn } from "../../utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "flex h-[var(--control-height)] w-full min-w-0 rounded-[var(--control-radius)] border-[length:var(--input-border-width)] border-input bg-background px-[var(--input-padding-x)] py-2 shadow-[var(--input-shadow)] text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring focus-visible:ring-offset-[length:var(--focus-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11 md:pointer-fine:text-sm aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
