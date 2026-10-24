import { Skeleton, cn } from "@marktiderman/genesis-ui";
import { ChartNoAxesColumnDecreasing } from "lucide-react";
import { SummaryCard } from "./generic/SummaryCard";
import type { QuestionDropOff } from "./dropoff";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Drop-off by question (dropOffByQuestion): for each question in order, how many people
 * reached it, how many stopped there, and that as a share, with the share as a bar (the
 * question most people left on in the warning colour). For a form that saves answers as
 * they go.
 */
export function DropOffByQuestion({
  dropOffs,
  isLoading = false,
  title = "Drop-off by question",
  className,
}: {
  dropOffs: readonly QuestionDropOff[];
  isLoading?: boolean | undefined;
  title?: string | undefined;
  className?: string | undefined;
}) {
  if (isLoading) return <Skeleton className={cn("h-40 w-full rounded-lg", className)} />;
  const started = dropOffs[0]?.views ?? 0;
  const worst = Math.max(0, ...dropOffs.map((d) => d.stopped));
  return (
    <SummaryCard
      icon={<ChartNoAxesColumnDecreasing />}
      title={title}
      meta={started ? `${plural(started, "person", "people")} started` : "Nobody has started yet"}
      className={className}
      testID="drop-off"
    >
      {started ? (
        <ol className="space-y-3">
          {dropOffs.map((d, i) => (
            <li key={d.key} className="space-y-1.5 text-sm" data-testid={`drop-off-${d.key}`}>
              <p className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                  {d.label || "Untitled question"}
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                  {d.dropOff === null ? "–" : `${d.dropOff}% drop-off`}
                </span>
              </p>
              <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className={cn(
                    "block h-full rounded-full",
                    d.stopped && d.stopped === worst ? "bg-warning" : "bg-primary",
                  )}
                  style={{ width: `${d.dropOff ?? 0}%` }}
                />
              </span>
              <p className="text-xs text-muted-foreground">
                {plural(d.views, "view")} · {d.stopped} stopped here
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </SummaryCard>
  );
}
