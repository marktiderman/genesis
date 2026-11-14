// The words NativeResourceView shows. `common` matches genesis-ui's `uiMessages.common`, so a
// renderer written for one platform reads the same keys on the other. `{name}`-style placeholders
// are filled with `fill`.

export interface NativeResourceViewMessages {
  common: {
    /** Shown for an empty value. */
    empty: string;
    /**
     * A link whose row this viewer can't see, or that's gone (never its raw id). Optional, so a
     * catalogue written before it still fits; the English is used when it's missing.
     */
    hiddenLink?: string;
    yes: string;
    no: string;
    cancel: string;
    save: string;
    edit: string;
    close: string;
    /** "New {noun}". */
    create: string;
    /** "Edit {noun}". */
    editTitle: string;
    /** "Search {nounPlural}". */
    search: string;
  };
  delete: {
    /** The action when a delete removes the row for good. */
    action: string;
    /** `{name}`: the row's title. */
    confirmTitle: string;
    confirmBody: string;
  };
  bin: {
    /** The action when the provider moves deleted rows to a recycle bin (`softDelete`). */
    action: string;
    confirmTitle: string;
    confirmBody: string;
  };
  list: {
    /** `{nounPlural}`. */
    emptyTitle: string;
    emptyBody: string;
    noResultsTitle: string;
    noResultsBody: string;
    loadingMore: string;
    /** `{nounPlural}`. */
    loadFailed: string;
    retry: string;
    /** A section for rows with no value in the group field. `{label}`: the field. */
    noGroup: string;
  };
  form: {
    /** `{label}`. */
    required: string;
    /** `{label}`, `{max}`. */
    tooLong: string;
    /** `{noun}`. A save failed with no message of its own. */
    saveFailed: string;
    /** An empty day field's button. */
    pickDate: string;
    /** An empty date-and-time field's button. */
    pickDateTime: string;
    /** Empties an optional date. `{label}`. */
    clear: string;
    loading: string;
  };
  /**
   * A link's picker in the form sheet. Optional, so a catalogue written before it still fits; the
   * English is used for what's missing.
   */
  link?: {
    /** The picker with nothing chosen. */
    placeholder?: string;
    search?: string;
    /** The choice that empties an optional link. */
    none?: string;
    noResults?: string;
    loadMore?: string;
    loadFailed?: string;
    /** A row whose name is empty (never its raw id). */
    untitled?: string;
  };
  refusal: {
    /** `{noun}`. A delete failed with no message of its own. */
    deleteFailed: string;
    dismiss: string;
  };
  /**
   * A list's segments, declared filters, view types, board and calendar (ADR 0017). Optional, so
   * a catalogue written before it still fits; the English is used for what's missing.
   */
  lists?: Partial<NativeListMessages>;
}

/** The words of a list's controls, board and calendar on the phone. @stability Beta */
export interface NativeListMessages {
  segments: string;
  filters: string;
  /** `{count}`: declared filters set. */
  filtersSet: string;
  clear: string;
  done: string;
  from: string;
  to: string;
  /** The view types, by name. */
  types: Readonly<Record<string, string>>;
  /** The switcher's accessible name. */
  type: string;
  /** Board: the column of rows with no value. */
  noValue: string;
  /** A card the screen won't let this viewer move. */
  notAllowed: string;
  /** `{name}`: a card whose last move is still saving. */
  stillSaving: string;
  /** `{noun}`: a move that matched no row. */
  notChanged: string;
  /** `{name}`: a move that failed with no words of its own. */
  moveFailed: string;
  /** `{column}`: a card's move, in its menu. */
  moveTo: string;
  loadMore: string;
  today: string;
  previous: string;
  next: string;
  agenda: string;
  month: string;
  noEvents: string;
  allDay: string;
  /** `{count}`: rows the calendar's limit left out. */
  more: string;
}

export const defaultNativeListMessages: NativeListMessages = {
  segments: "Segments",
  filters: "Filters",
  filtersSet: "Filters ({count})",
  clear: "Clear",
  done: "Done",
  from: "From",
  to: "To",
  types: { list: "List", table: "List", grid: "Grid", gallery: "Gallery", inbox: "Inbox", board: "Board", calendar: "Calendar" },
  type: "View",
  noValue: "No value",
  notAllowed: "You can't move this card.",
  stillSaving: "{name} is still moving. Try again in a moment.",
  notChanged: "This {noun} was not changed.",
  moveFailed: "Couldn’t move {name}.",
  moveTo: "Move to {column}",
  loadMore: "Load more",
  today: "Today",
  previous: "Previous",
  next: "Next",
  agenda: "Agenda",
  month: "Month",
  noEvents: "Nothing on this day",
  allDay: "All day",
  more: "{count} more not shown",
};

export const defaultNativeResourceViewMessages: NativeResourceViewMessages = {
  common: {
    empty: "—",
    hiddenLink: "Not available",
    yes: "Yes",
    no: "No",
    cancel: "Cancel",
    save: "Save",
    edit: "Edit",
    close: "Close",
    create: "New {noun}",
    editTitle: "Edit {noun}",
    search: "Search {nounPlural}",
  },
  delete: {
    action: "Delete",
    confirmTitle: "Delete “{name}”?",
    confirmBody: "This can't be undone.",
  },
  bin: {
    action: "Move to Bin",
    confirmTitle: "Move “{name}” to the bin?",
    confirmBody: "You can restore it from the bin.",
  },
  list: {
    emptyTitle: "No {nounPlural} yet",
    emptyBody: "When there are some, they show up here.",
    noResultsTitle: "No results",
    noResultsBody: "Try a different search.",
    loadingMore: "Loading more",
    loadFailed: "These {nounPlural} couldn't be loaded.",
    retry: "Try again",
    noGroup: "No {label}",
  },
  form: {
    required: "{label} is required.",
    tooLong: "{label} can be at most {max} characters.",
    saveFailed: "This {noun} couldn't be saved. Try again.",
    pickDate: "Add a date",
    pickDateTime: "Add a date and time",
    clear: "Clear {label}",
    loading: "Loading",
  },
  link: {
    placeholder: "Choose…",
    search: "Search",
    none: "None",
    noResults: "No matches",
    loadMore: "Show more",
    loadFailed: "Couldn't load the choices.",
    untitled: "Untitled",
  },
  refusal: {
    deleteFailed: "This {noun} couldn't be deleted. Try again.",
    dismiss: "Dismiss",
  },
};

/** Fill `{name}` placeholders. A placeholder with no value is left as it is. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
