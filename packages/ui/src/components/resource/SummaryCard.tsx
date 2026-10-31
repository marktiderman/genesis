import type { ReactNode } from "react";
import { cn } from "../../utils";

/**
 * One card of a summary column: an icon and a title, a short line on the right ("24
 * responses · average 4.1"), then whatever summarises it (bars, quotes, a split bar).
 */
export function SummaryCard({
  icon,
  title,
  meta,
  children,
  className,
  testID,
}: {
  icon?: ReactNode | undefined;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
  testID?: string | undefined;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testID}
      data-slot="summary-card"
      className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground", className)}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold">
          {icon ? (
            <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 break-words">{title}</span>
        </h3>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}
