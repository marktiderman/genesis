// @feat:chat
import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../../core/thread";
import type { ChatMessage } from "../../core/types";
import { messageActionsFor, canReactTo } from "../actions";
import { buildThreadRows, invertedRows } from "../rows";

const ME = "me";
let n = 0;
function msg(sender: string, at: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  n++;
  return {
    id: `m${n}`, conversationId: "c", seq: n, clientId: `cl${n}`, senderId: sender, senderRole: "member", kind: "text", body: `b${n}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: at, editedAt: null, deletedAt: null, attachments: [], reactions: [], ...extra,
  };
}
const item = (m: ChatMessage): ThreadItem => ({ type: "message", message: m });

describe("thread rows", () => {
  const a = msg("sam", "2026-10-24T09:00:00");
  const b = msg("sam", "2026-10-24T09:01:00");
  const c = msg(ME, "2026-10-24T09:02:00");
  const d = msg("lee", "2026-10-25T08:00:00");
  const items = [a, b, c, d].map(item);

  it("puts a day separator before each day and the New line before the first unread", () => {
    const rows = buildThreadRows(items, { me: ME, firstUnreadId: d.id, group: true, now: new Date("2026-10-25T12:00:00") });
    expect(rows.map((r) => r.type)).toEqual(["day", "message", "message", "message", "day", "unread", "message"]);
    expect(rows[0]).toMatchObject({ label: "Yesterday" });
    expect(rows[4]).toMatchObject({ label: "Today" });
  });

  it("in a group: the name over the first of a run, the avatar beside the last, never on mine", () => {
    const rows = buildThreadRows(items, { me: ME, group: true }).filter((r) => r.type === "message");
    expect(rows.map((r) => [r.showName, r.showAvatar])).toEqual([
      [true, false],
      [false, true],
      [false, false],
      [true, true],
    ]);
    const direct = buildThreadRows(items, { me: ME, group: false }).filter((r) => r.type === "message");
    expect(direct.every((r) => !r.showName && !r.showAvatar)).toBe(true);
  });

  it("is newest first for the inverted list, keyed by client id (a send that lands keeps its row)", () => {
    const rows = invertedRows(items, { me: ME, group: false });
    expect(rows[0]).toMatchObject({ type: "message", key: `c:${d.clientId}` });
    const pending: ThreadItem = { type: "pending", pending: { clientId: d.clientId, input: { conversationId: "c", clientId: d.clientId }, senderId: ME, createdAt: d.createdAt, status: "sending" } };
    expect(invertedRows([pending], { me: ME, group: false }).find((r) => r.type === "message")!.key).toBe(`c:${d.clientId}`);
  });
});

describe("messageActionsFor", () => {
  const base = { me: ME, role: "member" as const, canPost: true, pinned: false, direct: false, canCopy: true };

  it("a member's own message: reply, copy, delete; no pin outside a direct conversation", () => {
    expect(messageActionsFor(msg(ME, "2026-10-24T09:00:00"), base)).toEqual(["reply", "copy", "delete"]);
  });

  it("someone else's: no delete for a member; an admin may pin and delete", () => {
    const theirs = msg("sam", "2026-10-24T09:00:00");
    expect(messageActionsFor(theirs, base)).toEqual(["reply", "copy"]);
    expect(messageActionsFor(theirs, { ...base, role: "admin", pinned: true })).toEqual(["reply", "copy", "unpin", "delete"]);
    expect(messageActionsFor(theirs, { ...base, direct: true })).toEqual(["reply", "copy", "pin"]);
  });

  it("a read-only viewer can only copy; deleted and system messages offer nothing", () => {
    const theirs = msg("sam", "2026-10-24T09:00:00");
    expect(messageActionsFor(theirs, { ...base, role: "observer", canPost: false })).toEqual(["copy"]);
    expect(canReactTo(theirs, { canPost: false })).toBe(false);
    expect(messageActionsFor(msg(ME, "2026-10-24T09:00:00", { deletedAt: "x" }), base)).toEqual([]);
    expect(messageActionsFor(msg("sam", "2026-10-24T09:00:00", { kind: "system" }), { ...base, role: "owner" })).toEqual([]);
    expect(messageActionsFor(msg(ME, "2026-10-24T09:00:00", { body: "" }), { ...base, canCopy: true })).toEqual(["reply", "delete"]);
  });
});
