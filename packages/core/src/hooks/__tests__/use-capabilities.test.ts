import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { DataProvider } from "../../provider/types";
import { providerServesUndo } from "../mutation-mode";
import { capabilitiesQueryKey } from "../use-capabilities";

describe("capabilitiesQueryKey", () => {
  it("is stable for one provider and resource", () => {
    const provider = {};
    expect(capabilitiesQueryKey(provider, "tasks")).toEqual(capabilitiesQueryKey(provider, "tasks"));
    expect(capabilitiesQueryKey(provider, undefined)).toEqual(capabilitiesQueryKey(provider, ""));
  });

  it("differs between providers, so a swapped provider is asked again", async () => {
    const a = { capabilities: async () => ({ softDelete: true }) };
    const b = { capabilities: async () => ({ softDelete: false }) };
    expect(capabilitiesQueryKey(a, "tasks")).not.toEqual(capabilitiesQueryKey(b, "tasks"));

    // One QueryClient kept across the swap, as GenesisProvider does.
    const client = new QueryClient();
    const fetch = (p: typeof a) =>
      client.fetchQuery({ queryKey: capabilitiesQueryKey(p, "tasks"), queryFn: () => p.capabilities(), staleTime: Infinity });
    expect((await fetch(a)).softDelete).toBe(true);
    expect((await fetch(b)).softDelete).toBe(false);
    client.clear();
  });
});

describe("providerServesUndo", () => {
  it("shares useCapabilities' provider-scoped cache, so a swapped provider is asked itself", async () => {
    const client = new QueryClient();
    const undo = async () => ({}) as never;
    const a = { undo, capabilities: vi.fn(async () => ({ undo: true })) } as unknown as DataProvider;
    const b = { undo, capabilities: vi.fn(async () => ({ undo: false })) } as unknown as DataProvider;
    expect(await providerServesUndo(client, a, "tasks")).toBe(true);
    // The answer sits under the key useCapabilities reads.
    expect(client.getQueryData(capabilitiesQueryKey(a, "tasks"))).toEqual({ undo: true });
    // Another provider on the same QueryClient is not offered a's undo.
    expect(await providerServesUndo(client, b, "tasks")).toBe(false);
    expect(b.capabilities).toHaveBeenCalledWith("tasks");
    // Cached per provider: a is not asked again.
    expect(await providerServesUndo(client, a, "tasks")).toBe(true);
    expect(a.capabilities).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
