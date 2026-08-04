import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../ui/button";
import {
  FileQuestion,
  Lightbulb,
  MessageSquare,
  Search,
  type LucideIcon,
} from "lucide-react";

const DEFAULT_TITLE = "No results found";
const FILTERED_TITLE = "No results match your filters";

export interface EmptyStateProps {
  icon?: LucideIcon;
  /**
   * Bold heading. Optional — falls back to `message` (deprecated), then a
   * generic default. Superseded by fixed copy whenever `hasFilters` is true.
   */
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * @deprecated Use `title` instead. Kept for source compatibility with the
   * former `@marktiderman/genesis-ui/data` EmptyState, which used `message`
   * in place of `title`/`description`. Ignored whenever `title` is also
   * provided.
   */
  message?: string;
  /**
   * Renders a "no results match your current filters" state — superseding
   * `title`/`description` — and, when `onClearFilters` is also given, a
   * "Clear all filters" action in place of `action`.
   */
  hasFilters?: boolean;
  /** Invoked by the "Clear all filters" action shown when `hasFilters` is true. */
  onClearFilters?: () => void;
}

/**
 * EmptyState — what to show when a list, page, or panel has no data.
 *
 * Canonical for `@marktiderman/genesis-ui`. The former
 * `@marktiderman/genesis-ui/data` EmptyState is now a deprecated re-export of
 * this component (see `../data/EmptyState`) — its `hasFilters` /
 * `onClearFilters` / `message` props all landed here, so nothing consuming
 * that subpath needs a source change. Note that the *rendered output* is this
 * component's, not the old `/data` one's: see that file's `@deprecated` block
 * for the visual differences a `/data` consumer will see.
 *
 * Precedence: `hasFilters` wins over everything the caller passed — it
 * replaces the heading with fixed "no results match your filters" copy,
 * suppresses `description`, and (given `onClearFilters`) replaces `action`
 * with a "Clear all filters" button.
 *
 * @stability Beta
 */
export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  className,
  message,
  hasFilters = false,
  onClearFilters,
}: EmptyStateProps) {
  const resolvedTitle = hasFilters ? FILTERED_TITLE : title ?? message ?? DEFAULT_TITLE;
  const resolvedDescription = hasFilters ? undefined : description;
  const resolvedAction =
    hasFilters && onClearFilters ? (
      <Button
        variant="link"
        size="sm"
        testID="empty-state-clear-filters"
        onClick={onClearFilters}
      >
        Clear all filters
      </Button>
    ) : (
      action
    );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{resolvedTitle}</h3>
      {resolvedDescription && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {resolvedDescription}
        </p>
      )}
      {resolvedAction && <div className="mt-6">{resolvedAction}</div>}
    </div>
  );
}

/**
 * Preset `EmptyState` for an empty roadmap / feature list.
 *
 * @stability Beta
 */
export function NoFeaturesFound({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon={Lightbulb}
      title="No features found"
      description="Start building your product roadmap by creating your first epic."
      action={
        onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Epic
          </button>
        )
      }
    />
  );
}

/**
 * Preset `EmptyState` for a feedback inbox with nothing in it yet.
 *
 * @stability Beta
 */
export function NoFeedbackFound() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No feedback yet"
      description="Feedback from users will appear here as they use the app."
    />
  );
}

/**
 * Preset `EmptyState` for a search or filter that matched nothing.
 *
 * @stability Beta
 */
export function NoSearchResults({
  query,
  onClear,
}: {
  query?: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={
        query
          ? `No results found for "${query}". Try a different search term.`
          : "No results match your current filters."
      }
      action={
        onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-primary hover:text-primary/80 font-medium"
          >
            Clear search
          </button>
        )
      }
    />
  );
}
