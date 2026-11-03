"use client";

import { useState, type ReactNode } from "react";
import { titleCase, type WriteConflict } from "@marktiderman/genesis-core";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Spinner } from "../ui/spinner";
import { fillMessage, useUiMessages } from "../../messages";

/**
 * Props for {@link ConflictSheet}.
 *
 * @stability Beta
 */
export interface ConflictSheetProps {
  /** The conflict to show (`useResourceForm`'s `conflict`, or `writeConflict(error, values)`); null keeps it closed. */
  conflict: WriteConflict | null;
  /** The record's noun ("task"), for the title. */
  noun?: string;
  /** A field's label. Default: the field name, title-cased. */
  label?: (field: string) => string;
  /** A field's value as shown. Default: plain text. */
  format?: (field: string, value: unknown) => ReactNode;
  /** Save these values over theirs, at the version the conflict reported. The sheet waits for it. */
  onKeepMine: () => void | Promise<void>;
  /** Drop these values and show their row. */
  onTakeTheirs: () => void;
  /** Closed without choosing (Escape, or outside): the changes stay where they are, unsaved. */
  onDismiss: () => void;
  testID?: string;
}

function plain(value: unknown, empty: string): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{empty}</span>;
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Shown when a save met someone else's change: their value beside the one
 * this person tried to save, for each field where the two differ, theirs
 * first. "Keep mine" saves over theirs at the new version; "Take theirs"
 * drops the changes. ResourceForm, RecordView's settings sections and Data
 * Studio's record panel open it on a `conflict`.
 *
 * @stability Beta
 */
export function ConflictSheet({
  conflict,
  noun,
  label = titleCase,
  format,
  onKeepMine,
  onTakeTheirs,
  onDismiss,
  testID = "conflict-sheet",
}: ConflictSheetProps) {
  const m = useUiMessages().conflict;
  const [keeping, setKeeping] = useState(false);
  const show = (field: string, value: unknown) => (format ? format(field, value) : plain(value, m.empty));
  const fields = conflict?.fields ?? [];

  const keep = async () => {
    setKeeping(true);
    try {
      await onKeepMine();
    } finally {
      setKeeping(false);
    }
  };

  return (
    <Dialog open={conflict !== null} onOpenChange={(open) => !open && !keeping && onDismiss()}>
      <DialogContent data-testid={testID} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fillMessage(m.title, { noun: noun ?? m.record })}</DialogTitle>
          <DialogDescription>{fields.length > 0 ? m.description : m.same}</DialogDescription>
        </DialogHeader>
        {conflict && fields.length > 0 ? (
          <table className="w-full text-sm" data-testid={`${testID}-fields`}>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="pb-2 pr-3 font-medium">{m.field}</th>
                <th scope="col" className="pb-2 pr-3 font-medium">{m.theirs}</th>
                <th scope="col" className="pb-2 font-medium">{m.mine}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field} className="border-t align-top" data-testid={`${testID}-field-${field}`}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{label(field)}</th>
                  <td className="py-2 pr-3 break-words">{show(field, conflict.theirs[field])}</td>
                  <td className="py-2 break-words">{show(field, conflict.mine[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onTakeTheirs} disabled={keeping} data-testid={`${testID}-take-theirs`}>
            {m.takeTheirs}
          </Button>
          {fields.length > 0 ? (
            <Button onClick={() => void keep()} disabled={keeping} data-testid={`${testID}-keep-mine`}>
              {keeping ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {m.keepMine}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
