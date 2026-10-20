import { useMemo } from "react";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import { encodeRecordKey, isDataWriteError, type AuditEntry, type ResourceSchema } from "@marktiderman/genesis-core/schema";
import { SheetCommitError, SheetGrid, type SheetCellChange, type SheetGridColumn } from "@marktiderman/genesis-ui/sheet-grid";
import { choicesFor, displayText, editText, parseDraft } from "../values";

type Row = Record<string, unknown>;

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
}

/**
 * The spreadsheet view of a table (DATA-STUDIO.md P2). A paste across rows
 * is saved in ONE transaction through `updateMany`: every row changes, at
 * the version it was read, or none does, and the failing cells are marked.
 */
export function SheetView({ provider, schema, rows, keys, linkLabels, onSaved, onFailed, onUndo, onNotice }: SheetViewProps) {
  const versionField = schema.version?.field;
  const columns = useMemo<SheetGridColumn<Row>[]>(
    () =>
      schema.fields.map((field) => {
        const labels = linkLabels.get(field.name);
        return {
          key: field.name,
          header: field.name,
          width: field.type === "json" ? 220 : field.name.length > 14 ? 180 : 150,
          getText: (row: Row) => editText(row[field.name]),
          ...(labels
            ? { render: (row: Row) => labels.get(String(row[field.name])) ?? displayText(row[field.name]) ?? "" }
            : {}),
          // Links are edited in the record form, with a picker.
          editable: Boolean(field.permissions?.update) && !field.references,
          readOnlyReason: field.references && field.permissions?.update ? "Edit links in the record's form." : field.permissions?.reason,
          ...(choicesFor(field) ? { options: choicesFor(field) } : {}),
        };
      }),
    [schema, linkLabels],
  );

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
      label={`${schema.label ?? schema.name} sheet`}
      rows={rows}
      columns={columns}
      getKey={(row) => keys.get(row) ?? ""}
      onCommit={commit}
      onUndo={onUndo}
      onSkipped={(count) => onNotice(`${count} read-only cell${count === 1 ? " was" : "s were"} left as they were.`)}
      height={520}
    />
  );
}
