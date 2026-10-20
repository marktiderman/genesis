import { useState } from "react";
import type { BulkResult } from "@marktiderman/genesis-core/provider";
import type { ResourceSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { choicesFor, parseDraft, fieldLabel } from "../values";

export interface BulkEditDialogProps {
  schema: ResourceSchema;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apply `data` to every selected row, in one transaction. */
  onApply: (data: Record<string, unknown>) => Promise<BulkResult>;
}

/** Set one field on every selected row: all of them change, or none do. */
export function BulkEditDialog({ schema, count, open, onOpenChange, onApply }: BulkEditDialogProps) {
  const fields = schema.fields.filter((f) => f.permissions?.update && !f.references);
  const [field, setField] = useState(fields[0]?.name ?? "");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = fields.find((f) => f.name === field);
  const choices = target ? choicesFor(target) : undefined;

  async function apply() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await onApply({ [target.name]: parseDraft(target, value) });
      if (outcome.ok) onOpenChange(false);
      else setResult(outcome);
    } catch (e) {
      setError(`Nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setResult(null);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="studio-bulk-edit">
        <DialogHeader>
          <DialogTitle>
            Set a field on {count} row{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>Each row is checked against the version you see. All of them change, or none do.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="studio-bulk-field">Field</Label>
            <Select value={field} onValueChange={(v) => { setField(v); setValue(""); setError(null); }}>
              <SelectTrigger id="studio-bulk-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    {fieldLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="studio-bulk-value">New value</Label>
            {choices ? (
              <Select value={value} onValueChange={(v) => { setValue(v); setError(null); }}>
                <SelectTrigger id="studio-bulk-value">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="studio-bulk-value" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} />
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 p-2 text-sm text-destructive" data-testid="studio-bulk-error">
              {error}
            </p>
          )}
          {result && !result.ok && (
            <div role="alert" className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">
              Nothing was changed: {(result.failures ?? []).length} row(s) failed.
              <ul className="mt-1 list-disc pl-5 text-xs">
                {(result.failures ?? []).slice(0, 10).map((f) => (
                  <li key={f.index}>{f.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !target} onClick={() => void apply()} testID="studio-bulk-apply">
              {busy ? "Saving…" : `Set on ${count} row${count === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
