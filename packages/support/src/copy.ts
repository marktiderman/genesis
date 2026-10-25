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
    typeLabel: "What is it?",
    types: { bug: "Bug", idea: "Idea", question: "Question", praise: "Praise" },
    messageLabel: "Tell us more",
    messagePlaceholder: "What happened, and what did you expect?",
    screenshotLabel: "Screenshot",
    screenshotHint: "Only sent if you keep it. Hide anything private before you send.",
    annotate: "Mark up",
    pin: "Point to it on the page",
    pinned: "Pinned",
    removeScreenshot: "Remove",
    send: "Send",
    sending: "Sending",
    sentTitle: "Thanks for the feedback",
    sentBody: "We read every report. You'll find it, and our replies, under Help.",
    sentWithoutScreenshot: "Your report was sent, but its screenshot couldn't be.",
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
  },
  inbox: {
    title: "Help",
    sectionTitle: "Your reports",
    emptyTitle: "No reports yet",
    emptyBody: "When you send feedback it shows up here, with our replies.",
    sendFeedback: "Send feedback",
    ideaBoard: "Idea board",
    shipped: "You asked, we shipped",
    delete: "Delete",
    deleteConfirmTitle: "Delete this report?",
    deleteConfirmBody: "It and its screenshots are removed for good.",
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
