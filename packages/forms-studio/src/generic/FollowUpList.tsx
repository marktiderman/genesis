import type { ReactNode } from "react";
import { Skeleton, cn } from "@marktiderman/genesis-ui";
import { CircleCheck, Star, TriangleAlert } from "lucide-react";
import { Chip } from "./chip";
import type { ChipTone } from "./status";

/** One response in the follow-up list, as the host describes it. */
export interface FollowUpEntry {
  id: string;
  /** Who answered: a name, or "Anonymous". */
  name: string;
  /** A tag beside the name, e.g. "Member" or "New lead". */
  tag?: { label: string; tone?: ChipTone | undefined } | undefined;
  /** One line under the name: "Today · 6:00 WOD · Leo". */
  meta?: ReactNode;
  /** What they wrote; null shows "No comment". */
  comment?: string | null | undefined;
  /** The low score, on its scale. */
  rating?: { value: number; max: number } | null | undefined;
}

/**
 * Responses that need a follow-up (needsFollowUp), each with who answered, a tag, the day
 * and context, their comment, its low score and the host's actions (Reply, Mark handled).
 * Handled items are the host's to leave out.
 */
export function FollowUpList({
  entries,
  actions,
  title = "Needs a follow-up",
  isLoading = false,
  empty = "Nothing to follow up right now.",
  className,
}: {
  entries: readonly FollowUpEntry[];
  /** Buttons for one entry. */
  actions?: ((entry: FollowUpEntry) => ReactNode) | undefined;
  title?: string | undefined;
  isLoading?: boolean | undefined;
  /** Said when the list is empty. */
  empty?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section
      aria-label={title}
      data-testid="follow-up-list"
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground", className)}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="size-4 text-amber-800 dark:text-amber-200" aria-hidden />
          {title}
        </h3>
        {!isLoading ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {entries.length}
          </span>
        ) : null}
      </header>
      {isLoading ? (
        <>
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </>
      ) : entries.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const buttons = actions?.(entry);
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-1.5 rounded-md border border-border p-3"
                data-testid={`follow-up-${entry.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words font-medium">{entry.name}</span>
                    {entry.tag ? <Chip tone={entry.tag.tone ?? "muted"}>{entry.tag.label}</Chip> : null}
                  </p>
                  {entry.rating ? (
                    <span
                      className="flex shrink-0 items-center gap-0.5 text-sm font-medium tabular-nums text-amber-800 dark:text-amber-200"
                      aria-label={`Rated ${entry.rating.value} out of ${entry.rating.max}`}
                    >
                      {entry.rating.value}
                      <Star className="size-3.5 fill-current" aria-hidden />
                    </span>
                  ) : null}
                </div>
                {entry.meta ? <p className="text-xs text-muted-foreground">{entry.meta}</p> : null}
                <p className={cn("line-clamp-3 break-words text-sm", !entry.comment && "text-muted-foreground")}>
                  {entry.comment || "No comment"}
                </p>
                {buttons ? <div className="mt-1 flex flex-wrap gap-2">{buttons}</div> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
