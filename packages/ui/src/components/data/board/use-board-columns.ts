"use client";

// The data side of a board lives in core, so the web's board and the phone's load the same way (G5).
export {
  BOARD_NONE,
  BOARD_PAGE,
  boardColumnFilter,
  useBoardColumns,
  type BoardColumnData,
  type UseBoardColumnsOptions,
  type UseBoardColumnsReturn,
} from "@marktiderman/genesis-core/hooks";
