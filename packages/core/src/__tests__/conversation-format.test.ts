// @feat:inbox-thread
import { describe, expect, it } from "vitest";
import { DEFAULT_THREAD_LABELS, formatInboxTime, isDelivered, readReceiptFor, type ThreadMessage } from "../conversation";

const at = (iso: string) => iso;
const messages: ThreadMessage[] = [
  { id: "1", body: "a", mine: true, timestamp: at("2026-10-24T09:00:00Z") },
  { id: "2", body: "b", mine: false, timestamp: at("2026-10-24T09:05:00Z") },
  { id: "3", body: "c", mine: true, timestamp: at("2026-10-24T09:10:00Z") },
  { id: "e", kind: "event", body: "Sam was assigned", mine: true, timestamp: at("2026-10-24T09:11:00Z") },
  { id: "4", body: "d", mine: true, timestamp: at("2026-10-24T09:12:00Z"), status: "pending" },
];

describe("the conversation contract", () => {
  it("puts the read receipt on my newest delivered message the other side read, never an event", () => {
    expect(readReceiptFor(messages, "2026-10-24T09:30:00Z")).toBe("3");
    expect(readReceiptFor(messages, "2026-10-24T09:06:00Z")).toBe("1");
    expect(readReceiptFor(messages, null)).toBeNull();
  });

  it("counts only sent (or unmarked) messages as delivered", () => {
    expect(isDelivered({ ...messages[0]! })).toBe(true);
    for (const status of ["sending", "pending", "paused", "failed", "conflict"] as const) expect(isDelivered({ ...messages[0]!, status })).toBe(false);
  });

  it("writes an inbox time as today's time, Yesterday, a weekday, then a date", () => {
    const now = new Date(2026, 9, 24, 12, 0);
    expect(formatInboxTime(new Date(2026, 9, 23, 9, 0), now)).toBe("Yesterday");
    expect(formatInboxTime(new Date(2026, 9, 20, 9, 0), now)).toMatch(/day$/);
    expect(formatInboxTime(new Date(2026, 9, 24, 9, 41), now)).toMatch(/9:41/);
  });

  it("has a default for every label, frozen", () => {
    expect(Object.isFrozen(DEFAULT_THREAD_LABELS)).toBe(true);
    expect(DEFAULT_THREAD_LABELS.internal).toBe("Internal note");
  });
});
