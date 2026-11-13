// Reordering a list: the web's SortableList and the phone's NativeSortableList move items, and
// say where they went, through these.

/** `items` with the one at `from` moved to `to` (both from 0, `to` counted after it is taken out). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T);
  return next;
}

/** Where a move by `delta` places the item at `index` in a list of `total`, kept inside it. */
export function moveTarget(index: number, delta: number, total: number): number {
  return Math.max(0, Math.min(total - 1, index + delta));
}

/**
 * The index a dragged item lands on: its start index plus how far it was dragged, in whole rows
 * (`offset` over `rowSize`), kept inside the list.
 */
export function dropIndex(start: number, offset: number, rowSize: number, total: number): number {
  if (!(rowSize > 0)) return start;
  return moveTarget(start, Math.round(offset / rowSize), total);
}

/**
 * A move's words for a screen reader, from a template with `{name}`, `{n}` (the new position,
 * from 1) and `{total}`: "Week 1 moved to position 3 of 5."
 */
export function movedAnnouncement(name: string, to: number, total: number, template = "{name} moved to position {n} of {total}."): string {
  return template.replace("{name}", name).replace("{n}", String(to + 1)).replace("{total}", String(total));
}
