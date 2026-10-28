import type { ComponentProps, ComponentType, ReactNode } from "react";
import { cn } from "../../utils";
import { fillMessage, useUiMessages } from "../../messages";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { EmptyState } from "./EmptyState";
import {
  PageHeader,
  type PageHeaderOptions,
  type PageHeaderAction,
} from "../layout/PageHeader";
import type { ViewMode } from "../patterns/view-toggle";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Density } from "../../hooks/use-view-settings";

export interface DataPageShellProps {
  /** Display title for the page */
  title: string;
  icon?: LucideIcon;
  /** Singular entity name for generated text, e.g. "session" */
  entityName?: string;
  /** Several of `entityName` ("people"), when not `entityName` + "s". */
  entityNamePlural?: string;
  /** The count's words; see PageHeader `countFormat`. */
  countFormat?: { one?: string; other?: string; filtered?: string };
  /** Subtitle text */
  subtitle?: string;
  createAction?: ReactNode;
  /** Extra actions, rendered in the header's one overflow menu. */
  secondaryActions?: PageHeaderAction[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyMessage?: string;
  /**
   * A sentence under the empty-state title — what this list is for, or what
   * to do first. Forwarded to `EmptyState`'s `description`; hidden while
   * filters are active, where "no results" is the whole story.
   */
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Error state */
  hasError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Number of filtered/visible items */
  count?: number;
  /** Total items before filtering */
  totalCount?: number;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  /** View settings */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  density?: Density;
  onDensityChange?: (density: Density) => void;
  /**
   * Slot for a stat cards row. Forwarded to the header, which renders it
   * full width under the title block and above the filters — but only when
   * `headerOptions.showStats` is on (default off), so a page that gains
   * `stats` shows nothing new until the developer or user opts in.
   */
  stats?: ReactNode;
  /** Slot for filter bar */
  filters?: ReactNode;
  /** Whether filters are currently active */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /**
   * When true, filters render inside PageHeader details (collapsed by default).
   * Default false preserves always-visible filters on existing boards.
   */
  filtersCollapsible?: boolean;
  defaultFiltersOpen?: boolean;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
  filtersLabel?: string;
  filtersHint?: ReactNode;
  /**
   * PageHeader chrome config — developer defaults; users can further
   * customize via the in-header Header options menu.
   */
  headerOptions?: PageHeaderOptions;
  /** Persist user header-option overrides (localStorage) */
  headerOptionsStorageKey?: string;
  children: ReactNode;
  /** Merged onto the root, not replacing its layout. */
  className?: string;
  /**
   * Replace the header outright. It receives exactly the props
   * `DataPageShell` would have given `PageHeader`, so the common case is a
   * wrapper that renders `PageHeader` with one thing added — an overflow
   * menu, a status strip, a second row — rather than a reimplementation.
   *
   * `null` ejects it: shell layout, states and filter row, no header.
   *
   * `"toolbar"` keeps the header's actions — count, view toggle, view
   * settings, create, overflow menu — and drops the title block, for a list
   * embedded in a tab or card whose page already has the heading. `title`
   * still feeds the generated copy ("Failed to load …", the count's noun).
   */
  header?: ComponentType<ComponentProps<typeof PageHeader>> | null | "toolbar";
}

export function DataPageShell({
  title,
  icon,
  entityName,
  entityNamePlural,
  countFormat,
  subtitle,
  createAction,
  secondaryActions,
  isLoading = false,
  isEmpty = false,
  emptyIcon,
  emptyMessage,
  emptyDescription,
  emptyAction,
  hasError = false,
  errorMessage,
  onRetry,
  count,
  totalCount,
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  density,
  onDensityChange,
  stats,
  filters,
  hasActiveFilters = false,
  onClearFilters,
  filtersCollapsible = false,
  defaultFiltersOpen = false,
  filtersOpen,
  onFiltersOpenChange,
  filtersLabel,
  filtersHint,
  headerOptions,
  headerOptionsStorageKey,
  children,
  className,
  header,
}: DataPageShellProps) {
  const m = useUiMessages();
  const entity = entityName || title.toLowerCase();
  // `header === null` ejects the header, and the doc on `header` promises the
  // filter row survives that. It only does in the standard branch, where
  // `filters` renders as an independent sibling. In the collapsible branch the
  // filter row reaches the DOM ONLY as the header's `details` prop, so an
  // ejected header takes the filters down with it — silently, which is the
  // worst version. Collapsing needs a header to collapse INTO; without one we
  // fall through to the standard branch and the filter row renders on its own.
  const collapseFilters =
    filtersCollapsible && filters != null && header !== null;

  // Toolbar mode is PageHeader without its title block, not a second header
  // implementation: the count, toggles, settings and overflow menu keep one
  // home. A caller's own `headerOptions.showTitle` still wins.
  const toolbarOnly = header === "toolbar";
  const baseHeaderOptions: PageHeaderOptions | undefined = toolbarOnly
    ? { showTitle: false, ...headerOptions }
    : headerOptions;

  const mergedOptions: PageHeaderOptions = {
    defaultDetailsOpen: defaultFiltersOpen,
    detailsLabel: filtersLabel,
    subtitleInDetails: collapseFilters ? true : undefined,
    ...baseHeaderOptions,
  };

  const sharedHeaderProps = {
    title,
    subtitle,
    icon,
    entityName: entity,
    ...(entityNamePlural ? { entityNamePlural } : {}),
    ...(countFormat ? { countFormat } : {}),
    count,
    totalCount,
    countActive: hasActiveFilters,
    viewMode,
    onViewModeChange,
    pageSize,
    onPageSizeChange,
    density,
    onDensityChange,
    createAction,
    secondaryActions,
    stats,
    optionsStorageKey: headerOptionsStorageKey,
  };

  const Header =
    header === null
      ? () => null
      : header === "toolbar" || header === undefined
        ? PageHeader
        : header;

  return (
    <div className={cn("space-y-6", className)}>
      {collapseFilters ? (
        <Header
          {...sharedHeaderProps}
          details={filters}
          detailsOpen={filtersOpen}
          onDetailsOpenChange={onFiltersOpenChange}
          detailsActive={hasActiveFilters}
          detailsHint={filtersHint}
          options={mergedOptions}
        />
      ) : (
        <>
          <Header {...sharedHeaderProps} options={baseHeaderOptions} />
          {filters}
        </>
      )}

      {/* Content */}
      {isLoading ? (
        // Shaped like the view it stands in for, so a list inside a panel or
        // tab doesn't reserve a page of card placeholders.
        <div data-testid="page-loader" role="status" aria-busy="true">
          <span className="sr-only">{m.common.loading}</span>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-32 rounded-xl"
                  style={{ animationDelay: `${i * 75}ms` }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-10 rounded-md"
                  style={{ animationDelay: `${i * 75}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      ) : hasError ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <AlertTriangle className="h-10 w-10 text-destructive mb-3" aria-hidden />
          <p className="mb-1 text-sm font-medium text-foreground">
            {m.page.errorTitle}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {errorMessage || fillMessage(m.page.errorBody, { entity })}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden /> {m.page.retry}
            </Button>
          )}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyMessage}
          {...(emptyDescription ? { description: emptyDescription } : {})}
          action={emptyAction}
          hasFilters={hasActiveFilters}
          onClearFilters={onClearFilters}
        />
      ) : (
        children
      )}
    </div>
  );
}
