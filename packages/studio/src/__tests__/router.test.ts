import { describe, expect, it, vi } from "vitest";
import { createSearchParamsRouter, locationFromSearchParams, searchParamsFromLocation } from "../router";

describe("studio URL state", () => {
  it("round-trips through query parameters and keeps the app's own", () => {
    const base = new URLSearchParams("tab=admin&page=9");
    const params = searchParamsFromLocation({ resource: "public.clients", page: 3, sort: "name:desc", search: "ana" }, base);
    expect(params.toString()).toBe("tab=admin&table=public.clients&page=3&sort=name%3Adesc&q=ana");
    expect(locationFromSearchParams(params)).toEqual({ resource: "public.clients", page: 3, sort: "name:desc", search: "ana" });
  });

  it("drops page 1 and ignores a nonsense page", () => {
    expect(searchParamsFromLocation({ resource: "public.t", page: 1 }).toString()).toBe("table=public.t");
    expect(locationFromSearchParams(new URLSearchParams("table=public.t&page=-2"))).toEqual({ resource: "public.t" });
  });

  it("adapts a search-params router", () => {
    const setParams = vi.fn();
    const router = createSearchParamsRouter(new URLSearchParams("table=public.a&keep=1"), setParams);
    expect(router.location).toEqual({ resource: "public.a" });
    router.navigate({ resource: "public.b" }, { replace: true });
    expect(setParams.mock.calls[0]![0].toString()).toBe("keep=1&table=public.b");
    expect(setParams.mock.calls[0]![1]).toEqual({ replace: true });
  });
});
