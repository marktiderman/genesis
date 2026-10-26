/**
 * Every word Genesis UI's data components show or announce, in English.
 * `{name}` marks a value filled in at run time; keep it in a translation.
 * Override any part through `UiMessagesProvider` (see `messages.tsx`).
 */
export const uiMessages = {
  common: {
    /** Shown for an empty value in a cell, card or peek. */
    empty: "—",
    yes: "Yes",
    no: "No",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    edit: "Edit",
    delete: "Delete",
    clear: "Clear",
    open: "Open",
    /** `{name}`: the record's title. */
    openItem: "Open {name}",
    loading: "Loading…",
    saving: "Saving",
  },
  page: {
    errorTitle: "Something went wrong",
    /** `{entity}`: the page's record name, e.g. "task". */
    errorBody: "Failed to load {entity}s. Please try again.",
    retry: "Retry",
    create: "New",
    loadMore: "Load more",
    /** `{loaded}`: rows loaded so far. */
    allLoaded: "All {loaded} loaded",
    /** Announced after Load more. `{added}`: rows the last load added; `{loaded}`: rows shown. */
    loadedMore: "Loaded {added} more. {loaded} shown.",
    /** `{shown}`, `{total}`: rows loaded and rows that exist. */
    truncated: "Showing the first {shown} of {total} records.",
    pagination: "Pagination",
    noRecords: "No records",
    /** `{from}`–`{to}`: the rows on this page; `{total}`: all rows. */
    range: "Showing {from}-{to} of {total}",
    previous: "Previous",
    next: "Next",
    /** `{page}` of `{pages}`. */
    pageOf: "Page {page} of {pages}",
    notFoundTitle: "Record not found",
    notFoundBody: "This record doesn't exist, or you don't have access to it.",
    deleteFailed: "The delete failed.",
  },
  table: {
    noRecords: "No records found",
    /** `{name}`: the row's label. */
    selectRow: "Select {name}",
    selectAll: "Select all rows",
    columns: "Columns",
    resetColumns: "Reset to defaults",
    ascending: "ascending",
    descending: "descending",
    /** A secondary sort's header label. `{header}`, `{direction}` (ascending/descending), `{n}`: its place in the sort. */
    sortedBy: "{header}, sorted {direction}, sort {n}",
    rows: "Rows:",
    noRows: "No records",
    /** `{from}`–`{to}` of `{total}`: the rows on this page. */
    range: "Showing {from}–{to} of {total}",
    /** `{page}` / `{pages}`. */
    pageOf: "{page} / {pages}",
  },
  confirmDelete: {
    title: "Delete this record?",
    recycle: "It moves to the recycle bin, where it can be restored.",
    permanent: "This can't be undone.",
  },
  detail: {
    /** The panel's name for screen readers when it has no title. */
    fallbackTitle: "Detail panel",
  },
  filters: {
    search: "Search...",
    status: "Status",
    sortBy: "Sort by...",
    views: "Views",
    /** `{count}`: saved views. */
    viewCount: "({count})",
    noViews: "No saved views yet",
    saveCurrent: "Save current view",
    clearAll: "Clear all",
    saveViewTitle: "Save Current View",
    viewNamePlaceholder: "View name (e.g. 'Active Sessions')",
  },
  bulk: {
    /** `{count}`: selected rows. */
    selected: "{count} selected",
  },
  view: {
    mode: "View mode",
    grid: "Grid view",
    table: "Table view",
    list: "List view",
    settings: "View settings",
    settingsTitle: "Display Settings",
    pageSize: "Page size",
    /** `{n}`: a page size. */
    pageSizeOption: "{n} items",
    density: "Density",
    compact: "Compact",
    comfortable: "Comfortable",
    spacious: "Spacious",
  },
  kanban: {
    noItems: "No items",
    /** The name used when a card has no label. */
    card: "Card",
    /** The same, inside a control's label ("Pick up card"). */
    cardInLabel: "card",
    /** `{name}`: the card. */
    pickUp: "Pick up {name}",
    move: "Move {name}",
    moveTo: "Move to",
    /** `{name}`, `{column}`: where it landed. */
    moved: "{name} moved to {column}.",
    moveFailed: "Couldn’t move {name}.",
    /** Keyboard pick-up. `{column}`: where it is now. */
    pickedUp:
      "{name} picked up in {column}. Use the left and right arrow keys to choose a column, Space to drop, Escape to cancel.",
    /** Touch pick-up. */
    pickedUpTouch: "{name} picked up in {column}.",
    /** `{n}` of `{count}` columns. */
    over: "Over {column}, column {n} of {count}.",
    droppedBack: "{name} dropped back in {column}.",
    cancelled: "Move cancelled. {name} stays in {column}.",
    instructions:
      "Space or Enter picks the card up. Left and right arrows, Home and End choose a column. Space or Enter drops it, Escape puts it back. Alt with an arrow moves it one column.",
  },
  sortable: {
    item: "Item",
    /** `{name}`: the item. */
    reorder: "Reorder {name}",
    move: "Move {name}",
    moveUp: "Move up",
    moveDown: "Move down",
    moveToTop: "Move to top",
    moveToBottom: "Move to bottom",
    /** `{n}` of `{total}`: the position. */
    moved: "{name} moved to position {n} of {total}.",
    moveFailed: "Couldn’t move {name}.",
    pickedUp:
      "{name} picked up, position {n} of {total}. Use the up and down arrow keys to move, Space to drop, Escape to cancel.",
    dropped: "{name} dropped at position {n} of {total}.",
    cancelled: "Move cancelled. {name} is back at position {n} of {total}.",
    instructions:
      "Space or Enter picks the item up. Up and down arrows, Home and End move it. Space or Enter drops it, Escape puts it back. Alt with an arrow moves it one step.",
  },
  workspace: {
    /** Settings section footer. */
    save: "Save changes",
    saved: "Saved",
    /** `{noun}`: the record's noun. When a save changed no rows. */
    notChanged: "This {noun} was not changed.",
    /** An action's confirm button. */
    run: "Continue",
    /** `{name}`: the action's label. When the provider can't run actions and the screen gave no `onAction`. */
    noRunner: "{name} isn't available here.",
    checks: "Checks",
    checkDone: "Done",
    checkTodo: "To do",
    notANumber: "Enter a number.",
  },
};

/** The shape a translation fills. */
export type UiMessages = typeof uiMessages;
