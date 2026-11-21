import * as React from "react";
import { cn } from "../../utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

/** Progress — a bar from 0 to 100, announced as a progressbar with its value; named "N% complete" unless `aria-label` says more. */
function Progress({ className, value = 0, ...props }: ProgressProps) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={`${Math.round(pct)}% complete`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
        className
      )}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all duration-300 ease-in-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
