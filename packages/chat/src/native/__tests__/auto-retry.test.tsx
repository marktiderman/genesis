// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../../core/client";
import type { OutboxStore, QueuedMessage } from "../../core/outbox";
import { ChatProvider } from "../../react/index";
import { ChatAutoRetry, isOnline, type AppStateLike } from "../auto-retry";
import { ChatNativeProvider } from "../context";
import type { NetInfoLike } from "../modules";

afterEach(cleanup);

function fakes() {
  let appListener: ((s: string) => void) | null = null;
  let netListener: ((s: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => void) | null = null;
  const appState: AppStateLike = {
    currentState: "active",
    addEventListener: (_t, l) => {
      appListener = l;
      return { remove: () => (appListener = null) };
    },
  };
  const netInfo: NetInfoLike = {
    addEventListener: (l) => {
      netListener = l;
      // NetInfo reports the current state as soon as you subscribe.
      l({ isConnected: true, isInternetReachable: true });
      return () => (netListener = null);
    },
  };
  return {
    appState,
    netInfo,
    app: (s: string) => appListener?.(s),
    net: (online: boolean) => netListener?.({ isConnected: online, isInternetReachable: online }),
    unsubscribed: () => appListener === null && netListener === null,
  };
}

/** One message that failed to send, waiting in the saved outbox; the server keeps refusing it. */
function failing(extra: Partial<QueuedMessage> = {}) {
  const queued: QueuedMessage = {
    clientId: "q1",
    input: { conversationId: "c1", clientId: "q1", body: "hello", replyToId: null, mentions: [] } as QueuedMessage["input"],
    senderId: "u1",
    createdAt: "2026-10-25T10:00:00Z",
    status: "failed",
    files: [],
    attempts: 1,
    ...extra,
  };
  let saved = [queued];
  const store: OutboxStore = { load: async () => saved, save: async (q) => void (saved = q) };
  const send = vi.fn(async () => {
    throw new Error("offline");
  });
  const client = { send, subscribeInbox: () => ({ unsubscribe: () => undefined }) } as unknown as ChatClient;
  return { store, client, send };
}

function mount(f: ReturnType<typeof fakes>, o: ReturnType<typeof failing>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatProvider client={o.client} userId="u1" outboxStore={o.store}>
        <ChatNativeProvider modules={{ netInfo: f.netInfo }}>
          <ChatAutoRetry appState={f.appState} />
        </ChatNativeProvider>
      </ChatProvider>
    </QueryClientProvider>,
  );
}

describe("ChatAutoRetry", () => {
  it("retries unsent messages when the app comes back to the front", async () => {
    const f = fakes();
    const o = failing();
    mount(f, o);
    // The provider's own retry of what the last launch left.
    await waitFor(() => expect(o.send).toHaveBeenCalledTimes(1));
    await act(async () => f.app("active"));
    expect(o.send).toHaveBeenCalledTimes(1);
    await act(async () => f.app("background"));
    await act(async () => f.app("active"));
    await waitFor(() => expect(o.send).toHaveBeenCalledTimes(2));
  });

  it("retries when the connection comes back, not on NetInfo's first report", async () => {
    const f = fakes();
    const o = failing();
    mount(f, o);
    await waitFor(() => expect(o.send).toHaveBeenCalledTimes(1));
    await act(async () => f.net(true));
    expect(o.send).toHaveBeenCalledTimes(1);
    await act(async () => f.net(false));
    await act(async () => f.net(true));
    await waitFor(() => expect(o.send).toHaveBeenCalledTimes(2));
  });

  it("leaves alone a message the server refused for good", async () => {
    const f = fakes();
    const o = failing({ permanent: true, error: "You can't post here" });
    mount(f, o);
    await act(async () => f.app("background"));
    await act(async () => f.app("active"));
    await act(async () => f.net(false));
    await act(async () => f.net(true));
    expect(o.send).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", async () => {
    const f = fakes();
    const o = failing();
    const view = mount(f, o);
    view.unmount();
    expect(f.unsubscribed()).toBe(true);
  });
});

describe("isOnline", () => {
  it("counts unknown as online, so only a real offline waits", () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: false })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});
