"use client";

import * as React from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

/** One release note: what changed, a line about it, and a link to more. */
export interface WhatsNewNote {
  key: string;
  title: string;
  body?: string | undefined;
  url?: string | undefined;
}

export interface WhatsNewSheetProps<N extends WhatsNewNote = WhatsNewNote> {
  /** The notes; with none, nothing is shown. */
  notes: readonly N[];
  /** Mark the notes seen and close (genesis-native's `useWhatsNew().dismiss`, or your own). */
  dismiss: () => void;
  /** Opens a note's `url`. Without it, notes show no Learn more. */
  onOpenNote?: ((note: N) => void) | undefined;
  title?: string | undefined;
  /** A line under the title, for screen readers and sighted people alike. */
  description?: string | undefined;
  doneLabel?: string | undefined;
  learnMoreLabel?: string | undefined;
  testID?: string | undefined;
}

/**
 * WhatsNewSheet — a release's notes after an update, in a dialog: the twin of genesis-ui-native's
 * NativeWhatsNewSheet, with the same `notes`, `dismiss`, `onOpenNote` and labels. On a phone-width
 * screen it rises as a sheet (`mobileLayout="sheet"`). Closing it in any way (Got it, Escape, the
 * overlay) dismisses the notes, and Learn more dismisses them before opening the note.
 *
 * @stability Beta
 */
export function WhatsNewSheet<N extends WhatsNewNote = WhatsNewNote>({
  notes,
  dismiss,
  onOpenNote,
  title = "What's new",
  description,
  doneLabel = "Got it",
  learnMoreLabel = "Learn more",
  testID = "whats-new",
}: WhatsNewSheetProps<N>) {
  return (
    <Dialog open={notes.length > 0} onOpenChange={(open) => (open ? undefined : dismiss())}>
      <DialogContent mobileLayout="sheet" data-testid={testID} className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>{description ?? `${notes.length} new`}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-4">
          {notes.map((note) => (
            <li key={note.key} data-testid={`${testID}-${note.key}`} className="flex flex-col gap-1">
              <p className="text-sm font-medium">{note.title}</p>
              {note.body ? <p className="text-sm text-muted-foreground">{note.body}</p> : null}
              {note.url && onOpenNote ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto self-start p-0"
                  testID={`${testID}-open-${note.key}`}
                  onClick={() => {
                    dismiss();
                    onOpenNote(note);
                  }}
                >
                  {learnMoreLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={dismiss} testID={`${testID}-done`} className="w-full sm:w-auto">
            {doneLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
