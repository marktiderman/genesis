import { useEffect, useMemo, useState } from "react";
import type { BaseRecord, DataProvider, FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, type AuditEntry, type FieldSchema, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { BOARD_NONE, BOARD_PAGE, KanbanBoard, useBoardColumns, type KanbanColumn } from "@marktiderman/genesis-ui/data";
import { choicesFor, displayText, fieldLabel } from "../values";

type Row = Record<string, unknown>;

/** Cards per column page. */
export const KANBAN_PAGE = BOARD_PAGE;
const NONE = BOARD_NONE;

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
  const [moving, setMoving] = useState<string | null>(null);
  // The same loader ResourceView's board uses, keyed under studio's session so a sign-out drops it.
  const board = useBoardColumns<BaseRecord>({
    provider,
    resource: schema.name,
    field: field.name,
    values,
    filters,
    sorts,
    ...(search ? { search: { query: search, fields: [] } } : {}),
    perPage: KANBAN_PAGE,
    retry: false,
    getKey: (row) => String(encodeRecordKey(schema, row)),
    queryKey: (request, column) => ["genesis-studio", sessionKey, "list", schema.name, "kanban", field.name, column.value, column.page, request],
  });

  const failure = board.error;
  const signedOut = Boolean(failure && isDataWriteError(failure) && failure.outcome === "unauthenticated");
  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);
  // A filter on the board's own field is replaced by each column's value.
  const ownFilter = board.ownFilterSetAside;

  const columns: KanbanColumn<Row>[] = board.columns.map((c) => ({
    key: c.value,
    label: c.value === NONE ? "No value" : c.value,
    items: c.items as Row[],
    ...(c.total !== undefined ? { total: c.total } : {}),
  }));

  const labelField = schema.labelField;
  // A card's subtitle: the next two fields a person would read, not keys,
  // links, ids or the version.
  const keyNames = new Set(typeof schema.key === "string" ? [schema.key] : schema.key);
  const extra = schema.fields
    .filter(
      (f) =>
        f.name !== labelField &&
        f.name !== field.name &&
        f.name !== schema.version?.field &&
        !keyNames.has(f.name) &&
        !f.references &&
        !f.array &&
        f.type !== "json" &&
        f.dbType !== "uuid",
    )
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
      {failure != null && !signedOut ? (
        <p role="alert" className="text-sm text-destructive">
          {failure instanceof Error ? failure.message : String(failure)}
        </p>
      ) : null}
      <div>
        <KanbanBoard<Row>
          className="grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] md:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
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
                    {fieldLabel(f)}: {displayText(row[f.name]) ?? "—"}
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
                onClick={() => board.loadMore(column.key)}
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
