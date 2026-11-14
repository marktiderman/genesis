/**
 * What the messenger says about an answer, on the web (`SupportMessenger`) and on a phone (the
 * native hooks): outside office hours, when someone is back; otherwise how soon people usually
 * hear back. One piece for both, so the two can't drift.
 */
import { useEffect, useState } from "react";
import { fill, type SupportCopy } from "./copy";
import { officeHoursState, type OfficeHours } from "./office-hours";

/** What to say about an answer: when someone's back (away), else how soon they usually reply. */
export interface ReplyExpectation {
  /** Away: when someone's back, in the person's own time. */
  back: string | null;
  /** The app's words after "We usually reply", trimmed, or null. */
  within: string | null;
}

/**
 * Away or not, worked out on the device (a server's HTML says nothing) and again each minute.
 * The next opening is shown in the person's own time.
 */
export function useReplyExpectation(replyExpectation: string | undefined, officeHours: OfficeHours | undefined): ReplyExpectation {
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => {
    if (!officeHours) {
      setBack(null);
      return;
    }
    const check = () => {
      const state = officeHoursState(officeHours);
      setBack(!state.open && state.nextOpen ? new Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }).format(state.nextOpen) : null);
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [officeHours]);
  return { back, within: replyExpectation?.trim() || null };
}

/** The line on the compose screen, if there's one to say. */
export function composeExpectationLine(expectation: ReplyExpectation, copy: SupportCopy): string | null {
  if (expectation.back) return fill(copy.messenger.away, { when: expectation.back });
  if (expectation.within) return fill(copy.messenger.replyExpectation, { expectation: expectation.within });
  return null;
}

/** The line under a conversation nobody has answered yet: where the answer will come, and when. */
export function awaitingReplyLine(expectation: ReplyExpectation, copy: SupportCopy): string {
  if (expectation.back) return fill(copy.messenger.awaitingReplyAway, { when: expectation.back });
  if (expectation.within) return fill(copy.messenger.awaitingReplyWithin, { expectation: expectation.within });
  return copy.messenger.awaitingReply;
}
