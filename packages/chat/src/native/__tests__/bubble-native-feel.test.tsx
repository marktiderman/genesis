// @vitest-environment happy-dom
// @feat:chat
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { Animated, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatMessage, PendingMessage } from "../../core/types";
import { bubbleCorners, bubblePosition, MessageBubble } from "../message-bubble";
import { buildThreadRows, type ThreadRow } from "../rows";
import { ChatTimesProvider, startsTimeReveal, timeRevealFor, TIME_REVEAL_WIDTH } from "../thread-times";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
type MessageRow = Extract<ThreadRow, { type: "message" }>;

function message(seq: number, senderId: string): ChatMessage {
  return {
    id: `m${seq}`, conversationId: "conv", seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: `2026-10-25T10:0${seq}:00Z`, editedAt: null, deletedAt: null, attachments: [], reactions: [],
  } as unknown as ChatMessage;
}

const rowsOf = (messages: ChatMessage[]) => buildThreadRows(messages.map((m) => ({ type: "message" as const, message: m })), { me: ME, group: false }).filter((r): r is MessageRow => r.type === "message");

describe("bubble shape", () => {
  it("knows its place in a run", () => {
    const run = rowsOf([message(1, SAM), message(2, SAM), message(3, SAM), message(4, ME)]);
    expect(run.map(bubblePosition)).toEqual(["first", "middle", "last", "single"]);
  });

  it("tightens the corners where bubbles of a run meet, on the sender's side, and gives the last one a tail", () => {
    expect(bubbleCorners("first", true)).toMatchObject({ borderTopRightRadius: 18, borderBottomRightRadius: 5, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, tail: false });
    expect(bubbleCorners("middle", true)).toMatchObject({ borderTopRightRadius: 5, borderBottomRightRadius: 5, tail: false });
    expect(bubbleCorners("last", true)).toMatchObject({ borderTopRightRadius: 5, borderBottomRightRadius: 18, tail: true });
    expect(bubbleCorners("middle", false)).toMatchObject({ borderTopLeftRadius: 5, borderBottomLeftRadius: 5, borderTopRightRadius: 18, borderBottomRightRadius: 18 });
    expect(bubbleCorners("single", false).tail).toBe(true);
  });

  it("draws the tail on the last of a run only, hidden from VoiceOver, and not over a highlighted row", () => {
    const [first, , last] = rowsOf([message(1, SAM), message(2, SAM), message(3, SAM)]);
    render(
      <>
        <MessageBubble row={first!} me={ME} urls={{}} group={false} reducedMotion testID="first" />
        <MessageBubble row={last!} me={ME} urls={{}} group={false} reducedMotion testID="last" />
        <MessageBubble row={last!} me={ME} urls={{}} group={false} reducedMotion highlighted testID="lit" />
      </>,
    );
    expect(screen.queryByTestId("first-tail")).toBeNull();
    expect(screen.getByTestId("last-tail").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("lit-tail")).toBeNull();
  });
});

describe("timestamps on demand", () => {
  it("starts on a leftward, mostly sideways drag, and pulls at most the time's width", () => {
    expect(startsTimeReveal(-20, 3)).toBe(true);
    expect(startsTimeReveal(20, 3)).toBe(false);
    expect(startsTimeReveal(-20, 15)).toBe(false);
    expect(timeRevealFor(-30)).toBe(30);
    expect(timeRevealFor(-300)).toBe(TIME_REVEAL_WIDTH);
    expect(timeRevealFor(40)).toBe(0);
  });

  it("puts every message's time beside it, hidden from VoiceOver (the bubble's label already says it), while the group-end time stays", () => {
    const [first, last] = rowsOf([message(1, SAM), message(2, SAM)]);
    render(
      <ChatTimesProvider value={new Animated.Value(0)}>
        <MessageBubble row={first!} me={ME} urls={{}} group={false} reducedMotion testID="a" />
        <MessageBubble row={last!} me={ME} urls={{}} group={false} reducedMotion testID="b" />
      </ChatTimesProvider>,
    );
    const reveal = screen.getByTestId("a-time-reveal");
    expect(reveal.getAttribute("aria-hidden")).toBe("true");
    expect(reveal.textContent).toMatch(/\d/);
    expect(screen.getByTestId("b-time-reveal")).toBeTruthy();
    expect(screen.getByTestId("a-bubble").getAttribute("aria-label")).toContain(reveal.textContent!);
  });
});

