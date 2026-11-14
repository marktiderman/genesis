/**
 * Every word Genesis UI's data components show or announce, in English.
 * `{name}` marks a value filled in at run time; keep it in a translation.
 * Override any part through `UiMessagesProvider` (see `messages.tsx`).
 */
export const uiMessages = {
  common: {
    /** Shown for an empty value in a cell, card or peek. */
    empty: "—",
    /** A link whose row this viewer can't see, or that's gone (never its raw id). */
    hiddenLink: "Not available",
    /** A row whose name is empty, in a list or picker (never its raw id). */
    untitled: "Untitled",
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
  /**
   * Relative times (`relativeTime`): `{n}` is a count. Hours, days and dates are Intl's words in
   * `locale`; a translation sets its own.
   */
  time: {
    /** The language Intl formats hours, days and dates in. */
    locale: "en",
    justNow: "just now",
    minutesAgo: "{n} min ago",
    inMinutes: "in {n} min",
    /** The compact style (an inbox). */
    now: "now",
    minutesShort: "{n}m",
    yesterday: "Yesterday",
  },
  page: {
    errorTitle: "Something went wrong",
    /** `{entity}`: the page's record name, e.g. "task". */
    errorBody: "Failed to load {entity}s. Please try again.",
    retry: "Retry",
    create: "New",
    /** The count beside the title. `{count}`: rows; `{noun}`, `{nouns}`: the record's name, one and several. */
    countOne: "{count} {noun}",
    countOther: "{count} {nouns}",
    /** When a filter or search is on. `{count}`: rows that match; `{total}`: all rows. */
    countFiltered: "{count} of {total}",
    /** A card the screen's own guard won't let this viewer move. */
    notAllowed: "You can't move this card.",
    /** `{name}`: a card whose last move is still saving. */
    stillSaving: "{name} is still moving. Try again in a moment.",
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
    /** A pager's buttons as their accessible names (`pagerJumps`). */
    first: "First page",
    last: "Last page",
    previousPage: "Previous page",
    nextPage: "Next page",
    /** `{page}` of `{pages}`. */
    pageOf: "Page {page} of {pages}",
    notFoundTitle: "Record not found",
    notFoundBody: "This record doesn't exist, or you don't have access to it.",
    deleteFailed: "The delete failed.",
  },
  /** A link's picker in a form (RelationField). */
  link: {
    /** The closed picker with nothing chosen. */
    placeholder: "Choose…",
    search: "Search…",
    /** The choice that empties an optional link. */
    none: "None",
    noResults: "No matches",
    loadMore: "Show more",
    loadFailed: "Couldn't load the choices.",
    createNew: "Create new…",
    /** Read after the chosen row in the open list, for a screen reader. */
    selected: "selected",
  },
  form: {
    /** `{noun}`: the record's name, e.g. "goal". */
    createTitle: "New {noun}",
    editTitle: "Edit {noun}",
    createDescription: "Fill in the details to create a new {noun}.",
    editDescription: "Update the {noun}.",
    /** ResourcePage `createdToast`. `{name}`: the new record's title. */
    created: "Created {name}",
    /** `createdToast` for a record with no title. `{noun}`: the record's name. */
    createdUnnamed: "Created the {noun}",
  },
  table: {
    noRecords: "No records found",
    /** `{name}`: the row's label. */
    selectRow: "Select {name}",
    /** Tree mode's toggle. `{name}`: the row's label. */
    expandRow: "Expand {name}",
    collapseRow: "Collapse {name}",
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
    /** A group's count when only some of its rows are loaded (server paging). `{count}`: rows loaded. */
    groupCountLoaded: "{count} loaded",
    /** The row menu's button. `{name}`: the row's label. */
    rowActions: "Actions for {name}",
    /** The footer row's label for a list's totals. */
    totals: "Total",
    /** The footer's label when its totals cover only the rows loaded (server paging). */
    totalsLoaded: "Total of loaded rows",
    /** After a group's totals when they cover only its rows loaded. */
    loadedOnly: "(loaded rows)",
    /** A row menu's Edit or Delete the screen doesn't allow on this row, with no reason of its own. */
    notAllowed: "Not allowed for this row",
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
    /** The sort menu's accessible name. */
    sort: "Sort",
    /** The button that empties the search box. */
    clearSearch: "Clear search",
    views: "Views",
    /** `{count}`: saved views. */
    viewCount: "({count})",
    noViews: "No saved views yet",
    saveCurrent: "Save current view",
    clearAll: "Clear all",
    saveViewTitle: "Save Current View",
    viewNamePlaceholder: "View name (e.g. 'Active Sessions')",
    /** The declared filters' button and sheet title (ADR 0017). */
    filters: "Filters",
    /** A range filter's ends. */
    from: "From",
    to: "To",
    /** The segments' accessible name. */
    segments: "Segments",
    /** `{label}`: a segment's label; `{count}`: its rows. */
    segmentCount: "{label}, {count}",
    /** Saved view scopes. */
    personal: "Only me",
    team: "My team",
    /** Shown when the saved-view store can't be reached. */
    viewsFailed: "Saved views couldn't be loaded.",
  },
  bulk: {
    /** A batch the page stopped because the list moved to another resource while it ran. */
    resourceChanged: "The list changed before these were deleted, so they were left as they were.",
    /** `{count}`: selected rows. */
    selected: "{count} selected",
    /** After a full page is selected. `{total}`: every row the list's filters match. */
    selectAllMatching: "Select all {total} matching",
    /** Every matching row is selected. `{total}`: their count. */
    allMatching: "All {total} matching selected",
    /** A bulk action that takes the loaded rows only, while every matching row is selected. `{count}`: the rows loaded. */
    loadedOnly: "Works on loaded rows only: select the {count} on this page instead of all matching",
    /** The confirm step of a bulk Delete. `{count}`: rows to delete. */
    deleteTitle: "Delete {count} records?",
    /** A bulk action finished. `{done}`: rows changed; `{label}`: the action. */
    done: "{label}: {done} done",
    /** Rows a bulk action skipped. `{count}`: how many; `{reason}`: the first refusal's words. */
    skipped: "{count} skipped: {reason}",
    /** A bulk action no selected row allows. `{reason}`: the refusal. */
    noneAllowed: "None of the selected rows allows this: {reason}",
  },
  /** A view drawn as an inbox (`type="inbox"`). */
  inbox: {
    /** The rail's section of the view's segments. */
    views: "Views",
    /** The rail's section of saved views. */
    saved: "Saved",
    /** The search box over the list. */
    search: "Search",
    /** The reading pane with nothing open. */
    pickTitle: "Nothing open",
    pickBody: "Pick one from the list to read it here.",
    /** The open record is gone or hidden from this viewer. */
    goneTitle: "Not available",
    goneBody: "It may have been deleted, or it isn't shared with you.",
    back: "Back",
    details: "Details",
  },
  /** A view as a spreadsheet (`type="sheet"`). */
  sheet: {
    /** The grid's accessible name. `{title}`: the view's title. */
    label: "{title} sheet",
    /** A column the view doesn't let anyone write. */
    readOnly: "Read-only",
    /** `{count}`: cells a paste left as they were (read-only, or the row refuses changes). */
    skipped: "{count} read-only cells were left as they were.",
    /** `{count}`: cells that weren't saved; each is marked with its reason. */
    failed: "{count} cells weren't saved. Each is marked with its reason.",
    saveFailed: "This change couldn't be saved.",
    /** A change still waiting to save when the sheet showed another list: it wasn't sent there. */
    moved: "Not saved: the sheet moved to another list before this change went out.",
    notNumber: "That isn't a number.",
    notJson: "That isn't valid JSON.",
    /** A yes/no cell takes true or false (yes or no, 1 or 0). */
    notBoolean: "That isn't true or false.",
    undo: "Undo last change",
    undone: "Undone.",
    nothingToUndo: "Nothing to undo.",
    previous: "Previous",
    next: "Next",
    /** `{page}` of `{pages}`. */
    page: "Page {page} of {pages}",
  },
  /** CSV export from a list (ADR 0017 §8). */
  export: {
    action: "Export CSV",
    /** `{rows}`: rows written. */
    done: "Exported {rows} rows",
    /** `{rows}`: rows written before the cap. */
    truncated: "Exported the first {rows} rows; narrow the list to export the rest",
    failed: "The export didn't finish",
    /** The page searches several fields on top of the list's own search: no one query says both. */
    searchNotExportable: "This search can't be exported as it stands: search one field, or clear the search, then export",
  },
  view: {
    mode: "View mode",
    /** The view-type switcher's accessible name (ADR 0017). */
    type: "View type",
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
  board: {
    /** The column for rows whose field is empty. */
    noValue: "No value",
    /** `{field}`: a filter on the board's own field, which each column replaces with its value. */
    ownFilterSetAside: "Your filter on {field} is set aside here: each column shows one of its values.",
    /** A card the screen's own guard won't let this viewer move. */
    notAllowed: "You can't move this card.",
    /** `{name}`: a card whose last move is still saving. */
    stillSaving: "{name} is still moving. Try again in a moment.",
    loadMore: "Load more",
    /** `{count}`: cards in the column not loaded yet. */
    loadMoreLeft: "Load more ({count} left)",
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
    /** A column's count against its work-in-progress limit, read out. */
    countOfLimit: "{count} of {limit}",
    /** A column holding more than its limit. */
    overLimit: "Over limit of {limit}",
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
  calendar: {
    previousMonth: "Previous month",
    nextMonth: "Next month",
    previousWeeks: "Previous weeks",
    nextWeeks: "Next weeks",
    today: "Today",
    /** A day with nothing on it (agenda and lanes). */
    nothing: "Nothing scheduled",
    allDay: "All day",
    /** The last day of a timed event that began on an earlier day. `{time}`: when it ends. */
    until: "until {time}",
    /** A day cell's count, read after its date: "Tuesday, November 3, 2 events". */
    eventsOne: "1 event",
    eventsOther: "{count} events",
    /** A day cell's button for the events it doesn't show yet. */
    more: "+{count} more",
    /** The same button once a day's events are all shown. */
    fewer: "Show fewer",
    /** The lanes layout's row for events that name no lane. */
    unassigned: "Unassigned",
    /** Before an event's lanes, for screen readers. `{names}`: "Ana, Ben". */
    with: "with {names}",
    /** An event that started on an earlier day. */
    continued: "continued",
    /** The lanes layout's first column. */
    lane: "Who",
    /** When the window holds more rows than one request loads. `{more}` left out; `{shown}` of `{total}`. */
    capped: "+{more} more not shown. Narrow the calendar or filter it to see them.",
    /** The layout switch's buttons. */
    layouts: { month: "Month", weeks: "Weeks", agenda: "Agenda", lanes: "Lanes" },
    /** The weeks switch's name for screen readers, and its buttons. */
    weeksShown: "Weeks shown",
    weeksOne: "1 week",
    weeksOther: "{count} weeks",
    /** PrintButton's label. */
    print: "Print",
    /** A printed sheet's week. `{date}`: "November 2 – November 8". */
    weekOf: "Week of {date}",
  },
  /** ConflictSheet: a save met someone else's change. */
  /** Widgets (`<Widget>`): tiles fed by a view. */
  widget: {
    /** A total with nothing to total. */
    empty: "Nothing yet",
    /** A list widget with no rows: `{items}` is the view's plural noun. */
    emptyList: "No {items} yet",
    /** A total or rows that couldn't be read, before the reason. */
    error: "Couldn't load this",
    retry: "Try again",
    /** Progress: `{value}` of `{goal}`. */
    progressOf: "{value} of {goal}",
    /** A streak's unit, one and many. */
    day: "day",
    days: "days",
    week: "week",
    weeks: "weeks",
    /** A streak whose latest day isn't done yet. */
    streakOpen: "Keep it going today",
    /** A streak that includes today. */
    streakToday: "Done today",
    /** A list widget's link to the whole view. */
    seeAll: "See all",
    /** A chart drawn from only the first rows: `{shown}` of `{total}`. */
    partial: "From the first {shown} of {total}",
  },
  conflict: {
    /** `{noun}`: the record's noun ("task"). */
    title: "Someone else changed this {noun}",
    description: "They saved a change after you opened it. Theirs is next to yours below: keep yours to save it over theirs, or take theirs and drop your changes.",
    /** When their change already matches what you tried to save. */
    same: "Their change already matches yours, so there's nothing to choose.",
    field: "Field",
    theirs: "Theirs",
    mine: "Yours",
    /** An empty value in the comparison. */
    empty: "Empty",
    /** Their value for a field their row as read here doesn't carry. */
    unknown: "Not shown",
    keepMine: "Keep my version",
    takeTheirs: "Take their version",
    /** When "keep mine" failed for another reason (offline, refused). */
    failed: "Your version wasn't saved.",
    /** The record's noun when the screen gave none. */
    record: "record",
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
  auth: {
    /** What each mode is for: a page headline to match (`AuthPage`'s `branding.headline`). */
    titles: {
      "sign-in": "Sign in",
      "sign-up": "Create your account",
      "forgot-password": "Reset your password",
      "new-password": "Choose a new password",
    },
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    code: "Code",
    /** The `"phone-code"` method's field. */
    phone: "Phone number",
    phonePlaceholder: "+1 555 123 4567",
    phoneHint: "With your country code. We'll text you a code.",
    /** The `"full_name"` sign-up field. */
    fullName: "Full name",
    /** Under the code boxes. `{email}`: where it went. `{length}`: its digits (worded so no article depends on the number). */
    codeSent: "We sent a code to {email}. It has {length} digits.",
    /** `codeSent` without sign-up, when the form can't say whether the email has an account. */
    codeSentIfAccount: "If {email} has an account, we sent it a code. It has {length} digits.",
    /** Under the code boxes after a text. `{phone}`: where it went. `{length}`: its digits. */
    phoneCodeSent: "We texted a code to {phone}. It has {length} digits.",
    /** `phoneCodeSent` without sign-up, when the form can't say whether the number has an account. */
    phoneCodeSentIfAccount: "If {phone} has an account, we texted it a code. It has {length} digits.",
    signIn: "Sign in",
    signUp: "Create account",
    sendMagicLink: "Email me a sign-in link",
    sendCode: "Email me a code",
    sendPhoneCode: "Text me a code",
    verifyCode: "Verify",
    sendReset: "Send reset link",
    savePassword: "Save password",
    resendCode: "Resend code",
    /** The resend button while it waits. `{seconds}`: left. */
    resendIn: "Resend code in {seconds}s",
    codeResent: "We sent a new code.",
    useDifferentEmail: "Use a different email",
    useDifferentPhone: "Use a different number",
    /** The links that switch how to sign in. */
    usePassword: "Sign in with a password",
    useMagicLink: "Email me a link instead",
    useCode: "Email me a code instead",
    usePhoneCode: "Text me a code instead",
    forgotPassword: "Forgot password?",
    noAccount: "No account yet?",
    createAccount: "Create one",
    haveAccount: "Already have an account?",
    backToSignIn: "Back to sign in",
    /** Between the provider buttons and the email form. */
    or: "or",
    /** A provider button. `{provider}`: "Google". */
    continueWith: "Continue with {provider}",
    /** The provider buttons' group, for screen readers. */
    providers: "Sign in with",
    /** After a link went out. `{email}`: where. */
    checkEmailTitle: "Check your email",
    magicLinkSent: "We sent a sign-in link to {email}. Open it on this device to finish.",
    /** `magicLinkSent` without sign-up, when the form can't say whether the email has an account. */
    magicLinkSentIfAccount: "If {email} has an account, we sent it a sign-in link. Open it on this device to finish.",
    resetSent: "If {email} has an account, we sent it a link to choose a new password.",
    confirmSent: "We sent a link to {email}. Open it to confirm your account, then sign in.",
    /** On "check your email", with `offerCodeOnConfirm`: the code in the same email, for when the link opens in another browser. */
    enterCodeInstead: "Enter the code instead",
    /** `AuthForm`'s `notice`, by kind: why the person is back on the form. */
    notices: {
      "reset-link-expired": "That reset link has expired or was already used. Ask for a new one.",
      "provider-cancelled": "Sign-in was cancelled. Try again, or use another way to sign in.",
      "account-deleted": "Your account is deleted.",
    },
    passwordUpdated: "Your password is changed.",
    /** The minimum the new-password field asks for. `{min}`: characters. */
    passwordHint: "At least {min} characters.",
    errors: {
      emailRequired: "Enter your email.",
      emailInvalid: "Enter a valid email address.",
      passwordRequired: "Enter your password.",
      /** `{min}`: characters. */
      passwordTooShort: "Use at least {min} characters.",
      passwordMismatch: "The passwords don't match.",
      codeRequired: "Enter the {length}-digit code.",
      phoneRequired: "Enter your phone number.",
      phoneInvalid: "Enter the number with its country code, like +1 555 123 4567.",
      /** A required `signUpFields` field left empty. `{label}`: its label. */
      fieldRequired: "{label} is required.",
      /**
       * Supabase Auth error codes, in fixed copy. Anything unlisted gets `generic` (the server's own
       * text goes to `reportError`, never on screen), unless the client marks its message displayable.
       */
      invalid_credentials: "That email and password don't match.",
      email_not_confirmed: "Confirm your email first: open the link we sent you.",
      user_already_exists: "That email already has an account. Sign in instead.",
      email_exists: "That email already has an account. Sign in instead.",
      weak_password: "Choose a stronger password.",
      same_password: "Choose a password you haven't used here.",
      signup_disabled: "New accounts can't be created here.",
      otp_expired: "That code has expired or is wrong. Ask for a new one.",
      otp_disabled: "Email codes aren't turned on for this app.",
      over_email_send_rate_limit: "Too many emails. Wait a minute and try again.",
      over_sms_send_rate_limit: "Too many texts. Wait a minute and try again.",
      sms_send_failed: "We couldn't text that number. Check it and try again.",
      phone_exists: "That number already has an account. Sign in instead.",
      over_request_rate_limit: "Too many tries. Wait a minute and try again.",
      provider_disabled: "That sign-in option isn't turned on.",
      session_not_found: "Your reset link has expired. Ask for a new one.",
      reauthentication_needed: "Sign in again, then change your password.",
      network: "You seem to be offline. Check your connection and try again.",
      generic: "That didn't work. Try again.",
    },
  },
  shell: {
    /** The phone drawer's name, announced when it opens. */
    navigation: "Navigation",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    /** The desktop sidebar's toggle, collapsed and expanded. */
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    /** The phone bottom bar's name. */
    primaryNavigation: "Primary",
    /** The phone bottom bar's last slot when the items don't fit, and the sheet it opens. */
    more: "More",
    /** The More sheet's description, for screen readers. */
    moreDescription: "The rest of this section's pages",
    /** The More button's name when the current page is one of the items under it. */
    moreCurrent: "More, includes the current page",
  },
};

/** The shape a translation fills. */
export type UiMessages = typeof uiMessages;
