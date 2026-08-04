import * as React from "react";

import { cn } from "../../utils";

interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-10 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
      {...props}
    />
  )
);
InputGroup.displayName = "InputGroup";

interface InputGroupInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const InputGroupInput = React.forwardRef<HTMLInputElement, InputGroupInputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-full w-full min-w-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
InputGroupInput.displayName = "InputGroupInput";

interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {}

const InputGroupPrefix = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center pl-3 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
        className
      )}
      {...props}
    />
  )
);
InputGroupPrefix.displayName = "InputGroupPrefix";

const InputGroupSuffix = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center pr-3 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
        className
      )}
      {...props}
    />
  )
);
InputGroupSuffix.displayName = "InputGroupSuffix";

export {
  InputGroup,
  InputGroupInput,
  InputGroupPrefix,
  InputGroupSuffix,
  type InputGroupProps,
};
