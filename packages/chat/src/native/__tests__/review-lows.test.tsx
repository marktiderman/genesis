// @vitest-environment happy-dom
// @feat:chat
import { act, cleanup, render, screen } from "@testing-library/react";
import { AccessibilityInfo, Platform, StyleSheet } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadItem } from "../../core/thread";
import type { ChatMember, ChatMessage } from "../../core/types";
import { MessageBubble } from "../message-bubble";
import { lastSentReceipt } from "../receipts";
import { buildThreadRows, type ThreadRow } from "../rows";
import { ChatTypingBubble } from "../typing-bubble";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Platform.OS = os;
  vi.restoreAllMocks();
});

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";

function message(seq: number, senderId: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${seq}`, conversationId: "conv", seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: `2026-10-25T10:0${seq}:00Z`, editedAt: null, deletedAt: null, attachments: [], reactions: [], ...extra,
  } as unknown as ChatMessage;
}
const member = (userId: string, lastReadSeq: number) => ({ conversationId: "conv", userId, role: "member", lastReadSeq, lastReadAt: null, joinedAt: "2026-10-01T00:00:00Z" }) as ChatMember;
const styleOf = (el: Element) => StyleSheet.flatten(JSON.parse((el as HTMLElement).dataset.style ?? "null")) as Record<string, unknown> | undefined;

describe("a hidden message's status", () => {
  it("is never shown: the others were never shown the message", () => {
    const items: ThreadItem[] = [{ type: "message", message: message(1, ME) }, { type: "message", message: message(2, ME, { moderation: "hidden" } as Partial<ChatMessage>) }];
    expect(lastSentReceipt(items, { me: ME, members: [member(ME, 2), member(SAM, 2)], group: false })).toBeNull();
  });

  it("and neither is an observers-only message's: members who can't see it aren't its readers", () => {
    const items: ThreadItem[] = [{ type: "message", message: message(1, ME, { visibility: "observers" } as Partial<ChatMessage>) }];
    expect(lastSentReceipt(items, { me: ME, members: [member(ME, 1), member(SAM, 1)], group: false })).toBeNull();
  });
});

describe("the receipt button", () => {
  it("is a 44 pt target (28 pt tall, 8 pt of slop above and below)", () => {
    const row = buildThreadRows([{ type: "message", message: message(1, ME) }], { me: ME, group: true }).find((x): x is Extract<ThreadRow, { type: "message" }> => x.type === "message")!;
    render(<MessageBubble row={row} me={ME} urls={{}} group reducedMotion receipt="Read by 2" onReceiptPress={vi.fn()} testID="b" />);
    expect(styleOf(screen.getByTestId("b-receipt"))?.minHeight).toBe(28);
  });

  it("cuts the tail from the backdrop the screen draws", () => {
    const row = buildThreadRows([{ type: "message", message: message(1, ME) }], { me: ME, group: false }).find((x): x is Extract<ThreadRow, { type: "message" }> => x.type === "message")!;
    render(<MessageBubble row={row} me={ME} urls={{}} group={false} reducedMotion backdrop="rgb(1, 2, 3)" testID="t" />);
    const cut = screen.getByTestId("t-tail").children[1]!;
    expect(styleOf(cut)?.backgroundColor).toBe("rgb(1, 2, 3)");
  });
});

describe("the typing bubble on iOS", () => {
  it("is announced when someone starts typing (iOS has no live regions), not again for the same typer", () => {
    Platform.OS = "ios";
    const announce = vi.fn();
    (AccessibilityInfo as { announceForAccessibility?: unknown }).announceForAccessibility = announce;
    const { rerender } = render(<ChatTypingBubble label="Sam is typing…" userId={SAM} group={false} reducedMotion testID="ty" />);
    expect(announce).toHaveBeenCalledWith("Sam is typing…");
    act(() => rerender(<ChatTypingBubble label="Sam is typing…" userId={SAM} group={false} reducedMotion testID="ty" />));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("leaves Android to its live region", () => {
    Platform.OS = "android";
    const announce = vi.fn();
    (AccessibilityInfo as { announceForAccessibility?: unknown }).announceForAccessibility = announce;
    render(<ChatTypingBubble label="Sam is typing…" userId={SAM} group={false} reducedMotion testID="ty" />);
    expect(announce).not.toHaveBeenCalled();
  });
});
