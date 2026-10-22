"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Spinner } from "../ui/spinner";

/**
 * Props for {@link ConfirmDeleteDialog}.
 *
 * @stability Beta
 */
export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Runs the delete. The dialog stays open while it is pending, closes when
   * it resolves, and shows the error's message (staying open, so the user
   * can retry or cancel) when it rejects.
   */
  onConfirm: () => void | Promise<void>;
  /**
   * The delete moves the record to a recycle bin rather than removing it
   * (a provider's `softDelete` capability). The default description then
   * says so instead of "This can't be undone."
   */
  softDelete?: boolean;
  /** Singular noun for the default copy, e.g. "project". Default "record". */
  noun?: string;
  /** Default "Delete this {noun}?". */
  title?: string;
  /**
   * Default "This can't be undone.", or "The {noun} moves to the recycle
   * bin." for a `softDelete`.
   */
  description?: ReactNode;
  /** Default "Delete". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
}

/**
 * The confirm step in front of a destructive delete: an `AlertDialog` (Radix
 * owns focus trap, Escape and focus return), a pending state, and the
 * failure shown in place rather than swallowed. `ResourcePage` renders it
 * for `allowDelete` / `confirmDelete`, as its `deleteDialog` slot.
 *
 * @stability Beta
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  softDelete = false,
  noun = "record",
  title = `Delete this ${noun}?`,
  description = softDelete
    ? `The ${noun} moves to the recycle bin.`
    : "This can't be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
}: ConfirmDeleteDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh open starts clean — last attempt's error is not this attempt's.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      // Escape / Cancel mid-delete would hide a request that is still
      // running; hold the dialog until it settles.
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent data-testid="confirm-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div
            role="alert"
            data-testid="confirm-delete-error"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} data-testid="confirm-delete-cancel">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            data-testid="confirm-delete-confirm"
            onClick={(e) => {
              // Radix closes on Action click; keep it open until the delete
              // settles so a failure has somewhere to show.
              e.preventDefault();
              void confirm();
            }}
          >
            {pending ? <Spinner size="sm" className="mr-2" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
