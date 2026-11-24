// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../../core/client";
import { ChatProvider, useFileUrls, usePeople, usePins } from "../../react/index";

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

function wrap(client: ChatClient, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ChatProvider client={client} userId={ME}>
        {children}
      </ChatProvider>
    </QueryClientProvider>
  );
}

describe("the read hooks' empty results", () => {
  it("are the same object on every render, so a row's memo holds while someone types", () => {
    const client = { fileUrls: vi.fn(async () => ({})), pins: vi.fn(async () => []), subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })) } as unknown as ChatClient;
    const seen: unknown[][] = [];
    let rerender: () => void = () => undefined;
    function Probe() {
      const [, set] = useState(0);
      rerender = () => set((n) => n + 1);
      seen.push([useFileUrls([]), usePeople([]), usePins(null)]);
      return null;
    }
    render(wrap(client, <Probe />));
    act(() => rerender());
    act(() => rerender());
    const [first, ...rest] = seen;
    for (const s of rest) s.forEach((v, i) => expect(v).toBe(first![i]));
  });
});

describe("useFileUrls", () => {
  it("keeps the links it has while a new photo's link is signed, instead of blanking every photo", async () => {
    let release: (v: Record<string, string>) => void = () => undefined;
    const fileUrls = vi.fn(async (paths: string[]) => {
      if (paths.length === 1) return { a: "https://x/a?sig=1" };
      return new Promise<Record<string, string>>((r) => (release = r));
    });
    const client = { fileUrls, subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })) } as unknown as ChatClient;
    const seen: Record<string, string>[] = [];
    let setPaths: (p: string[]) => void = () => undefined;
    function Probe() {
      const [paths, set] = useState<string[]>(["a"]);
      setPaths = set;
      seen.push(useFileUrls(paths));
      return null;
    }
    render(wrap(client, <Probe />));
    await waitFor(() => expect(seen.at(-1)).toEqual({ a: "https://x/a?sig=1" }));
    act(() => setPaths(["a", "b"]));
    // Loading the new set: the old links are still there.
    expect(seen.at(-1)).toEqual({ a: "https://x/a?sig=1" });
    await act(async () => release({ a: "https://x/a?sig=1", b: "https://x/b?sig=1" }));
    await waitFor(() => expect(seen.at(-1)).toEqual({ a: "https://x/a?sig=1", b: "https://x/b?sig=1" }));
  });
});
