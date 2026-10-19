import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { BaseRecord, DataProvider, FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, type AuditEntry, type FieldSchema, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { KanbanBoard, type KanbanColumn } from "@marktiderman/genesis-ui/data";
import { choicesFor, displayText } from "../values";

type Row = Record<string, unknown>;

/** Cards per column page. */
export const KANBAN_PAGE = 50;
const NONE = "__genesis_none__";

export interface KanbanViewProps {
  provider: DataProvider;
  schema: ResourceSchema;
  sessionKey: string | number | null;
  /** The field whose value is each card's column. */
  field: FieldSchema;
  filters: FilterParam[];
  sorts: SortParam[];
  search: string;
  onOpenRecord: (id: string) => void;
  onMoved: (record: string, audit?: AuditEntry) => void;
  onFailed: (record: string, message: string) => void;
  onSignedOut: () => void;
}

function versionOf(schema: ResourceSchema, row: Row): string | null {
  const field = schema.version?.field;
  return field && row[field] != null ? String(row[field]) : null;
}

/**
 * A board of the table's rows, one column per value of `field`. Each column
 * is paged on its own (50 cards, then "Load more"), with the same filters,
 * search and sort as the table. Moving a card is a version-checked update of
 * `field`, so a card someone else just changed is refused, not overwritten.
 */
export function KanbanView({
  provider,
  schema,
  sessionKey,
  field,
  filters,
  sorts,
  search,
  onOpenRecord,
  onMoved,
  onFailed,
  onSignedOut,
}: KanbanViewProps) {
  const values = useMemo(() => [...(choicesFor(field) ?? []), ...(field.nullable ? [NONE] : [])], [field]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [moving, setMoving] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const sortKey = JSON.stringify(sorts);

  const specs = values.flatMap((value) =>
    Array.from({ length: pages[value] ?? 1 }, (_, i) => ({ value, page: i + 1 })),
  );
  const results = useQueries({
    queries: specs.map(({ value, page }) => ({
      queryKey: ["genesis-studio", sessionKey, "list", schema.name, "kanban", field.name, value, page, filterKey, search, sortKey],
      retry: false,
      queryFn: () =>
        provider.getList<BaseRecord>(schema.name, {
          pagination: { page, perPage: KANBAN_PAGE },
          sort: sorts[0],
          sorts,
          filters: [
            ...filters.filter((f) => f.field !== field.name),
            value === NONE
              ? ({ field: field.name, operator: "is_null" } as FilterParam)
              : ({ field: field.name, operator: "eq", value } as FilterParam),
          ],
          search: search ? { query: search, fields: [] } : undefined,
        }),
    })),
  });

  const failure = results.find((r) => r.error)?.error;
  const signedOut = Boolean(failure && isDataWriteError(failure) && failure.outcome === "unauthenticated");
  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);
  // A filter on the board's own field is replaced by each column's value.
  const ownFilter = filters.some((f) => f.field === field.name);

  const columns: KanbanColumn<Row>[] = values.map((value) => {
    const mine = specs.map((s, i) => ({ s, r: results[i]! })).filter(({ s }) => s.value === value);
    return {
      key: value,
      label: value === NONE ? "No value" : value,
      items: mine.flatMap(({ r }) => (r.data?.data ?? []) as Row[]),
      ...(mine[0]?.r.data ? { total: mine[0].r.data.total } : {}),
    };
  });

  const labelField = schema.labelField;
  const extra = schema.fields
    .filter((f) => f.name !== labelField && f.name !== field.name && f.name !== schema.version?.field && !f.array)
    .slice(0, 2);
  const canMove = Boolean(field.permissions?.update && schema.version);

  async function move(row: Row, to: string) {
    const id = String(encodeRecordKey(schema, row));
    setMoving(id);
    try {
      const result = await provider.update<BaseRecord>(schema.name, {
        id,
        data: { [field.name]: to === NONE ? null : to },
        expectedVersion: versionOf(schema, row),
      });
      onMoved(id, result.audit);
    } catch (error) {
      if (isDataWriteError(error) && error.outcome === "unauthenticated") onSignedOut();
      onFailed(id, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setMoving(null);
    }
  }

  return (
    <div className="space-y-2" data-testid="studio-kanban">
      {ownFilter && (
        <p className="text-xs text-muted-foreground">Your filter on {field.name} is set aside here: each column shows one of its values.</p>
      )}
      {failure && !signedOut && (
        <p role="alert" className="text-sm text-destructive">
          {failure instanceof Error ? failure.message : String(failure)}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <KanbanBoard<Row>
          className="min-w-max auto-cols-[minmax(16rem,1fr)] grid-flow-col grid-cols-none md:grid-cols-none lg:grid-cols-none xl:grid-cols-none"
          columns={columns}
          getKey={(row) => String(encodeRecordKey(schema, row))}
          getItemLabel={(row) => displayText(labelField ? row[labelField] : undefined) ?? String(encodeRecordKey(schema, row))}
          onMoveItem={canMove ? move : undefined}
          emptyMessage="No rows"
          renderCard={(row) => {
            const id = String(encodeRecordKey(schema, row));
            return (
              <button
                type="button"
                onClick={() => onOpenRecord(id)}
                aria-busy={moving === id || undefined}
                className="w-full rounded-lg border bg-card p-3 pr-8 text-left text-sm shadow-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="studio-kanban-card"
              >
                <span className="block truncate font-medium">{displayText(labelField ? row[labelField] : undefined) ?? id}</span>
                {extra.map((f) => (
                  <span key={f.name} className="block truncate text-xs text-muted-foreground">
                    {f.name}: {displayText(row[f.name]) ?? "—"}
                  </span>
                ))}
              </button>
            );
          }}
          renderColumnFooter={(column) =>
            column.total !== undefined && column.total > column.items.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPages((p) => ({ ...p, [column.key]: (p[column.key] ?? 1) + 1 }))}
              >
                Load more ({(column.total - column.items.length).toLocaleString()} left)
              </Button>
            ) : null
          }
        />
      </div>
      {!canMove && (
        <p className="text-xs text-muted-foreground">
          {field.permissions?.reason ?? `Cards can't be moved: ${field.name} can't be edited here.`}
        </p>
      )}
    </div>
  );
}
