"use client";

// useViewBoard: a board's data and its moves, from a view (ADR 0019). The logic is core's
// (useViewBoard in genesis-core/hooks), shared with the phone's board; this gives it the web's
// words and toasts a conflict that came back after the board was gone.

import { useMemo } from "react";
import { useViewBoard as useCoreViewBoard, type UseViewBoardOptions as CoreOptions, type ViewBoardState } from "@marktiderman/genesis-core/hooks";
import type { DataRow, ResourceContract } from "@marktiderman/genesis-core";
import type { ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { fillMessage, useUiMessages } from "../../../messages";
import { showWriteErrorToast } from "../undo-toast";

export type { ViewBoardColumn, ViewBoardConflict, ViewBoardState } from "@marktiderman/genesis-core/hooks";

type Row = Record<string, unknown>;

/** @stability Beta */
export type UseViewBoardOptions<T extends Row = Row> = Omit<CoreOptions<T>, "words" | "onLostConflict">;

/**
 * A view's rows as board columns, with moves:
 *
 * ```tsx
 * const board = useViewBoard(tasksView, { filters: useViewListParams({ view: tasksView }).filters });
 * board.columns.map((c) => <Lane key={c.value} title={c.label} cards={c.items} onDrop={(row) => board.move(row, c.value)} />);
 * ```
 *
 * Throws when the view has no board field and the options name none, or names one a board can't
 * use (a field without choices).
 *
 * @stability Beta
 */
export function useViewBoard<T extends Row = Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>,
  options: UseViewBoardOptions<T> = {},
): ViewBoardState<T> {
  const m = useUiMessages();
  const words = useMemo(
    () => ({
      notAllowed: m.board.notAllowed,
      noValue: m.board.noValue,
      stillSaving: (name: string) => fillMessage(m.board.stillSaving, { name }),
      notChanged: (noun: string) => fillMessage(m.workspace.notChanged, { noun }),
      moveFailed: (name: string) => fillMessage(m.kanban.moveFailed, { name }),
    }),
    [m],
  );
  return useCoreViewBoard<T>(view, { ...options, words, onLostConflict: (error) => showWriteErrorToast(error as Error) });
}
