"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Search,
  X,
  ArrowUpDown,
  Bookmark,
  BookmarkPlus,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { cn } from "../../utils";
import { FilterCombobox, type FilterOption } from "./FilterCombobox";
import type { LucideIcon } from "lucide-react";

export interface DataFilterConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
  allLabel?: string;
  labelMap?: Record<string, string>;
}

export interface SavedViewItem {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

/**
 * One status chip. A plain string is shorthand for `{ value, label: value }`.
 * `count` renders as a muted number after the label.
 */
export interface StatusChipOption {
  value: string;
  label?: string;
  count?: number;
}

/** Rendering of the status chips — a row of pills, or one segmented strip. */
export type StatusChipsVariant = "chips" | "tabs";

interface DataFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sort: string;
  onSortChange: (sort: string) => void;
  sortOptions: Array<{ value: string; label: string }>;
  filters?: DataFilterConfig[];
  /** Status chip toggles */
  statusChips?: {
    options: Array<string | StatusChipOption>;
    selected: string[];
    onChange: (values: string[]) => void;
    /**
     * `"chips"` (default) renders pills inside the filter row. `"tabs"`
     * renders a segmented strip on its own row above the search row —
     * the same border-and-fill look as `ViewToggle`. Selection is
     * multi-select in both.
     */
    variant?: StatusChipsVariant;
  };
  /** Saved views */
  savedViews?: SavedViewItem[];
  onLoadView?: (filters: Record<string, unknown>) => void;
  onSaveView?: (name: string) => void;
  onDeleteView?: (id: string) => void;
  canSaveViews?: boolean;
  /** Called after a view is saved successfully */
  onViewSaved?: (name: string) => void;
  /** Called when an error occurs */
  onError?: (message: string) => void;
  /** Called when "Clear all" is clicked */
  onClearAll?: () => void;
  /** Expose the search input ref for keyboard nav "/" shortcut */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function DataFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  sort,
  onSortChange,
  sortOptions,
  filters = [],
  statusChips,
  savedViews = [],
  onLoadView,
  onSaveView,
  onDeleteView,
  canSaveViews = false,
  onViewSaved,
  onClearAll,
  searchInputRef,
}: DataFiltersProps) {
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const effectiveSearchRef = searchInputRef || internalSearchRef;
  const [viewsOpen, setViewsOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const hasFilters =
    filters.some((f) => f.selected.length > 0) ||
    (statusChips?.selected.length ?? 0) > 0;

  // Plain strings and option objects normalise to one shape so both render
  // paths below read `value`/`label`/`count` without re-checking.
  const statusOptions: Array<{ value: string; label: string; count?: number }> =
    (statusChips?.options ?? []).map((o) =>
      typeof o === "string"
        ? { value: o, label: o }
        : { value: o.value, label: o.label ?? o.value, count: o.count },
    );
  const statusVariant: StatusChipsVariant = statusChips?.variant ?? "chips";

  const toggleStatus = (status: string) => {
    if (!statusChips) return;
    const { selected, onChange } = statusChips;
    onChange(
      selected.includes(status)
        ? selected.filter((s) => s !== status)
        : [...selected, status],
    );
  };

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    onSaveView?.(newViewName.trim());
    setNewViewName("");
    setSaveDialogOpen(false);
    onViewSaved?.(newViewName.trim());
  };

  return (
    <div className="space-y-3">
      {/* Status tabs row — a segmented strip above everything else */}
      {statusChips && statusVariant === "tabs" && (
        <div
          className="flex items-center border rounded-lg overflow-hidden w-fit max-w-full"
          role="group"
          aria-label="Status"
          data-testid="status-tabs"
        >
          {statusOptions.map((o) => {
            const pressed = statusChips.selected.includes(o.value);
            return (
              <Button
                key={o.value}
                type="button"
                variant={pressed ? "default" : "ghost"}
                size="sm"
                className="h-8 rounded-none gap-1.5"
                onClick={() => toggleStatus(o.value)}
                aria-pressed={pressed}
                testID={`status-tab-${o.value}`}
              >
                {o.label}
                {o.count !== undefined && (
                  <span className="text-[10px] tabular-nums opacity-70">
                    {o.count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      )}

      {/* Search + Sort row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={effectiveSearchRef}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="w-full sm:w-[180px] shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Saved Views */}
        {(savedViews.length > 0 || canSaveViews) && (
          <Popover open={viewsOpen} onOpenChange={setViewsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1.5"
              >
                <Bookmark className="h-3 w-3" />
                Views
                {savedViews.length > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">
                    ({savedViews.length})
                  </span>
                )}
                <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[240px] p-2 bg-popover z-50"
              align="start"
            >
              <div className="space-y-1">
                {savedViews.map((view) => (
                  <div key={view.id} className="flex items-center gap-1 group">
                    <button
                      className="flex-1 text-left text-sm px-2 py-1.5 rounded hover:bg-accent truncate"
                      onClick={() => {
                        onLoadView?.(view.filters);
                        setViewsOpen(false);
                      }}
                    >
                      {view.name}
                    </button>
                    {onDeleteView && (
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={() => onDeleteView(view.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {savedViews.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    No saved views yet
                  </p>
                )}
                {canSaveViews && (
                  <>
                    <div className="border-t my-1" />
                    <button
                      className="w-full flex items-center gap-1.5 text-sm px-2 py-1.5 rounded hover:bg-accent text-primary"
                      onClick={() => {
                        setViewsOpen(false);
                        setSaveDialogOpen(true);
                      }}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Save current view
                    </button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Status chips */}
        {statusChips && statusVariant === "chips" && (
          <div className="flex items-center gap-1 mr-1">
            {statusOptions.map((o) => {
              const pressed = statusChips.selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleStatus(o.value)}
                  aria-pressed={pressed}
                  data-testid={`status-chip-${o.value}`}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-all font-medium",
                    pressed
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {o.label}
                  {o.count !== undefined && (
                    <span className="ml-1 text-[10px] tabular-nums opacity-70">
                      {o.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Filter comboboxes */}
        {filters.map((f) =>
          f.options.length > 0 ? (
            <FilterCombobox
              key={f.key}
              label={f.label}
              icon={f.icon}
              options={f.options}
              selected={f.selected}
              onChange={f.onChange}
              searchPlaceholder={f.searchPlaceholder}
              allLabel={f.allLabel}
              labelMap={f.labelMap}
            />
          ) : null,
        )}

        {/* Active filter badges */}
        {filters.flatMap((f) =>
          f.selected.map((val) => (
            <Badge
              key={`${f.key}-${val}`}
              variant="secondary"
              className="text-xs cursor-pointer gap-1"
              onClick={() => f.onChange(f.selected.filter((v) => v !== val))}
            >
              {f.labelMap?.[val] || val}
              <X className="h-2.5 w-2.5" />
            </Badge>
          )),
        )}

        {/* Clear all */}
        {hasFilters && onClearAll && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-muted-foreground"
            onClick={onClearAll}
          >
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Save View Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              Save Current View
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="View name (e.g. 'Active Sessions')"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveView()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveView}
                disabled={!newViewName.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
