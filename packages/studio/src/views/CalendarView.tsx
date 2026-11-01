import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { BaseRecord, DataProvider, FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, type FieldSchema, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { EventCalendar, readEventTime, type CalendarEvent } from "@marktiderman/genesis-ui/data";
import { displayText, fieldLabel } from "../values";
import { currentMonth, isDateOnly, monthBounds } from "./fields";

type Row = Record<string, unknown>;

/** Most rows one month shows. Past this, the view says so and asks for a filter. */
export const CALENDAR_CAP = 200;

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

/**
 * A month of the table's rows, placed by a date field and drawn by Genesis UI's EventCalendar.
 * One request per month (a `gte`/`lt` range on the field, with the table's filters, search and
 * sort), up to 200 rows. A timestamp shows on the day it falls in the viewer's time zone.
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
  const labelField = schema.labelField;
  const events = useMemo(
    () =>
      rows.flatMap((row): CalendarEvent<Row>[] => {
        const start = readEventTime(row[field.name], dateOnly);
        if (start === null) return [];
        const key = String(encodeRecordKey(schema, row));
        return [{ key, title: displayText(labelField ? row[labelField] : undefined) ?? key, start, row }];
      }),
    [rows, field.name, dateOnly, schema, labelField],
  );
  const total = query.data?.total ?? 0;

  return (
    <EventCalendar<Row>
      events={events}
      layout="month"
      anchor={`${month}-01`}
      onAnchorChange={(day) => onMonthChange(day.slice(0, 7))}
      label={`${schema.label ?? schema.name} by ${fieldLabel(field)}`}
      toolbar={<span className="text-xs text-muted-foreground">by {fieldLabel(field)}</span>}
      notice={
        <>
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
        </>
      }
      onSelect={(event) => onOpenRecord(event.key)}
      testID="studio-calendar"
    />
  );
}
