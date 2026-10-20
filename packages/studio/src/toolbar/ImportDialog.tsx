import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import type { BulkResult, DataProvider } from "@marktiderman/genesis-core/provider";
import type { ResourceSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { parseCsv } from "../lib/csv";
import { fieldLabel } from "../values";

const SKIP = "__genesis_skip__";

export interface ImportDialogProps {
  provider: DataProvider;
  schema: ResourceSchema;
  onImported: (count: number) => void;
}

/**
 * CSV import (DATA-STUDIO.md P2): map the file's columns to fields, check
 * every row against the database with a dry run, then add them all in one
 * transaction. Nothing is coerced or dropped: a value that won't convert is
 * listed, with the database's reason, before anything is kept.
 */
export function ImportDialog({ provider, schema, onImported }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [check, setCheck] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = useMemo(() => schema.fields.filter((f) => schema.createFields?.includes(f.name)), [schema]);
  const allowed = Boolean(schema.access.create && provider.importRows);

  async function readFile(input: File) {
    const parsed = parseCsv(await input.text());
    setFile({ name: input.name, ...parsed });
    // Match columns to fields by name, case-insensitively.
    const auto: Record<number, string> = {};
    parsed.header.forEach((h, i) => {
      const field = targets.find((f) => f.name.toLowerCase() === h.toLowerCase());
      if (field) auto[i] = field.name;
    });
    setMapping(auto);
    setCheck(null);
    setError(null);
  }

  function rowsToSend() {
    if (!file) return [];
    return file.rows.map((cells) => {
      const row: Record<string, unknown> = {};
      for (const [index, field] of Object.entries(mapping)) {
        if (field === SKIP) continue;
        const value = cells[Number(index)] ?? "";
        // An empty cell leaves the field to its default (or null).
        if (value !== "") row[field] = value;
      }
      return row;
    });
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await provider.importRows!(schema.name, { rows: rowsToSend(), dryRun });
      if (dryRun) setCheck(result);
      else if (result.ok) {
        onImported(result.count);
        setOpen(false);
        setFile(null);
        setCheck(null);
      } else setCheck(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const mapped = Object.values(mapping).filter((f) => f && f !== SKIP).length;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!allowed}
        title={allowed ? "Import CSV" : schema.access.reasons?.create ?? "This data provider can't import."}
        testID="studio-import"
        aria-label="Import CSV"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="studio-import-dialog">
          <DialogHeader>
            <DialogTitle>Import into {schema.label ?? schema.name}</DialogTitle>
            <DialogDescription>
              Every row is checked against the database first. The import then adds all of them in one transaction, or none.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="studio-import-file">CSV file, with a header row</Label>
              <input
                id="studio-import-file"
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm"
                onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])}
                data-testid="studio-import-file"
              />
            </div>
            {file && (
              <>
                <p className="text-xs text-muted-foreground">
                  {file.name}: {file.rows.length} rows, {file.header.length} columns.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {file.header.map((column, i) => (
                    <div key={`${column}-${i}`} className="flex items-center gap-2">
                      <span className="w-32 truncate font-mono text-xs" title={column}>
                        {column || `(column ${i + 1})`}
                      </span>
                      <Select value={mapping[i] ?? SKIP} onValueChange={(v) => {
                          setMapping((m) => ({ ...m, [i]: v }));
                          // A new mapping hasn't been checked: run the dry run again before importing.
                          setCheck(null);
                        }}>
                        <SelectTrigger className="h-8 flex-1 text-xs" aria-label={`Field for ${column}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>Skip this column</SelectItem>
                          {targets.map((f) => (
                            <SelectItem key={f.name} value={f.name}>
                              {fieldLabel(f)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {check && (
                  <div className="rounded-md border p-3 text-sm" role="status" data-testid="studio-import-check">
                    {check.ok ? (
                      <p>All {check.count} rows are ready to import.</p>
                    ) : (
                      <>
                        <p className="font-medium text-destructive">
                          {(check.failures ?? []).length} of {file.rows.length} rows won't import. Nothing was changed.
                        </p>
                        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
                          {(check.failures ?? []).map((f) => (
                            <li key={f.index}>
                              Row {f.index + 2}: {f.message}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy || mapped === 0} onClick={() => void run(true)} testID="studio-import-check-button">
                    {busy ? "Checking…" : "Check rows"}
                  </Button>
                  <Button type="button" disabled={busy || !check?.ok} onClick={() => void run(false)} testID="studio-import-commit">
                    Import {check?.ok ? check.count : ""} rows
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
