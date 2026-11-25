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
                <ChatSearchScreen onOpen={() => {}} initialQuery="invoice" debounceMs={0} />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search.mock.calls[0]![0]).toBe("invoice");
  });
});