describe("swipe to reply on gesture-handler", () => {
  it("uses the app's ReanimatedSwipeable when given: past the threshold it replies, taps, and closes", () => {
    const close = vi.fn();
    const seen: Record<string, unknown>[] = [];
    function Swipeable(props: Record<string, unknown> & { children?: ReactNode; ref?: unknown }) {
      seen.push(props);
      const ref = props.ref as { current: unknown } | undefined;
      if (ref) ref.current = { close };
      return createElement(View, { testID: props.testID as string }, props.children as ReactNode);
    }
    const onReply = vi.fn();
    const onSwipeReply = vi.fn();
    const [row] = rowsOf([message(1, SAM)]);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <MessageBubble row={row!} me={ME} urls={{}} group={false} reducedMotion onReply={onReply} onSwipeReply={onSwipeReply} testID="s" />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("s-swipe")).toBeTruthy();
    const props = seen.at(-1)!;
    expect(props.leftThreshold).toBe(56);
    // Leftward drags stay the thread's (the times).
    expect(props.dragOffsetFromRightEdge).toBeGreaterThan(1000);
    (props.onSwipeableWillOpen as () => void)();
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }));
    expect(onSwipeReply).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

describe("the send animation", () => {
  function pendingRow(createdAt: string): MessageRow {
    const pending: PendingMessage = { clientId: "p1", input: { conversationId: "conv", clientId: "p1", body: "hi" }, senderId: ME, createdAt, status: "sending" };
    return buildThreadRows([{ type: "pending", pending }], { me: ME, group: false }).find((r): r is MessageRow => r.type === "message")!;
  }
  function reanimated() {
    const entered: unknown[] = [];
    const animation = { duration: vi.fn(() => animation), reduceMotion: vi.fn(() => animation) };
    function AnimatedView(props: Record<string, unknown> & { children?: ReactNode }) {
      entered.push(props.entering);
      const { entering: _e, ...rest } = props;
      return createElement(View, rest, props.children);
    }
    return { module: { default: { View: AnimatedView }, FadeInDown: animation, ReduceMotion: { System: "system", Always: "always", Never: "never" } }, entered, animation };
  }

  it("raises a message you just sent from the composer, with Reanimated's own Reduce Motion check", () => {
    const r = reanimated();
    render(
      <GenesisModulesProvider modules={{ reanimated: r.module as never }}>
        <MessageBubble row={pendingRow(new Date().toISOString())} me={ME} urls={{}} group={false} reducedMotion={false} testID="p" />
      </GenesisModulesProvider>,
    );
    expect(r.entered[0]).toBe(r.animation);
    expect(r.animation.reduceMotion).toHaveBeenCalledWith("system");
  });

  it("doesn't animate with Reduce Motion, nor an old pending message (a relaunch's outbox)", () => {
    const r = reanimated();
    render(
      <GenesisModulesProvider modules={{ reanimated: r.module as never }}>
        <MessageBubble row={pendingRow(new Date().toISOString())} me={ME} urls={{}} group={false} reducedMotion testID="p" />
        <MessageBubble row={pendingRow("2026-10-25T10:00:00Z")} me={ME} urls={{}} group={false} reducedMotion={false} testID="q" />
      </GenesisModulesProvider>,
    );
    expect(r.entered.every((e) => e === undefined)).toBe(true);
  });
});
