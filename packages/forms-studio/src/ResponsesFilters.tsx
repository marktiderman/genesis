import type { ReactNode } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@marktiderman/genesis-ui";
import { CalendarDays, CircleDashed, TriangleAlert, X } from "lucide-react";
import { lowThisWeek, NO_FILTERS, STATUS_FILTER_LABEL, type FiltersValue, type StatusFilter } from "./summary";

/** One "pick a value" filter over an extra column, such as a location or a staff member. */
export interface ChoiceFilter {
  key: string;
  /** "Any class": what the menu says when nothing is picked. */
  allLabel: string;
  /** For screen readers: "Class". */
  label: string;
  options: string[];
  /** Shown before the value, e.g. a person icon for a staff member. */
  icon?: ReactNode;
}

const WHEN: { value: FiltersValue["when"]; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Pick dates" },
];
const ANY = "__any";
const TRIGGER = "h-9 w-auto min-w-0 gap-2 [&>span]:flex [&>span]:items-center [&>span]:gap-2";

/**
 * Filters for a form's responses: when, the status (with `statuses`: Sent and partial,
 * Sent, Partial, In progress), any number of choice filters, a rating floor, and the
 * low-ratings chip ("Low ratings this week" until it's on; then a chip saying what low
 * means, with ×). The summary and the list of responses share one value.
 */
export function ResponsesFilters({
  value,
  onChange,
  choices = [],
  ratingMax = null,
  lowLabel = null,
  statuses = false,
  filtered,
}: {
  /** Show the status filter: for a form that saves answers as they go (settings.saveProgress). */
  statuses?: boolean | undefined;
  value: FiltersValue;
  onChange: (next: FiltersValue) => void;
  choices?: readonly ChoiceFilter[] | undefined;
  /** The highest rating any question asks for (highestRating); no rating filter when null. */
  ratingMax?: number | null | undefined;
  /** What counts as low (lowRatingLabel); no low-ratings chip when null. */
  lowLabel?: string | null | undefined;
  /** Whether anything is left out (isFiltered), for Clear filters. */
  filtered: boolean;
}) {
  const ratings = ratingMax ? Array.from({ length: Math.min(ratingMax, 10) - 1 }, (_, i) => i + 1) : [];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="responses-filters">
      <Select value={value.when} onValueChange={(when) => onChange({ ...value, when: when as FiltersValue["when"] })}>
        <SelectTrigger className={TRIGGER} aria-label="When">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WHEN.map((w) => (
            <SelectItem key={w.value} value={w.value}>
              {w.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.when === "custom" ? (
        <span className="flex items-center gap-1">
          <Input
            type="date"
            className="h-9 w-auto"
            aria-label="From"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-9 w-auto"
            aria-label="To"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </span>
      ) : null}
      {statuses ? (
        <Select
          value={value.status ?? "counted"}
          onValueChange={(status) => onChange({ ...value, status: status as StatusFilter })}
        >
          <SelectTrigger className={TRIGGER} aria-label="Status" data-testid="responses-status">
            <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_FILTER_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {choices
        .filter((c) => c.options.length > 0)
        .map((c) => (
          <Select
            key={c.key}
            value={value.match[c.key] || ANY}
            onValueChange={(v) => onChange({ ...value, match: { ...value.match, [c.key]: v === ANY ? "" : v } })}
          >
            <SelectTrigger className={`${TRIGGER} max-w-56`} aria-label={c.label}>
              {c.icon ? (
                <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
                  {c.icon}
                </span>
              ) : null}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{c.allLabel}</SelectItem>
              {c.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      {ratings.length > 0 ? (
        <Select
          value={value.ratingAtMost == null ? ANY : String(value.ratingAtMost)}
          onValueChange={(v) => onChange({ ...value, ratingAtMost: v === ANY ? null : Number(v) })}
        >
          <SelectTrigger className={TRIGGER} aria-label="Rating">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any rating</SelectItem>
            {ratings.map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r === 1 ? "Rated 1" : `Rated ${r} or below`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {lowLabel ? (
        value.low ? (
          <span
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-warning/15 pl-2.5 pr-1 text-sm text-amber-800 dark:bg-warning/20 dark:text-amber-200"
            data-testid="low-ratings-chip"
          >
            <TriangleAlert className="size-4" aria-hidden />
            {`Low ratings (${lowLabel})`}
            <button
              type="button"
              aria-label="Show every rating"
              className="rounded p-1 hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChange({ ...value, low: false })}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            startIcon={<TriangleAlert className="size-4" />}
            onClick={() => onChange(lowThisWeek(value))}
            data-testid="low-ratings-preset"
          >
            Low ratings this week
          </Button>
        )
      ) : null}
      {filtered ? (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
