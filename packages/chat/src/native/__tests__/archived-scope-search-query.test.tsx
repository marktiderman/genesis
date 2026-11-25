// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import type { ChatInboxItem } from "../../core/types";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";
import { ChatInboxScreen } from "../inbox-screen";
import { ChatSearchScreen } from "../search-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

const item = (conversationId: string, title: string): ChatInboxItem => ({
  conversationId,
  kind: "group",
  title,
  subjectType: null,
  subjectId: null,
  status: "open",
  role: "member",
  otherUserId: null,
  memberCount: 3,
  lastSeq: 1,
  lastReadSeq: 1,
  unread: 0,
  mentioned: false,
  muted: false,
  pinned: false,
  archived: true,
  lastMessageAt: null,
  lastMessage: null,
});

function wrap(client: ChatClient, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <GenesisModulesProvider modules={{}}>
        <ChatProvider client={client} userId={ME}>
          <NativeToastProvider>
            <ChatNativeProvider>{children}</ChatNativeProvider>
          </NativeToastProvider>
        </ChatProvider>
      </GenesisModulesProvider>
    </QueryClientProvider>
  );
}

describe("ChatInboxScreen archived", () => {
  it("applies the first filter, so an app's scope holds in Archived too", async () => {
    const client = {
      inbox: vi.fn(async () => [item("in-scope", "Ours"), item("out-of-scope", "Theirs")]),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
    } as unknown as ChatClient;
    const view = render(
      wrap(
        client,
        <ChatInboxScreen
          testID="archived"
          archived
          onOpen={() => {}}
          filters={(defaults) => defaults.map((f) => ({ ...f, predicate: (i, ctx) => i.conversationId === "in-scope" && f.predicate(i, ctx) }))}
        />,
      ),
    );
    await waitFor(() => expect(view.queryByText("Ours")).not.toBeNull());
    expect(view.queryByText("Theirs")).toBeNull();
  });
});

describe("ChatSearchScreen initialQuery", () => {
  it("starts the field with the query and searches for it", async () => {
    const search = vi.fn(async () => []);
    const client = {
      inbox: vi.fn(async () => []),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
      search,
    } as unknown as ChatClient;
    render(wrap(client, <ChatSearchScreen onOpen={() => {}} initialQuery="hello" debounceMs={0} />));
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect((search.mock.calls[0] as unknown[])[0]).toBe("hello");
  });
});
