// The window a sync keeps: about a week back and six months ahead.
import type { TimeWindow } from "./types";

/** @stability Beta */
export const SYNC_DAYS_BACK = 7;
/** @stability Beta */
export const SYNC_DAYS_AHEAD = 183;
const DAY_MS = 86_400_000;

/** The sync window around `now`, its edges on UTC midnights so repeated syncs agree. @stability Beta */
export function syncWindow(now: Date = new Date()): TimeWindow {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - SYNC_DAYS_BACK * DAY_MS), to: new Date(today + SYNC_DAYS_AHEAD * DAY_MS) };
}
