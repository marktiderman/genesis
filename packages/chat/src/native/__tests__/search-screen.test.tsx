// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";
import { ChatSearchScreen } from "../search-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

describe("ChatSearchScreen", () => {
  it("opens on initialQuery, so a query typed in the inbox carries over", async () => {
    const search = vi.fn(async (_query: string) => [] as unknown[]);
    const client = {
      search,
      inbox: vi.fn(async () => []),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
      people: vi.fn(async () => []),
    } as unknown as ChatClient;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <GenesisModulesProvider modules={{}}>
          <ChatProvider client={client} userId={ME}>
            <NativeToastProvider>
              <ChatNativeProvider>
                <ChatSearchScreen onOpen={() => {}} initialQuery="invoice" />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search.mock.calls[0]![0]).toBe("invoice");
  });

  it("leaves out hits outside scope", async () => {
    const hit = (id: string, conversationId: string) => ({ id, messageId: id, conversationId, seq: 1, senderId: null, snippet: `invoice from ${conversationId}`, createdAt: "2026-11-01T00:00:00Z" });
    const search = vi.fn(async (_query: string) => [hit("m1", "inside"), hit("m2", "outside")] as unknown[]);
    const client = {
      search,
      inbox: vi.fn(async () => []),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
      people: vi.fn(async () => []),
    } as unknown as ChatClient;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={qc}>
        <GenesisModulesProvider modules={{}}>
          <ChatProvider client={client} userId={ME}>
            <NativeToastProvider>
              <ChatNativeProvider>
                <ChatSearchScreen onOpen={() => {}} initialQuery="invoice" scope={(h) => h.conversationId === "inside"} />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(view.container.textContent).toContain("from inside"));
    expect(view.container.textContent).not.toContain("from outside");
    // Scope filters on the device, so it asks for the search's largest page.
    expect((search.mock.calls[0] as unknown[])[2]).toEqual({ limit: 100 });
  });

  it("doesn't reuse an unscoped search's smaller page for a scoped one", async () => {
    const search = vi.fn(async (_query: string) => [] as unknown[]);
    const client = {
      search,
      inbox: vi.fn(async () => []),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
      people: vi.fn(async () => []),
    } as unknown as ChatClient;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (scoped: boolean) => (
      <QueryClientProvider client={qc}>
        <GenesisModulesProvider modules={{}}>
          <ChatProvider client={client} userId={ME}>
            <NativeToastProvider>
              <ChatNativeProvider>
                <ChatSearchScreen onOpen={() => {}} initialQuery="invoice" {...(scoped ? { scope: () => true } : {})} />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>
    );
    const first = render(tree(false));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    first.unmount();
    render(tree(true));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect((search.mock.calls[1] as unknown[])[2]).toEqual({ limit: 100 });
  });
});
