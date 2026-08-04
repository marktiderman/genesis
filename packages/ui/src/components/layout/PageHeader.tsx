"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ListFilter, SlidersHorizontal } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { ViewToggle, type ViewMode } from "../patterns/view-toggle";
import { ViewSettings } from "../patterns/view-settings";
import type { Density } from "../../hooks/use-view-settings";
import { cn } from "../../utils";
import {
  readStoredOptions as readStoredOptionsRaw,
  writeStoredOptions,
} from "../../option-storage";

/**
 * Declarative chrome for PageHeader — developer defaults + optional
 * in-header user toggles (Notion/Linear “customize view” pattern).
 *
 * @stability Beta
 */
export interface PageHeaderOptions {
  showIcon?: boolean;
  showSubtitle?: boolean;
  showCount?: boolean;
  showViewToggle?: boolean;
  showViewSettings?: boolean;
  showCreate?: boolean;
  /** Ghost ListFilter control in the actions cluster */
  showDetailsToggle?: boolean;
  /** Quiet hint beside actions while details are collapsed */
  showDetailsHint?: boolean;
  /** Move subtitle into the details panel (default true when details exist) */
  subtitleInDetails?: boolean;
  defaultDetailsOpen?: boolean;
  detailsLabel?: string;
  /**
   * Show the in-header Header options popover so users can customize chrome.
   * Default true when the header has more than one chrome affordance.
   */
  configurable?: boolean;
}

/** @stability Beta */
export type PageHeaderOptionKey = keyof PageHeaderOptions;

/** Naive English pluralization for the count badge — singular at exactly 1. */
function pluralizeEntity(entity: string, count: number): string {
  if (count === 1) return entity;
  return entity.endsWith("s") ? entity : `${entity}s`;
}

const OPTION_DEFAULTS: Required<
  Omit<PageHeaderOptions, "detailsLabel" | "defaultDetailsOpen" | "subtitleInDetails" | "configurable">
> &
  Pick<PageHeaderOptions, "detailsLabel" | "defaultDetailsOpen" | "subtitleInDetails" | "configurable"> = {
  showIcon: true,
  showSubtitle: true,
  showCount: true,
  showViewToggle: true,
  showViewSettings: true,
  showCreate: true,
  showDetailsToggle: true,
  showDetailsHint: true,
  subtitleInDetails: undefined,
  defaultDetailsOpen: false,
  detailsLabel: "Details",
  configurable: undefined,
};

const BOOLEAN_OPTION_KEYS: PageHeaderOptionKey[] = [
  "showIcon",
  "showSubtitle",
  "showCount",
  "showViewToggle",
  "showViewSettings",
  "showCreate",
  "showDetailsToggle",
  "showDetailsHint",
  "subtitleInDetails",
  "defaultDetailsOpen",
  "configurable",
];
const STRING_OPTION_KEYS: PageHeaderOptionKey[] = ["detailsLabel"];

/**
 * Reads persisted options and keeps only known keys whose stored value has
 * the expected primitive type — a malformed or hand-edited localStorage
 * value can't smuggle in an unexpected key or wrong-typed override.
 */
function readStoredOptions(key: string): Partial<PageHeaderOptions> {
  const raw = readStoredOptionsRaw<PageHeaderOptions>(key);
  const sanitized: Partial<PageHeaderOptions> = {};
  for (const optKey of BOOLEAN_OPTION_KEYS) {
    const value = raw[optKey];
    if (typeof value === "boolean") {
      (sanitized as Record<string, boolean>)[optKey] = value;
    }
  }
  for (const optKey of STRING_OPTION_KEYS) {
    const value = raw[optKey];
    if (typeof value === "string") {
      (sanitized as Record<string, string>)[optKey] = value;
    }
  }
  return sanitized;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /**
   * Header chrome config (developer defaults). Merged under user picks from
   * the in-header options menu when `options.configurable` / storage is on.
   */
  options?: PageHeaderOptions;
  /** Persist user header-option overrides (localStorage) */
  optionsStorageKey?: string;
  /** Extra trailing actions (after create); prefer first-class slots below */
  actions?: ReactNode;
  /** Collapsible details region below the title row */
  details?: ReactNode;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  detailsActive?: boolean;
  detailsHint?: ReactNode;
  /** Count badge */
  count?: number;
  totalCount?: number;
  /** Singular entity for “N rows” copy when unfiltered */
  entityName?: string;
  countActive?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  density?: Density;
  onDensityChange?: (density: Density) => void;
  createAction?: ReactNode;
}

