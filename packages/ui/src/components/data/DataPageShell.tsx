import type { ComponentProps, ComponentType, ReactNode } from "react";
import { cn } from "../../utils";
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
  /** Subtitle text */
  subtitle?: string;
  createAction?: ReactNode;
  /** Extra actions, rendered in the header's one overflow menu. */
  secondaryActions?: PageHeaderAction[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyMessage?: string;
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
   */
  header?: ComponentType<ComponentProps<typeof PageHeader>> | null;
}

export function DataPageShell({
  title,
  icon,
  entityName,
  subtitle,
  createAction,
  secondaryActions,
  isLoading = false,
  isEmpty = false,
  emptyIcon,
  emptyMessage,
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
  const entity = entityName || title.toLowerCase();
  const collapseFilters = filtersCollapsible && filters != null;

  const mergedOptions: PageHeaderOptions = {
    defaultDetailsOpen: defaultFiltersOpen,
    detailsLabel: filtersLabel,
    subtitleInDetails: collapseFilters ? true : undefined,
    ...headerOptions,
  };

  const sharedHeaderProps = {
    title,
    subtitle,
    icon,
    entityName: entity,
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
    optionsStorageKey: headerOptionsStorageKey,
  };

  const Header =
    header === null ? (() => null) : (header ?? PageHeader);

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
          <Header {...sharedHeaderProps} options={headerOptions} />
          {filters}
        </>
      )}

      {/* Content */}
      {isLoading ? (
        <div
          data-testid="page-loader"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-40 rounded-xl"
              style={{ animationDelay: `${i * 75}ms` }}
            />
          ))}
        </div>
      ) : hasError ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
          <p className="mb-1 text-sm font-medium text-foreground">
            Something went wrong
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {errorMessage || `Failed to load ${entity}s. Please try again.`}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1 h-4 w-4" /> Retry
            </Button>
          )}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyMessage}
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
