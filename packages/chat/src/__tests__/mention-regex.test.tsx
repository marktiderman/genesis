// @vitest-environment happy-dom
// @feat:chat
// Mentions read as @Name without backtracking on hostile text: a body of "@[" repeated thousands
// of times (a polynomial regular expression on uncontrolled data, CodeQL) returns at once.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { previewText } from "../core/thread";
import { displayBody, MessageBubble } from "../native/message-bubble";
import { plainText } from "../web/bubble";
import type { ChatMessage } from "../core/types";

afterEach(cleanup);

const HOSTILE = "@[".repeat(10_000);
const ID = "11111111-1111-4111-8111-111111111111";

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

describe("mention text", () => {
  it("still reads a mention as @Name", () => {
    expect(displayBody(`Hi @[Sam Lee](user:${ID})`)).toBe("Hi @Sam Lee");
    expect(plainText(`Hi @[Sam Lee](user:${ID})`)).toBe("Hi @Sam Lee");
    expect(previewText(`Hi @[Sam Lee](user:${ID})`, null)).toBe("Hi @Sam Lee");
  });

  it("returns quickly on '@[' repeated 10000 times, unchanged", () => {
    for (const fn of [displayBody, plainText, (b: string) => previewText(b, null)]) {
      const { value, ms } = timed(() => fn(HOSTILE));
      expect(ms).toBeLessThan(200);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("renders a bubble with that body", () => {
    const message = {
      id: "m1", conversationId: "c", seq: 1, clientId: "c1", senderId: ID, senderRole: "member", kind: "text", body: HOSTILE, mentions: [], replyToId: null,
      threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone", silent: false, meta: {}, createdAt: new Date().toISOString(),
      editedAt: null, deletedAt: null, attachments: [], reactions: [],
    } as unknown as ChatMessage;
    const row = { type: "message" as const, key: "c:c1", item: { type: "message" as const, message }, mine: false, senderId: ID, groupStart: true, groupEnd: true, showName: false, showAvatar: false };
    const { ms } = timed(() => render(<MessageBubble row={row} me="me" urls={{}} group={false} reducedMotion testID="b" />));
    expect(ms).toBeLessThan(2000);
    expect(screen.getByTestId("b-bubble").getAttribute("aria-label")).toContain("@[@[");
  });
});
