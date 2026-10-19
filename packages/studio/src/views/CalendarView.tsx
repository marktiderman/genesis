import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BaseRecord, DataProvider, FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, type FieldSchema, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { cn } from "@marktiderman/genesis-ui/utils";
import { displayText } from "../values";
import { currentMonth, dayKey, isDateOnly, localDay, monthBounds, shiftMonth } from "./fields";

type Row = Record<string, unknown>;

/** Most rows one month shows. Past this, the view says so and asks for a filter. */
export const CALENDAR_CAP = 200;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface CalendarViewProps {
  provider: DataProvider;
  schema: ResourceSchema;
  sessionKey: string | number | null;
  /** The date or timestamp field that places each row. */
  field: FieldSchema;
  /** `YYYY-MM`; this month when absent. */
  month: string | undefined;
  onMonthChange: (month: string) => void;
  filters: FilterParam[];
  sorts: SortParam[];
  search: string;
  onOpenRecord: (id: string) => void;
  onSignedOut: () => void;
}

/** The weeks of a month, Monday first, each day as `YYYY-MM-DD` or null outside the month. */
function weeksOf(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => dayKey(new Date(y, m - 1, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * A month of the table's rows, placed by a date field. One request per
 * month (a `gte`/`lt` range on the field, with the table's filters, search
 * and sort), up to 200 rows. A timestamp shows on the day it falls in the
 * viewer's time zone.
 */
export function CalendarView({
  provider,
  schema,
  sessionKey,
  field,
  month: monthProp,
  onMonthChange,
  filters,
  sorts,
  search,
  onOpenRecord,
  onSignedOut,
}: CalendarViewProps) {
  const month = monthProp ?? currentMonth();
  const dateOnly = isDateOnly(field);
  const { from, to } = monthBounds(month, field);
  const query = useQuery({
    queryKey: ["genesis-studio", sessionKey, "list", schema.name, "calendar", field.name, month, JSON.stringify(filters), search, JSON.stringify(sorts)],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: () =>
      provider.getList<BaseRecord>(schema.name, {
        pagination: { page: 1, perPage: CALENDAR_CAP },
        sort: sorts[0] ?? { field: field.name, order: "asc" },
        sorts: sorts.length ? sorts : [{ field: field.name, order: "asc" }],
        filters: [
          ...filters,
          { field: field.name, operator: "gte", value: from } as FilterParam,
          { field: field.name, operator: "lt", value: to } as FilterParam,
        ],
        search: search ? { query: search, fields: [] } : undefined,
      }),
  });
  const signedOut = isDataWriteError(query.error) && query.error.outcome === "unauthenticated";
  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);

  const rows = (query.data?.data ?? []) as Row[];
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const day = localDay(row[field.name], dateOnly);
      if (!day) continue;
      map.set(day, [...(map.get(day) ?? []), row]);
    }
    return map;
  }, [rows, field.name, dateOnly]);
  const total = query.data?.total ?? 0;
  const today = dayKey(new Date());
  const title = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const labelField = schema.labelField;

  return (
    <div className="space-y-2" data-testid="studio-calendar">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onMonthChange(currentMonth())}>
          Today
        </Button>
        <h3 className="text-sm font-semibold" aria-live="polite">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground">by {field.name}</span>
      </div>
      {total > rows.length && (
        <p role="status" className="text-xs text-muted-foreground" data-testid="studio-calendar-capped">
          Showing the first {rows.length.toLocaleString()} of {total.toLocaleString()} rows this month. Filter the table to see the rest.
        </p>
      )}
      {query.isError && !signedOut && (
        <p role="alert" className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {schema.label ?? schema.name} by {field.name}, {title}
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="py-1 text-left text-xs font-medium text-muted-foreground">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeksOf(month).map((week, w) => (
              <tr key={w}>
                {week.map((day, d) => (
                  <td
                    key={day ?? `pad-${w}-${d}`}
                    className={cn("h-28 border align-top", !day && "bg-muted/30")}
                    data-day={day ?? undefined}
                  >
                    {day && (
                      <div className="flex h-full flex-col gap-0.5 p-1">
                        <span className={cn("text-xs", day === today ? "font-bold text-primary" : "text-muted-foreground")}>
                          {Number(day.slice(8))}
                        </span>
                        <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                          {(byDay.get(day) ?? []).map((row) => {
                            const id = String(encodeRecordKey(schema, row));
                            return (
                              <li key={id}>
                                <button
                                  type="button"
                                  className="w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-xs hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => onOpenRecord(id)}
                                  data-testid="studio-calendar-item"
                                >
                                  {displayText(labelField ? row[labelField] : undefined) ?? id}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
