import type { MutationMode, UndoableWrite } from "@marktiderman/genesis-core/hooks";
import { toast } from "../ui/sonner";

const DONE: Record<UndoableWrite["kind"], string> = {
  create: "Created.",
  update: "Saved.",
  delete: "Deleted.",
};

/**
 * The undo toast for an `undoable` write (core's `onUndoable`): a sonner
 * toast with an Undo button, shown for as long as the undo is offered.
 * Needs a mounted `<Toaster />`.
 */
export function showUndoToast(write: UndoableWrite): void {
  toast(DONE[write.kind], {
    duration: write.delayMs,
    action: {
      label: "Undo",
      onClick: () => {
        void write.undo().then((undone) => {
          // Sonner pauses on hover, so the button can outlive the window.
          if (!undone && write.strategy === "delay") {
            toast("Already saved. It can no longer be undone.");
          }
        });
      },
    },
  });
}

/** The default error report for writes that fail after the form has closed. */
export function showWriteErrorToast(error: Error): void {
  toast.error(error.message || "The change could not be saved.");
}

/**
 * ResourcePage's write-mode options for its `useResource`: the page's
 * `mutationMode` unless `resourceOptions` sets one, the undo toast, and an
 * error toast for a write that fails after it was shown as done.
 */
export function writeModeOptions(
  resourceOptions: { mutationMode?: MutationMode; onUndoable?: (write: UndoableWrite) => void; onError?: (error: Error) => void } | undefined,
  mutationMode: MutationMode | undefined,
): { mutationMode: MutationMode; onUndoable: (write: UndoableWrite) => void; onError?: ((error: Error) => void) | undefined } {
  const mode = resourceOptions?.mutationMode ?? mutationMode ?? "pessimistic";
  return {
    mutationMode: mode,
    onUndoable: resourceOptions?.onUndoable ?? showUndoToast,
    onError: resourceOptions?.onError ?? (mode === "pessimistic" ? undefined : showWriteErrorToast),
  };
}
