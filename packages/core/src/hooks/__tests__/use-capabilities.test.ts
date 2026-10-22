import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
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
