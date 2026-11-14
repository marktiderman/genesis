// The record open modes (ADR 0021) beside ResourcePage's older `detail` words, with no imports, so
// ResourcePage and the view types read one mapping.

import type { RecordOpen } from "@marktiderman/genesis-core/resource-view";

/** ResourcePage's older words for the same choice. @stability Beta */
export type DetailMode = "panel" | "modal" | "route" | "none";

const TO_DETAIL: Readonly<Record<RecordOpen, Exclude<DetailMode, "none">>> = { "side-peek": "panel", "center-peek": "modal", page: "route" };
const FROM_DETAIL: Readonly<Record<Exclude<DetailMode, "none">, RecordOpen>> = { panel: "side-peek", modal: "center-peek", route: "page" };

/** A record open mode or ResourcePage's `detail`, as ResourcePage's `detail`. */
export function detailMode(open: RecordOpen | DetailMode): DetailMode {
  return open === "none" || open === "panel" || open === "modal" || open === "route" ? open : TO_DETAIL[open];
}

/** ResourcePage's `detail` or a record open mode, as a record open mode (`none` stays). */
export function recordOpen(detail: RecordOpen | DetailMode): RecordOpen | "none" {
  return detail === "none" ? "none" : detail in FROM_DETAIL ? FROM_DETAIL[detail as Exclude<DetailMode, "none">] : (detail as RecordOpen);
}

