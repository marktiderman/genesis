// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import type { ChatMessage } from "../../core/types";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";
import type { ThreadRow } from "../rows";
import { nearBottom, ChatThreadScreen, threadListMode } from "../thread-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

function msg(seq: number, senderId: string, createdAt: string): ChatMessage {
  return {
    id: `m${seq}`, conversationId: CONV, seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt, editedAt: null, deletedAt: null, attachments: [], reactions: [],
  } as ChatMessage;
}

function fakeClient(messages: ChatMessage[], lastReadSeq: number): ChatClient {
  const sub = { unsubscribe: vi.fn(), typing: vi.fn(), recording: vi.fn(), send: vi.fn() };
  return {
    conversation: vi.fn(async () => ({ id: CONV, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => [
      { conversationId: CONV, userId: ME, role: "member", lastReadSeq, joinedAt: "2026-10-01T00:00:00Z" },
      { conversationId: CONV, userId: SAM, role: "member", lastReadSeq: 9, joinedAt: "2026-10-01T00:00:00Z" },
    ]),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers: 2 })),
    myRole: vi.fn(async () => "member"),
    canPost: vi.fn(async () => true),
    messages: vi.fn(async () => ({ messages, hasEarlier: true })),
    message: vi.fn(async () => null),
    subscribeConversation: vi.fn(() => sub),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    markRead: vi.fn(async () => 0),
    pins: vi.fn(async () => []),
    fileUrls: vi.fn(async () => ({})),
  } as unknown as ChatClient;
}

/** A list that records what it was given (the app's FlashList, as GenesisNativeApp passes it). */
function recordingList() {
  const seen: { props: Record<string, unknown> }[] = [];
  function List(props: Record<string, unknown>) {
    seen.push({ props });
    return null;
  }
  return { List, last: () => seen.at(-1)!.props };
}

function wrap(client: ChatClient, list: unknown, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <GenesisModulesProvider modules={{ list: list as never }}>
        <ChatProvider client={client} userId={ME}>
          <NativeToastProvider>
            <ChatNativeProvider>{children}</ChatNativeProvider>
          </NativeToastProvider>
        </ChatProvider>
      </GenesisModulesProvider>
    </QueryClientProvider>
  );
}

describe("ChatThreadScreen's list", () => {
  it("is oldest first and upright, so VoiceOver reads each day's heading and the New messages line before their messages", async () => {
    const messages = [msg(1, SAM, "2026-10-23T09:00:00Z"), msg(2, ME, "2026-10-23T09:01:00Z"), msg(3, SAM, "2026-10-24T10:00:00Z"), msg(4, SAM, "2026-10-24T10:01:00Z")];
    const list = recordingList();
    render(wrap(fakeClient(messages, 3), list.List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect((list.last().data as ThreadRow[] | undefined)?.some((r) => r.type === "unread")).toBe(true));
    const rows = list.last().data as ThreadRow[];
    const shape = rows.map((r) => (r.type === "message" ? (r.item.type === "message" ? r.item.message.id : "pending") : r.type));
    expect(shape).toEqual(["day", "m1", "m2", "day", "m3", "unread", "m4"]);
    expect(list.last().inverted).toBeFalsy();
  });

  it("uses FlashList's bottom-anchored chat mode, never the autoscrollToTopThreshold FlashList 2 ignores, and loads earlier at the top", async () => {
    const list = recordingList();
    render(wrap(fakeClient([msg(1, SAM, "2026-10-24T10:00:00Z")], 0), list.List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect((list.last().data as ThreadRow[] | undefined)?.length).toBeGreaterThan(0));
    const mvcp = list.last().maintainVisibleContentPosition as Record<string, unknown>;
    expect(mvcp).toMatchObject({ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 });
    expect(mvcp).not.toHaveProperty("autoscrollToTopThreshold");
    expect(typeof list.last().onStartReached).toBe("function");
    expect(list.last().onEndReached).toBeUndefined();
    // "Load earlier" sits at the top, over the oldest message.
    expect(list.last().ListHeaderComponent).toBeTruthy();
  });
});

describe("threadListMode", () => {
  it("follows new rows by hand only on FlatList, which keeps its place for earlier rows", () => {
    expect(threadListMode(true, false)).toMatchObject({ followsByHand: false });
    expect(threadListMode(true, true).maintainVisibleContentPosition).toMatchObject({ animateAutoScrollToBottom: false });
    expect(threadListMode(false, false)).toEqual({ followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 0 } });
  });

  it("counts a position within the slack of the end as the bottom", () => {
    const at = (y: number) => ({ contentOffset: { y }, contentSize: { height: 2000 }, layoutMeasurement: { height: 800 } });
    expect(nearBottom(at(1200))).toBe(true);
    expect(nearBottom(at(1100))).toBe(true);
    expect(nearBottom(at(900))).toBe(false);
  });
});
