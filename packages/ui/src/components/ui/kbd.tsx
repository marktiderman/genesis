import * as React from "react";
import { cn } from "../../utils";

interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100",
        className
      )}
      {...props}
    />
  );
}

export { Kbd, type KbdProps };
