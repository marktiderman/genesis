"use client";

// How a record opens from a view (ADR 0021), in one place for every view type: the screen's
// `open`, else ResourcePage's older `detail`, else the view's own `open`, else a side peek. A peek
// draws the view's record view when it names one, else the view's columns (DetailPanel).

import type { ReactNode } from "react";
import type { DataRow, ResourceContract } from "@marktiderman/genesis-core";
import type { RecordOpen, RecordView as RecordViewDef, ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { DetailPanel } from "../DetailPanel";
import { RecordPeek } from "./RecordPeek";

type Row = Record<string, unknown>;

import { detailMode, recordOpen, type DetailMode } from "./open-modes";

export { detailMode, recordOpen, type DetailMode };

/** How a record opens here: the screen's choice first, then the view's, then a side peek. */
export function resolveRecordOpen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, any>,
  ...screen: (RecordOpen | DetailMode | undefined)[]
): RecordOpen | "none" {
  const given = screen.find((s) => s !== undefined);
  return given !== undefined ? recordOpen(given) : (view.definition.open ?? "side-peek");
}

/** The record view a peek draws: the screen's, else the one the view names. */
export function recordViewOf<T extends Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, T & DataRow>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  screen?: RecordViewDef<ResourceContract<any>, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
): RecordViewDef<ResourceContract<any>, T & DataRow> | undefined {
  return screen ?? view.definition.recordView?.();
}

/**
 * The peek a board or calendar opens: the record view when there is one, else the view's columns
 * in DetailPanel, at the edge (side peek) or centered (center peek).
 */
export function ViewRecordPeek<T extends Row>({
  view,
  recordView,
  open,
  row,
  onClose,
  fields,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, T & DataRow>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView: RecordViewDef<ResourceContract<any>, any> | undefined;
  open: RecordOpen | "none";
  row: T | null;
  onClose: () => void;
  fields: Array<{ key: string; label: string; render?: (value: unknown, item: T) => ReactNode }>;
}) {
  if (open === "none" || open === "page") return null;
  if (recordView) return <RecordPeek<T> view={recordView} row={row} open={row !== null} onClose={onClose} mode={open} />;
  return (
    <DetailPanel<T>
      item={row}
      open={row !== null}
      onClose={onClose}
      title={row ? view.summary(row as T & DataRow).title : undefined}
      subtitle={row ? view.summary(row as T & DataRow).subtitle : undefined}
      fields={fields}
      layout={open === "center-peek" ? "dialog" : "sheet"}
    />
  );
}
