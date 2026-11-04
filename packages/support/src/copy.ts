/**
 * Every string the support block shows, in English. Pass `copy` (any part of
 * this shape) to translate or reword; what you leave out stays English.
 */
export const supportCopy = {
  settings: {
    section: "Support",
    sendFeedback: "Send feedback",
    help: "Help",
    /** `{count}` new replies. */
    unreadReplies: "{count} new",
  },
  feedback: {
    title: "Send feedback",
    intro: "Tell us what's broken, what's confusing or what you love. We read every report.",
    typeLabel: "What is it?",
    types: { bug: "Bug", idea: "Idea", question: "Question", praise: "Praise" },
    messageLabel: "Tell us more",
    messagePlaceholder: "What happened, and what did you expect?",
    aboutLabel: "About:",
    aboutClear: "Not this",
    severityLabel: "How bad is it?",
    severities: { low: "Minor", medium: "Annoying", high: "Blocks me", critical: "Broken" },
    screenshotLabel: "Screenshot",
    includeScreenshot: "Include this screenshot",
    screenshotHint: "Sent only if you include it. Mark it up to hide anything private first.",
    annotate: "Mark up",
    pin: "Point to it on the page",
    pinned: "Pinned",
    pinnedHint: "Pinned to a spot on this page.",
    removePin: "Remove pin",
    screenshotFailed: "No screenshot was taken: the browser didn't allow it. You can send without one.",
    removeScreenshot: "Remove",
    send: "Send",
    sending: "Sending",
    sentTitle: "Thanks for the feedback",
    sentBody: "We read every report. You'll find it, and our replies, under Help.",
    sentWithoutScreenshot: "Your report was sent, but its screenshot couldn't be.",
    sendAnother: "Send another",
    openHelp: "See it in Help",
    failedTitle: "Your feedback wasn't sent",
    failedBody: "Check your connection and try again.",
    rateLimited: "You've sent a lot of feedback in a short time. Try again later.",
    signInFirst: "Sign in to send feedback.",
    messageRequired: "Write a few words first.",
  },
  annotate: {
    title: "Mark up",
    pen: "Pen",
    hide: "Hide",
    undo: "Undo",
    done: "Done",
    cancel: "Cancel",
    hint: "Draw to point something out. Use Hide to cover anything private.",
    failed: "The marks couldn't be saved. Try again, or cancel and leave the screenshot out.",
  },
  inbox: {
    title: "Help",
    sectionTitle: "Your reports",
    emptyTitle: "No reports yet",
    emptyBody: "When you send feedback it shows up here, with our replies.",
    errorTitle: "Couldn't load your reports",
    errorBody: "Check your connection, then pull to refresh.",
    sendFeedback: "Send feedback",
    ideaBoard: "Idea board",
    shipped: "You asked, we shipped",
    delete: "Delete",
    deleteConfirmTitle: "Delete this report?",
    deleteConfirmBody: "The report, its replies and its screenshots are deleted and can't be opened again.",
    cancel: "Cancel",
    unread: "New reply",
  },
  thread: {
    title: "Report",
    placeholder: "Reply",
    send: "Send",
    read: "Read",
    support: "Support",
    closed: "This report is closed. Send new feedback if something's still wrong.",
    emptyTitle: "No replies yet",
    emptyBody: "We'll answer here.",
    screenshot: "Screenshot",
    pinnedOn: "Points to a spot on",
    /** Before the page an unpinned report was sent from. */
    sentFrom: "Sent from",
    notFound: "That report isn't there any more.",
    you: "You",
    sending: "Sending",
    notSent: "Not sent. Tap to retry.",
    retryHint: "Double tap to send again",
    /** A message's file, where the thread can't show it. */
    voiceNote: "Voice message",
    video: "Video",
    file: "File",
    internalNote: "Internal note",
  },
  staff: {
    status: "Status",
    assignee: "Assigned to",
    unassigned: "Nobody",
    reporter: "Reported by",
    unavailableTitle: "This conversation isn't available",
    unavailableBody: "The report has no conversation you can read.",
    failed: "That change wasn't saved. Try again.",
  },
  agentInbox: {
    views: { mine: "Mine", unassigned: "Unassigned", all: "All" },
    viewLabel: "View",
    listLabel: "Tickets",
    /** Each view's count, for a screen reader. `{count}` tickets. */
    count: "{count} tickets",
    oneTicket: "1 ticket",
    emptyTitle: { mine: "Nothing assigned to you", unassigned: "Nothing waiting", all: "No tickets yet" },
    emptyBody: "New tickets show up here.",
    errorTitle: "Couldn't load the tickets",
    errorBody: "Check your connection and try again.",
    notAllowedTitle: "These tickets aren't yours to see",
    notAllowedBody: "Only this help desk's agents can open its tickets.",
    pickTitle: "No ticket open",
    pickBody: "Pick one from the list.",
    ticketErrorTitle: "Couldn't open this ticket",
    threadErrorTitle: "Couldn't load this conversation",
    back: "Back",
    details: "Details",
    conversation: "Conversation",
    loading: "Loading",
    loadingMore: "Loading more",
    more: "More",
    unread: "unread",
    /** `{count}` unread. */
    unreadCount: "{count} unread",
    notFound: "That ticket isn't in this inbox.",
    threadEmptyBody: "Write the first reply below.",
    reply: "Reply",
    notePlaceholder: "Only your team sees this",
    sendFailed: "That wasn't sent. Your words are still here; try again.",
    from: "From",
    emailSender: "Sent by email",
    type: "Type",
    severity: "Severity",
    opened: "Opened",
    page: "Page",
    appVersion: "App version",
    screenshots: "Screenshots",
    openFile: "Open file",
    /** A row's status line. `{status}` · `{assignee}`. */
    rowMeta: "{status} · {assignee}",
  },
  status: {
    open: "Open",
    submitted: "Received",
    in_progress: "In progress",
    addressed: "Fixed",
    wont_fix: "Closed",
  },
  ideas: {
    title: "Idea board",
    emptyTitle: "No ideas yet",
    emptyBody: "Suggest the first one.",
    suggest: "Suggest an idea",
    suggestTitle: "Suggest an idea",
    titleLabel: "Your idea",
    titlePlaceholder: "A short title",
    bodyLabel: "Why it would help (optional)",
    submit: "Suggest",
    vote: "Vote",
    voted: "Voted",
    /** `{count}` votes. */
    votes: "{count} votes",
    oneVote: "1 vote",
    statuses: { open: "Open", planned: "Planned", in_progress: "In progress", shipped: "Shipped", declined: "Not planned", hidden: "Hidden" },
  },
  shipped: {
    title: "You asked, we shipped",
    emptyTitle: "Nothing yet",
    emptyBody: "When an idea you suggested or voted for ships, it shows up here.",
    /** `{feature}`: the FeatureId it shipped as. */
    shippedAs: "Shipped as {feature}",
  },
};

/** The shape a translation fills. */
export type SupportCopy = typeof supportCopy;

/** Any part of the catalog. */
export type SupportCopyOverrides = { [K in keyof SupportCopy]?: DeepPartial<SupportCopy[K]> };
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** The catalog with overrides merged over the English. */
export function resolveSupportCopy(overrides: SupportCopyOverrides = {}): SupportCopy {
  const merge = (base: Record<string, unknown>, over: Record<string, unknown> | undefined): Record<string, unknown> => {
    if (!over) return base;
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(over)) {
      if (value === undefined) continue;
      const current = base[key];
      out[key] = current && typeof current === "object" && value && typeof value === "object" ? merge(current as Record<string, unknown>, value as Record<string, unknown>) : value;
    }
    return out;
  };
  return merge(supportCopy as unknown as Record<string, unknown>, overrides as Record<string, unknown>) as unknown as SupportCopy;
}

/** Fills `{name}` placeholders. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (token, name: string) => (values[name] !== undefined ? String(values[name]) : token));
}
