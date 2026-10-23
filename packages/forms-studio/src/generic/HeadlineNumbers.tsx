import type { ReactNode } from "react";
import { Skeleton, cn } from "@marktiderman/genesis-ui";

/** One headline number: a label, the number, and a short line under it. */
export interface HeadlineNumber {
  key: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** The detail's colour: good news, bad news, a warning, or plain. Default plain. */
  tone?: "positive" | "negative" | "warning" | "muted" | undefined;
}

const TONE: Record<NonNullable<HeadlineNumber["tone"]>, string> = {
  positive: "text-emerald-700 dark:text-emerald-300",
  negative: "text-red-700 dark:text-red-300",
  warning: "text-amber-800 dark:text-amber-200",
  muted: "text-muted-foreground",
};

/** A row of headline numbers (KPI cards): two across on a phone, up to four on a wide screen. */
export function HeadlineNumbers({
  numbers,
  isLoading = false,
  className,
}: {
  numbers: readonly HeadlineNumber[];
  isLoading?: boolean | undefined;
  className?: string | undefined;
}) {
  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (!numbers.length) return null;
  return (
    <dl
      data-slot="headline-numbers"
      className={cn(
        "grid grid-cols-2 gap-3",
        numbers.length >= 4 ? "lg:grid-cols-4" : numbers.length === 3 ? "lg:grid-cols-3" : "",
        className,
      )}
    >
      {numbers.map((n) => (
        <div
          key={n.key}
          className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground"
          data-testid={`headline-${n.key}`}
        >
          <dt className="truncate text-sm text-muted-foreground">{n.label}</dt>
          <dd className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{n.value}</dd>
          {n.detail ? <dd className={cn("text-xs", TONE[n.tone ?? "muted"])}>{n.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
