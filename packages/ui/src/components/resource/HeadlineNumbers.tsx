import type { ReactNode } from "react";
import type { HeadlineNumber as CoreHeadlineNumber, HeadlineTone } from "@marktiderman/genesis-core/resource";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../utils";
import { WidgetTile } from "../data/widget/WidgetTile";

/**
 * One headline number: a label, the number, and a short line under it. The data half
 * (`string | number` values) is `@marktiderman/genesis-core/resource`'s `HeadlineNumber`,
 * which a server or a phone can build; here `value` and `detail` may be any React node.
 */
export interface HeadlineNumber extends Omit<CoreHeadlineNumber, "value" | "detail"> {
  value: ReactNode;
  detail?: ReactNode;
}

const TONE: Record<HeadlineTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-300",
  negative: "text-red-700 dark:text-red-300",
  warning: "text-amber-800 dark:text-amber-200",
  muted: "text-muted-foreground",
};

/**
 * A row of headline numbers (KPI cards): two across on a phone, up to four on a wide screen. Each
 * is the one widget tile (`WidgetTile`, variant `headline`, part `headline-number`).
 */
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
        <WidgetTile
          key={n.key}
          variant="headline"
          label={n.label}
          value={n.value}
          detail={n.detail}
          detailClassName={TONE[n.tone ?? "muted"]}
          testID={`headline-${n.key}`}
        />
      ))}
    </dl>
  );
}
