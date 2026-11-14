"use client";

// RecordPeek (ADR 0021): a record page opened over a view, as a side peek (a panel at the edge,
// the list still beside it) or a center peek (a dialog). It draws the view's record view
// (`RecordView presentation="peek"`), the same page a full-page route draws, so a record looks
// the same however it was opened.

import type { ComponentProps, ReactNode } from "react";
import type { DataRow, ResourceContract } from "@marktiderman/genesis-core";
import type { RecordOpen, RecordView as RecordViewDef } from "@marktiderman/genesis-core/resource-view";
import { cn } from "../../../utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../ui/sheet";
import type { DetailPanel } from "../DetailPanel";
import { RecordView, type RecordViewProps } from "./RecordView";

type Row = Record<string, unknown>;

/** @stability Beta */
export interface RecordPeekProps<T extends Row = Row> extends Omit<RecordViewProps<T>, "row" | "presentation" | "sectionHref" | "view"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: RecordViewDef<ResourceContract<any>, T & DataRow>;
  /** The record, or null while none is open. */
  row: T | null;
  open: boolean;
  onClose: () => void;
  /** `side-peek` (default) or `center-peek`. A full `page` is the app's route, not a peek. */
  mode?: Exclude<RecordOpen, "page">;
  /** A side peek's width. Default `md`. */
  width?: "sm" | "md" | "lg";
  /** Above the record page, inside the peek (a link to the full page, say). */
  header?: ReactNode;
}

const SIDE_WIDTH = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" } as const;
const CENTER_WIDTH = { sm: "sm:max-w-lg", md: "sm:max-w-2xl", lg: "sm:max-w-4xl" } as const;

/**
 * A record page in a peek: the view's record view, drawn inline in a sheet at the edge
 * (`side-peek`) or a centered dialog (`center-peek`).
 *
 * ```tsx
 * <RecordPeek view={brandRecordView} row={open} open={open !== null} onClose={() => setOpen(null)} mode="center-peek" />
 * ```
 *
 * `<ResourceView>`, the board and the calendar open one by themselves when the view names its
 * record view (`defineView(…, { recordView: (): AnyRecordView => brandRecordView })`).
 *
 * @stability Beta
 */
export function RecordPeek<T extends Row = Row>({ view, row, open, onClose, mode = "side-peek", width = "md", header, testID = "record-peek", ...rest }: RecordPeekProps<T>) {
  const shown = open && row !== null;
  const title = row ? view.view.summary(row as T & DataRow).title : "";
  const body = row ? (
    <div className="space-y-4">
      {header}
      <RecordView<T> {...rest} view={view} row={row} presentation="peek" testID={`${testID}-page`} />
    </div>
  ) : null;
  if (mode === "center-peek") {
    return (
      <Dialog open={shown} onOpenChange={(next) => (next ? undefined : onClose())}>
        <DialogContent data-open={mode} className={cn("max-h-[90dvh] overflow-y-auto", CENTER_WIDTH[width])} data-testid={testID}>
          <span data-slot="record-peek" data-open={mode} className="contents">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
            {body}
          </span>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={shown} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side="right" className={cn("w-full overflow-y-auto", SIDE_WIDTH[width])} data-testid={testID}>
        <span data-slot="record-peek" data-open={mode} className="contents">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
          {body}
        </span>
      </SheetContent>
    </Sheet>
  );
}

type DetailProps<T extends Row> = ComponentProps<typeof DetailPanel<T>>;

/**
 * A ResourcePage `detail` slot that opens the record view instead of the view's columns: the
 * panel layout is a side peek, the modal one a center peek.
 */
export function recordPeekSlot<T extends Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView: RecordViewDef<ResourceContract<any>, T & DataRow>,
) {
  function ResourceRecordPeek(props: DetailProps<T>) {
    return (
      <RecordPeek<T>
        view={recordView}
        row={props.item}
        open={props.open}
        onClose={props.onClose}
        mode={props.layout === "dialog" ? "center-peek" : "side-peek"}
        {...(props.width ? { width: props.width } : {})}
      />
    );
  }
  return ResourceRecordPeek;
}
