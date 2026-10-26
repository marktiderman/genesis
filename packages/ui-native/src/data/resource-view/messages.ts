// The words NativeResourceView shows. `common` matches genesis-ui's `uiMessages.common`, so a
// renderer written for one platform reads the same keys on the other. `{name}`-style placeholders
// are filled with `fill`.

export interface NativeResourceViewMessages {
  common: {
    /** Shown for an empty value. */
    empty: string;
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
  refusal: {
    /** `{noun}`. A delete failed with no message of its own. */
    deleteFailed: string;
    dismiss: string;
  };
}

export const defaultNativeResourceViewMessages: NativeResourceViewMessages = {
  common: {
    empty: "—",
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
  refusal: {
    deleteFailed: "This {noun} couldn't be deleted. Try again.",
    dismiss: "Dismiss",
  },
};

/** Fill `{name}` placeholders. A placeholder with no value is left as it is. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
