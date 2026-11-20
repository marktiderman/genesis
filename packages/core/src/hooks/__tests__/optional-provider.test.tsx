// @vitest-environment happy-dom
// The data provider is needed to read or write, not to render a hook that does neither (a
// ResourcePage over rows it was given): an enabled read still fails as it renders, and a disabled
// hook's first write fails with the same error.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useResource } from "../use-resource";
import { useOne } from "../use-one";
import { requireDataProvider, useOptionalDataProvider } from "../../provider/context";

const MISSING = "useDataProvider must be used inside <DataProviderRoot> or <GenesisProvider>";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("a hook without a data provider", () => {
  it("has none to offer, and says so when one is required", () => {
    const { result } = renderHook(() => useOptionalDataProvider(), { wrapper: wrapper() });
    expect(result.current).toBeNull();
    expect(() => requireDataProvider(null)).toThrow(MISSING);
  });

  it("throws as it renders when it reads", () => {
    expect(() => renderHook(() => useResource("posts"), { wrapper: wrapper() })).toThrow(MISSING);
    expect(() => renderHook(() => useOne("posts", "1"), { wrapper: wrapper() })).toThrow(MISSING);
  });

  it("renders disabled, and rejects its first write", async () => {
    const { result } = renderHook(() => useResource("posts", { enabled: false, onError: () => undefined }), { wrapper: wrapper() });
    expect(result.current.list.isPending).toBe(true);
    let failure: unknown;
    await act(async () => {
      await result.current.create({ title: "x" }).catch((error: unknown) => (failure = error));
    });
    expect(String(failure)).toContain(MISSING);
  });
});