type ToggleDef = {
  key: keyof PageHeaderOptions;
  label: string;
  available: boolean;
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  options: optionsProp,
  optionsStorageKey,
  actions,
  details,
  detailsOpen,
  onDetailsOpenChange,
  detailsActive = false,
  detailsHint,
  count,
  totalCount,
  entityName,
  countActive = false,
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  density,
  onDensityChange,
  createAction,
}: PageHeaderProps) {
  const detailsRegionId = useId();
  const hasDetails = details != null;
  const hasCount = count !== undefined && totalCount !== undefined;
  const hasViewToggle = Boolean(viewMode && onViewModeChange);
  const hasViewSettings = Boolean(onPageSizeChange && onDensityChange);
  const hasCreate = createAction != null;

  const [userOverrides, setUserOverrides] = useState<Partial<PageHeaderOptions>>(
    {},
  );
  // Tracks which storage key the current overrides were hydrated from, so a
  // key change (routing between pages with distinct keys while this header
  // stays mounted) can't flush the previous key's overrides into the new key
  // before the read effect re-hydrates.
  const [hydratedKey, setHydratedKey] = useState<string | undefined>(
    optionsStorageKey ? undefined : "",
  );

  useEffect(() => {
    if (!optionsStorageKey) {
      setUserOverrides({});
      setHydratedKey("");
      return;
    }
    setUserOverrides(readStoredOptions(optionsStorageKey));
    setHydratedKey(optionsStorageKey);
  }, [optionsStorageKey]);

  useEffect(() => {
    // Persist only once overrides belong to the current key (see hydratedKey).
    if (!optionsStorageKey || hydratedKey !== optionsStorageKey) return;
    writeStoredOptions(optionsStorageKey, userOverrides);
  }, [optionsStorageKey, userOverrides, hydratedKey]);

  const resolved = useMemo(() => {
    const merged: PageHeaderOptions = {
      ...OPTION_DEFAULTS,
      ...optionsProp,
      ...userOverrides,
    };
    if (merged.subtitleInDetails === undefined) {
      merged.subtitleInDetails = hasDetails;
    }
    if (merged.configurable === undefined) {
      merged.configurable =
        hasDetails || hasCount || hasViewSettings || hasViewToggle;
    }
    return merged;
  }, [
    optionsProp,
    userOverrides,
    hasDetails,
    hasCount,
    hasViewSettings,
    hasViewToggle,
  ]);

  const patchOption = useCallback((key: keyof PageHeaderOptions, value: boolean) => {
    setUserOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const moveSubtitle = Boolean(resolved.subtitleInDetails) && hasDetails;
  const showTitleSubtitle =
    Boolean(subtitle) &&
    Boolean(resolved.showSubtitle) &&
    !moveSubtitle;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    () => optionsProp?.defaultDetailsOpen ?? OPTION_DEFAULTS.defaultDetailsOpen!,
  );
  const isControlled = detailsOpen !== undefined;
  const open = isControlled ? detailsOpen! : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onDetailsOpenChange?.(next);
  };

  const detailsLabel = resolved.detailsLabel ?? "Details";
  const entity = entityName || "item";

  const toggles: ToggleDef[] = (
    [
      { key: "showIcon", label: "Icon", available: Boolean(Icon) },
      {
        key: "showSubtitle",
        label: "Subtitle",
        available: Boolean(subtitle) && !moveSubtitle,
      },
      { key: "showCount", label: "Count", available: hasCount },
      { key: "showViewToggle", label: "View toggle", available: hasViewToggle },
      {
        key: "showViewSettings",
        label: "Display settings",
        available: hasViewSettings,
      },
      { key: "showCreate", label: "Create action", available: hasCreate },
      {
        key: "showDetailsToggle",
        label: "Filters / details",
        available: hasDetails,
      },
      {
        key: "showDetailsHint",
        label: "Collapsed hint",
        available: hasDetails && detailsHint != null,
      },
    ] as const satisfies readonly ToggleDef[]
  ).filter((t) => t.available);

  const showDetailsToggle =
    hasDetails && Boolean(resolved.showDetailsToggle);
  const showHint =
    hasDetails &&
    !open &&
    Boolean(resolved.showDetailsHint) &&
    detailsHint != null;

  const actionsCluster = (
    <div className="flex items-center gap-1.5 shrink-0">
      {showHint ? (
        <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:inline">
          {detailsHint}
        </span>
      ) : null}

      {hasCount && resolved.showCount !== false ? (
        <Badge variant="secondary" className="text-xs">
          {countActive
            ? `${count} of ${totalCount}`
            : `${totalCount} ${pluralizeEntity(entity, totalCount!)}`}
        </Badge>
      ) : null}

      {hasViewToggle && resolved.showViewToggle !== false ? (
        <ViewToggle viewMode={viewMode!} onViewModeChange={onViewModeChange!} />
      ) : null}

      {showDetailsToggle ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-8 w-8",
            (open || detailsActive) && "bg-accent text-accent-foreground",
          )}
          onClick={() => setOpen(!open)}
          data-testid="page-header-details-toggle"
          title={open ? `Hide ${detailsLabel}` : `Show ${detailsLabel}`}
          aria-label={open ? `Hide ${detailsLabel}` : `Show ${detailsLabel}`}
          aria-expanded={open}
          aria-controls={detailsRegionId}
          testID="page-header-details-toggle"
        >
          <ListFilter className="h-4 w-4" />
          {detailsActive ? (
            <span
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
        </Button>
      ) : null}

      {hasViewSettings && resolved.showViewSettings !== false ? (
        <ViewSettings
          pageSize={pageSize ?? 25}
          onPageSizeChange={onPageSizeChange!}
          density={density ?? "comfortable"}
          onDensityChange={onDensityChange!}
        />
      ) : null}

      {hasCreate && resolved.showCreate !== false ? createAction : null}

      {actions}

      {resolved.configurable && toggles.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Header options"
              aria-label="Header options"
              data-testid="page-header-options"
              testID="page-header-options"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Header options</h4>
              <p className="text-xs text-muted-foreground">
                Customize this page header. Saved on this device when a storage
                key is set.
              </p>
            </div>
            <ul className="space-y-3">
              {toggles.map((t) => {
                const checked = Boolean(resolved[t.key] ?? true);
                return (
                  <li
                    key={t.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <Label
                      htmlFor={`page-header-opt-${t.key}`}
                      className="text-sm font-normal"
                    >
                      {t.label}
                    </Label>
                    <Switch
                      id={`page-header-opt-${t.key}`}
                      checked={checked}
                      onCheckedChange={(v) => patchOption(t.key, v)}
                    />
                  </li>
                );
              })}
            </ul>
            {optionsStorageKey && Object.keys(userOverrides).length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => setUserOverrides({})}
                data-testid="page-header-options-reset"
                aria-label="Reset header options"
                testID="page-header-options-reset"
              >
                Reset to defaults
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );

  const titleRow = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && resolved.showIcon !== false ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1
            data-testid="page-title"
            className="truncate font-display text-xl font-bold tracking-tight sm:text-2xl"
          >
            {title}
          </h1>
          {showTitleSubtitle ? (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actionsCluster}
    </div>
  );

  if (!hasDetails) {
    return titleRow;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {titleRow}
      <CollapsibleContent id={detailsRegionId} className="mt-3">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 sm:p-4">
          {moveSubtitle && subtitle && resolved.showSubtitle !== false ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
          {details}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
