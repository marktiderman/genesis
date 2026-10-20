import { useMemo, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, keyFields, type AuditEntry, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { SheetCommitError, SheetGrid, type SheetCellChange, type SheetGridColumn } from "@marktiderman/genesis-ui/sheet-grid";
import { choicesFor, editText, fieldLabel, parseDraft } from "../values";
import { CellValue, FieldIcon } from "../grid/cells";

type Row = Record<string, unknown>;

/** Fields in grid order: the field that names a row first, as Airtable's primary field, then the table's order. */
export function gridFields(schema: ResourceSchema) {
  const primary = schema.fields.find((f) => f.name === schema.labelField);
  return primary ? [primary, ...schema.fields.filter((f) => f !== primary)] : [...schema.fields];
}

export interface SheetViewProps {
  provider: DataProvider;
  schema: ResourceSchema;
  rows: Row[];
  keys: Map<Row, string>;
  linkLabels: Map<string, Map<string, string>>;
  /** Saved rows, to put back in the list. */
  onSaved: (updates: { old: Row; next: Row; audit?: AuditEntry }[]) => void;
  onFailed: (message: string) => void;
  onUndo: () => void;
  onNotice: (message: string) => void;
  /** Fields not shown. */
  hidden?: ReadonlySet<string>;
  /** Selected row ids, and how to change them. Without these, no checkboxes. */
  selected?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  /** Open a row in the record pop-up. */
  onOpenRecord?: (id: string) => void;
  /** The number shown for the first row (pages after the first start later). */
  firstRowNumber?: number;
  /** Under the last row, e.g. "Add a record". */
  footer?: ReactNode;
  height?: number;
  /** Accessible name; defaults to the table's label. */
  label?: string;
}

/**
 * The spreadsheet view of a table (DATA-STUDIO.md P2). A paste across rows
 * is saved in ONE transaction through `updateMany`: every row changes, at
 * the version it was read, or none does, and the failing cells are marked.
 */
export function SheetView({
  provider,
  schema,
  rows,
  keys,
  linkLabels,
  onSaved,
  onFailed,
  onUndo,
  onNotice,
  hidden,
  selected,
  onToggleSelect,
  onToggleAll,
  onOpenRecord,
  firstRowNumber = 1,
  footer,
  height,
  label,
}: SheetViewProps) {
  const versionField = schema.version?.field;
  const keyNames = useMemo(() => new Set(keyFields(schema)), [schema]);
  const columns = useMemo<SheetGridColumn<Row>[]>(
    () =>
      gridFields(schema).filter((field) => !hidden?.has(field.name)).map((field, index) => {
        const labels = linkLabels.get(field.name);
        return {
          key: field.name,
          header: fieldLabel(field),
          icon: <FieldIcon field={field} isKey={keyNames.has(field.name)} />,
          // The first column names the row, so it gets more room.
          width: index === 0 && field.name === schema.labelField ? 220 : field.type === "json" ? 220 : field.type === "boolean" ? 110 : 170,
          ...(field.type === "number" && !field.enumValues ? { align: "end" as const } : {}),
          getText: (row: Row) => editText(row[field.name]),
          render: (row: Row) => (
            <CellValue field={field} value={row[field.name]} linkLabel={labels?.get(String(row[field.name]))} />
          ),
          // Links are edited in the record form, with a picker.
          editable: Boolean(field.permissions?.update) && !field.references,
          readOnlyReason: field.references && field.permissions?.update ? "Edit links in the record's form." : field.permissions?.reason,
          ...(choicesFor(field) ? { options: choicesFor(field) } : {}),
        };
      }),
    [schema, linkLabels, hidden, keyNames],
  );
  const selectable = Boolean(selected && onToggleSelect);
  const allSelected = selectable && rows.length > 0 && rows.every((row) => selected!.has(keys.get(row) ?? ""));

  async function commit(changes: SheetCellChange<Row>[]) {
    // One update per row, with every cell that changed in it.
    const byRow = new Map<string, { row: Row; data: Record<string, unknown> }>();
    for (const change of changes) {
      const field = schema.fields.find((f) => f.name === change.column)!;
      const entry = byRow.get(change.rowKey) ?? { row: change.row, data: {} };
      entry.data[change.column] = parseDraft(field, change.value);
      byRow.set(change.rowKey, entry);
    }
    const items = [...byRow.entries()];
    const expected = (row: Row) => (versionField ? (row[versionField] == null ? null : String(row[versionField])) : null);
    try {
      if (items.length === 1) {
        const [, { row, data }] = items[0]!;
        const result = await provider.update<BaseRecord>(schema.name, { id: encodeRecordKey(schema, row), data: data as never, expectedVersion: expected(row) });
        onSaved([{ old: row, next: result.data as Row, ...(result.audit ? { audit: result.audit } : {}) }]);
        return;
      }
      if (!provider.updateMany) throw new Error("This data provider can't save several rows at once.");
      const result = await provider.updateMany(schema.name, {
        changes: items.map(([, { row, data }]) => ({ id: encodeRecordKey(schema, row), data, expectedVersion: expected(row) })),
      });
      if (!result.ok) {
        const failures = result.failures ?? [];
        const cells = failures.flatMap((f) => {
          const [rowKey, { data }] = items[f.index]!;
          return Object.keys(data).map((column) => ({ rowKey, column, message: f.message }));
        });
        const message = `Nothing was saved: ${failures.length} of ${items.length} rows failed. Fix the marked cells and paste again.`;
        onFailed(message);
        throw new SheetCommitError(message, cells);
      }
      // The bulk result carries audit entries, not rows: reload the page.
      onSaved(
        items.map(([, { row, data }], i) => ({
          old: row,
          next: { ...row, ...data },
          ...(result.audit?.[i] ? { audit: result.audit[i] } : {}),
        })),
      );
      onNotice(`Saved ${result.count} rows in one transaction.`);
    } catch (error) {
      if (error instanceof SheetCommitError) throw error;
      const message = isDataWriteError(error) || error instanceof Error ? error.message : String(error);
      onFailed(message);
      throw error;
    }
  }

  return (
    <SheetGrid<Row>
      label={label ?? `${schema.label ?? schema.name} sheet`}
      rows={rows}
      columns={columns}
      getKey={(row) => keys.get(row) ?? ""}
      onCommit={commit}
      onUndo={onUndo}
      onSkipped={(count) => onNotice(`${count} read-only cell${count === 1 ? " was" : "s were"} left as they were.`)}
      height={height ?? Math.min(640, Math.max(160, (rows.length + 2) * 32 + 4))}
      className="rounded-md"
      empty="No records match."
      footer={footer}
      rowHeader={{
        width: selectable ? 84 : 64,
        header: selectable ? (
          <input
            type="checkbox"
            aria-label="Select every row on this page"
            className="h-3.5 w-3.5"
            checked={allSelected}
            onChange={() => onToggleAll?.()}
          />
        ) : null,
        render: (row, index) => {
          const id = keys.get(row) ?? "";
          return (
            <span className="flex w-full items-center gap-1.5">
              {selectable && (
                <input
                  type="checkbox"
                  aria-label={`Select row ${firstRowNumber + index}`}
                  className="h-3.5 w-3.5"
                  checked={selected!.has(id)}
                  onChange={() => onToggleSelect!(id)}
                  data-testid="studio-row-select"
                />
              )}
              <span className="min-w-[1.5rem] tabular-nums">{firstRowNumber + index}</span>
              {onOpenRecord && id && (
                <button
                  type="button"
                  className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
                  aria-label={`Open row ${firstRowNumber + index}`}
                  title="Open record"
                  onClick={() => onOpenRecord(id)}
                  data-testid="studio-open-record"
                >
                  <Maximize2 className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          );
        },
      }}
    />
  );
}
