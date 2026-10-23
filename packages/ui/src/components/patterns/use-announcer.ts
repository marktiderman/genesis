"use client";

import * as React from "react";

/**
 * A polite live-region message for drag and drop (SortableList,
 * KanbanBoard). Render `message` in an `aria-live="polite"` element.
 *
 * A live region only speaks when its text changes, so the same message
 * twice in a row is told apart by a trailing no-break space.
 *
 * @internal
 */
export function useAnnouncer() {
  const [message, setMessage] = React.useState("");
  const announce = React.useCallback(
    (next: string) => setMessage((previous) => (previous === next ? `${next}\u00a0` : next)),
    [],
  );
  return { message, announce };
}
