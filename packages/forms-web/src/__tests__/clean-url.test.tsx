// @feat:forms-web
// The app's src/test/clean-url.test.ts, moved with the code.
import { describe, expect, it, vi } from "vitest";
import { hideQueryOnLoad, HIDDEN_QUERY_KEEP_MS, wasReload } from "../clean-url";

function fakeWindow(search: string) {
  const store = new Map<string, string>();
  return {
    location: { pathname: "/f/feedback", search, hash: "", replace: vi.fn() },
    history: { state: { k: 1 }, replaceState: vi.fn() },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    store,
  };
}

describe("hideQueryOnLoad", () => {
  it("takes the query out of the address bar and keeps the history state", () => {
    const win = fakeWindow("?about=coaching&coach=abc");
    expect(hideQueryOnLoad(win, false, 1000)).toBe("hidden");
    expect(win.history.replaceState).toHaveBeenCalledWith({ k: 1 }, "", "/f/feedback");
    expect(JSON.parse(win.store.get("form-query:/f/feedback")!)).toEqual({ search: "?about=coaching&coach=abc", at: 1000 });
  });

  it("uses the browser's own replaceState, not the router's patched one", () => {
    const native = vi.fn<(data: unknown, unused: string, url: string) => void>();
    const history = Object.create({ replaceState: native }) as {
      state: unknown;
      replaceState: typeof native;
    };
    history.state = { k: 1 };
    history.replaceState = vi.fn(); // what TanStack's history installs on the instance
    const win = { ...fakeWindow("?about=coaching"), history };
    hideQueryOnLoad(win, false, 1000);
    expect(native).toHaveBeenCalledWith({ k: 1 }, "", "/f/feedback");
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("brings the query back on a reload in the same tab", () => {
    const win = fakeWindow("?about=coaching");
    hideQueryOnLoad(win, false, 1000);
    win.location.search = "";
    expect(hideQueryOnLoad(win, true, 2000)).toBe("restoring");
    expect(win.location.replace).toHaveBeenCalledWith("/f/feedback?about=coaching");
  });

  it("doesn't bring it back on a fresh visit, or after it has expired", () => {
    const win = fakeWindow("?about=coaching");
    hideQueryOnLoad(win, false, 1000);
    win.location.search = "";
    expect(hideQueryOnLoad(win, false, 2000)).toBe("none");
    const late = fakeWindow("?about=coaching");
    hideQueryOnLoad(late, false, 1000);
    late.location.search = "";
    expect(hideQueryOnLoad(late, true, 1000 + HIDDEN_QUERY_KEEP_MS + 1)).toBe("none");
    expect(late.location.replace).not.toHaveBeenCalled();
  });

  it("does nothing without a query", () => {
    const win = fakeWindow("");
    expect(hideQueryOnLoad(win, false)).toBe("none");
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("leaves the query visible when storage is blocked", () => {
    const win = fakeWindow("?edit=t");
    win.sessionStorage.setItem = () => {
      throw new Error("SecurityError");
    };
    expect(hideQueryOnLoad(win, false)).toBe("none");
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
});

describe("wasReload", () => {
  it("is false on a page load that wasn't a reload", () => {
    expect(wasReload()).toBe(false);
  });
});
