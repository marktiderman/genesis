// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";
import { ChatInboxScreen, inboxRow } from "../inbox-screen";
import { chatNativeCopy } from "../copy";
import type { ChatInboxItem } from "../../core/types";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

function fakeClient() {
  const inbox = vi.fn(async (_opts: Record<string, unknown>) => []);
  const client = {
    inbox,
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unreadTotal: vi.fn(async () => 0),
  } as unknown as ChatClient;
  return { client, inbox };
}

describe("ChatInboxScreen", () => {
  it("passes kinds and excludeKinds to the inbox, so an app can keep support tickets out of Messages", async () => {
    const { client, inbox } = fakeClient();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <GenesisModulesProvider modules={{}}>
          <ChatProvider client={client} userId={ME}>
            <NativeToastProvider>
              <ChatNativeProvider>
                <ChatInboxScreen onOpen={() => {}} excludeKinds={["support"]} kinds={["direct", "group"]} />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(inbox).toHaveBeenCalled());
    expect(inbox.mock.calls[0]![0]).toMatchObject({ kinds: ["direct", "group"], excludeKinds: ["support"] });
  });

  it("carries a conversation's muted and pinned onto its row, for the bell-slash and the pin", () => {
    const item: ChatInboxItem = {
      conversationId: "c",
      kind: "direct",
      title: "Ben",
      subjectType: null,
      subjectId: null,
      status: "open",
      role: "member",
      otherUserId: null,
      memberCount: 2,
      lastSeq: 1,
      lastReadSeq: 0,
      unread: 1,
      mentioned: false,
      muted: true,
      pinned: true,
      archived: false,
      lastMessageAt: null,
      lastMessage: null,
    };
    const ctx = { me: ME, copy: chatNativeCopy, person: () => undefined };
    expect(inboxRow(item, ctx)).toMatchObject({ muted: true, pinned: true });
    expect(inboxRow({ ...item, muted: false, pinned: false }, ctx)).toMatchObject({ muted: false, pinned: false });
  });
});
