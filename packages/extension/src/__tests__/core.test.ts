// @feat:chrome-extensions
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeFake, type ChromeFake } from "../testing";
import {
  connectSurface,
  createPrefs,
  createRouter,
  isFromContentScript,
  isFromExtensionPage,
  isMac,
  openSurface,
  request,
  shortcutKeys,
  startNativeJob,
  syncSidePanel,
} from "../index";
import { mountSurfaceFrame, resetSurfaceForTests } from "../surfaces";
import { renderPageBar } from "../page-bar";

let fake: ChromeFake;
beforeEach(() => {
  fake = installChromeFake();
  document.documentElement.replaceChildren(
    document.createElement("head"),
    document.createElement("body"),
  );
});
afterEach(() => {
  fake.uninstall();
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).__gxSurface;
});

describe("messaging", () => {
  it("answers the extension's pages, and content scripts only for their own types", async () => {
    const router = createRouter({
      pages: {
        SAVE: (m) => ({ saved: m.title }),
        FAIL: () => Promise.reject(new Error("nope")),
      },
      content: { HIDE: (_m, { tab, frameId }) => ({ tab: tab.id, frameId }) },
    });
    expect(
      await fake.deliver({ type: "SAVE", title: "A" }, fake.pageSender()),
    ).toEqual({
      saved: "A",
    });
    expect(await fake.deliver({ type: "HIDE" }, fake.contentSender(7))).toEqual(
      {
        tab: 7,
        frameId: 0,
      },
    );
    // A page's script can't ask for what only the extension's pages may.
    expect(
      await fake.deliver({ type: "SAVE", title: "A" }, fake.contentSender(7)),
    ).toBeUndefined();
    // Nor can another extension.
    expect(
      await fake.deliver(
        { type: "SAVE" },
        { id: "other", url: "chrome-extension://other/x.html" },
      ),
    ).toBeUndefined();
    await expect(request("FAIL")).rejects.toThrow("nope");
    expect(await request("SAVE", { title: "B" })).toEqual({ saved: "B" });
    router.stop();
    await expect(request("SAVE")).rejects.toThrow(
      /Receiving end does not exist/,
    );
  });

  it("knows its own page framed in a tab under a dynamic address from a content script", () => {
    // use_dynamic_url: the framed page's address has a per-session id.
    const framed = {
      id: "testextensionid",
      url: "chrome-extension://0f3c9a2e-session/popup.html?panel=1",
      tab: { id: 3, url: "https://example.com/" },
      frameId: 12,
    };
    expect(isFromExtensionPage(framed)).toBe(true);
    expect(isFromContentScript(framed)).toBe(false);
    expect(isFromContentScript(fake.contentSender(3))).toBe(true);
    expect(isFromExtensionPage(fake.contentSender(3))).toBe(false);
  });
});

describe("prefs", () => {
  it("starts from defaults, merges quick writes, and tells subscribers", async () => {
    const prefs = createPrefs("acme", {
      mode: "panel",
      tags: [] as string[],
      on: false,
    });
    expect(await prefs.get()).toEqual({ mode: "panel", tags: [], on: false });
    const seen: unknown[] = [];
    const stop = prefs.subscribe((p) => seen.push(p.mode));
    await Promise.all([prefs.set({ mode: "side" }), prefs.set({ on: true })]);
    expect(await prefs.get()).toEqual({ mode: "side", tags: [], on: true });
    expect(seen).toEqual(["side", "side"]);
    stop();
  });

  it("two pages writing at once don't overwrite each other (a Web Lock per key)", async () => {
    // A lock manager shared by every "page", as navigator.locks is.
    const held = new Map<string, Promise<unknown>>();
    const locks = {
      request: (name: string, fn: () => Promise<unknown>) => {
        const prev = held.get(name) || Promise.resolve();
        const next = prev.then(fn, fn);
        held.set(
          name,
          next.catch(() => undefined),
        );
        return next;
      },
    };
    vi.spyOn(globalThis.navigator, "locks", "get").mockReturnValue(
      locks as unknown as LockManager,
    );
    const pageA = createPrefs("acme", { a: 0, b: 0 });
    const pageB = createPrefs("acme", { a: 0, b: 0 }); // its own write chain, as another page has
    await Promise.all([pageA.set({ a: 1 }), pageB.set({ b: 2 })]);
    expect(await pageA.get()).toEqual({ a: 1, b: 2 });
  });
});

describe("surfaces", () => {
  it("has Chrome open the side panel on the icon only in side mode", async () => {
    await syncSidePanel("side");
    expect(fake.sidePanelCalls.behavior).toEqual({
      openPanelOnActionClick: true,
    });
    await syncSidePanel("bar");
    expect(fake.sidePanelCalls.behavior).toEqual({
      openPanelOnActionClick: false,
    });
    await openSurface(
      { id: 3, windowId: 9 },
      { page: "popup.html", mode: "side" },
    );
    expect(fake.sidePanelCalls.open).toEqual([{ windowId: 9 }]);
  });

  it("falls back to the floating panel when the side panel can't open", async () => {
    fake.sidePanel!.open = () => Promise.reject(new Error("No user gesture"));
    expect(
      await openSurface(
        { id: 3, windowId: 9 },
        { page: "popup.html", mode: "side" },
      ),
    ).toBe("opened");
    expect(
      (globalThis as { __gxSurface?: { host: Element } }).__gxSurface?.host
        .isConnected,
    ).toBe(true);
  });

  it("hands the frame a private line, never posting to the page, and closes if it's navigated", async () => {
    let toPage = 0;
    const realPost = window.postMessage;
    window.postMessage = (() =>
      void (toPage += 1)) as typeof window.postMessage;
    const src =
      "chrome-extension://testextensionid/popup.html?tab=3&panel=1&bar=1";
    expect(mountSurfaceFrame(src, "bar")).toBe("opened");
    const state = (
      globalThis as {
        __gxSurface?: { host: HTMLElement; frame: HTMLIFrameElement };
      }
    ).__gxSurface!;
    expect(state.host.shadowRoot).toBeNull(); // closed: the page can't reach in
    expect(state.host.getAttribute("style")).toContain("top: 0 !important");
    // Plain values only: a MessagePort held by a mock trips vitest's formatter.
    let got: { type?: string; origin?: string; port?: boolean } = {};
    let offered: MessagePort | null = null;
    expect(state.frame.name).toBe(""); // the secret is never put on the frame
    expect(state.frame.src).not.toContain("#");
    const wrap = state.frame.parentElement as HTMLElement;
    expect(wrap.style.visibility).toBe("hidden"); // blank until the surface answers
    // ...and lets the page's clicks through until then.
    expect(state.host.getAttribute("style")).toContain(
      "pointer-events: none !important",
    );
    const frameWindow = {
      postMessage: (
        m: { type: string; nonce?: string },
        origin: string,
        transfer: unknown[],
      ) => {
        offered = transfer?.[0] as MessagePort;
        got = {
          type: m.type,
          origin,
          port: typeof offered?.postMessage === "function",
        };
      },
    };
    Object.defineProperty(state.frame, "contentWindow", { value: frameWindow });
    state.frame.dispatchEvent(new Event("load"));
    window.postMessage = realPost;
    // Offered to the frame only, at the extension's own origin (not the
    // per-session address `src` has), with a line of its own.
    expect(got).toEqual({
      type: "gx-connect",
      origin: "chrome-extension://testextensionid",
      port: true,
    });
    expect(toPage).toBe(0);
    offered!.postMessage({ type: "gx-hello" });
    await new Promise((r) => setTimeout(r, 20));
    expect(wrap.style.visibility).toBe("visible");
    expect(state.host.getAttribute("style")).toContain(
      "pointer-events: auto !important",
    );
    // The page sets frames[0].location: a second load closes the frame.
    const host = state.host;
    state.frame.dispatchEvent(new Event("load"));
    expect(host.isConnected).toBe(false);
  });

  it("toggles, and reopens rather than closes when asked", async () => {
    const tab = { id: 4, windowId: 1 };
    expect(await openSurface(tab, { page: "popup.html", mode: "panel" })).toBe(
      "opened",
    );
    expect(
      await openSurface(tab, { page: "popup.html", mode: "panel", open: true }),
    ).toBe("opened");
    expect(await openSurface(tab, { page: "popup.html", mode: "panel" })).toBe(
      "closed",
    );
  });

  it("in the page, listens only on the line its secret came with", async () => {
    history.replaceState(null, "", "/popup.html?tab=3&panel=1&bar=1");
    resetSurfaceForTests();
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    const asked: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((m: unknown) => {
      asked.push(m);
    });
    // What openSurface minted for tab 3 in the service worker.
    await fake.storage.session!.set({
      "genesis-extension:surface:3:secret-nonce": { at: Date.now() },
    });
    const surface = connectSurface({ autoResize: false });
    expect(document.documentElement.style.visibility).toBe("hidden"); // until confirmed
    expect(asked).toEqual([]); // nothing goes to the page
    expect(connectSurface()).toBe(surface); // one surface per page
    expect(surface.mode).toBe("bar");
    const seen: string[] = [];
    surface.onPageChanged((url) => seen.push(url));
    // A page script forging messages to the frame's window gets nowhere.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "gx-page-changed", url: "https://evil.example/" },
        source: window.parent,
      }),
    );
    const wrong = new MessageChannel();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "gx-connect", nonce: "guess" },
        source: window.parent,
        ports: [wrong.port2],
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    surface.reportHeight(200); // waits for the real line
    const line = new MessageChannel();
    const fromFrame: unknown[] = [];
    line.port1.onmessage = (e) => fromFrame.push(e.data);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "gx-connect", nonce: "secret-nonce" },
        source: window.parent,
        ports: [line.port2],
      }),
    );
    expect(await surface.ready).toBe(true);
    expect(document.documentElement.style.visibility).toBe("");
    // Used up: the same secret can't confirm a second page.
    expect(
      await fake.storage.session!.get("genesis-extension:surface:3:secret-nonce"),
    ).toEqual({});
    line.port1.postMessage({
      type: "gx-page-changed",
      url: "https://example.com/next",
    });
    surface.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["https://example.com/next"]);
    expect(fromFrame).toEqual([
      { type: "gx-hello" },
      { type: "gx-resize", height: 200 },
      { type: "gx-close" },
    ]);
  });
});

describe("surface secret", () => {
  it("a surface a web page framed itself stays hidden and never connects", async () => {
    // No "panel" in the address: being framed is enough to need confirming.
    history.replaceState(null, "", "/popup.html?tab=3");
    resetSurfaceForTests();
    await fake.storage.session!.set({
      "genesis-extension:surface:3:minted": { at: Date.now() },
    });
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const surface = connectSurface({ autoResize: false });
    expect(surface.mode).toBe("panel");
    expect(document.documentElement.style.visibility).toBe("hidden");
    const line = new MessageChannel();
    const fromFrame: unknown[] = [];
    line.port1.onmessage = (e) => fromFrame.push(e.data);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "gx-connect", nonce: "page-chosen" },
        source: window.parent,
        ports: [line.port2],
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();
    expect(await surface.ready).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(fromFrame).toEqual([]);
    expect(document.documentElement.style.visibility).toBe("hidden");
    document.documentElement.style.visibility = "";
  });

  it("never removes a newer open's secret minted while it was checking its own", async () => {
    history.replaceState(null, "", "/popup.html?tab=3&panel=1");
    resetSurfaceForTests();
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    const area = fake.storage.session!;
    await area.set({
      "genesis-extension:surface:3:old-nonce": { at: Date.now() },
    });
    // After this frame's reads (the first and any later one), and before its
    // remove, a reopen mints the next nonce.
    const realGet = area.get.bind(area);
    vi.spyOn(area, "get").mockImplementation((async (keys: unknown) => {
      const result = await realGet(keys as string);
      await area.set({
        "genesis-extension:surface:3:new-nonce": { at: Date.now() },
      });
      return result;
    }) as typeof area.get);
    const surface = connectSurface({ autoResize: false });
    const line = new MessageChannel();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "gx-connect", nonce: "old-nonce" },
        source: window.parent,
        ports: [line.port2],
      }),
    );
    expect(await surface.ready).toBe(true);
    vi.mocked(area.get).mockRestore();
    expect(await area.get(null)).toEqual({
      "genesis-extension:surface:3:new-nonce": { at: expect.any(Number) },
    });
    surface.close();
    document.documentElement.style.visibility = "";
  });

  it("a new open clears the tab's earlier secrets, and only that tab's", async () => {
    const area = fake.storage.session!;
    await area.set({
      "genesis-extension:surface:9:earlier": { at: Date.now() },
      "genesis-extension:surface:9": { nonce: "legacy", at: Date.now() },
      "genesis-extension:surface:90:other-tab": { at: Date.now() },
    });
    await openSurface({ id: 9, windowId: 1 }, { page: "popup.html", mode: "panel" });
    const keys = Object.keys(await area.get(null));
    expect(keys).toHaveLength(2);
    expect(keys).toContain("genesis-extension:surface:90:other-tab");
    expect(keys.find((k) => k !== "genesis-extension:surface:90:other-tab")).toMatch(
      /^genesis-extension:surface:9:[0-9a-f-]{36}$/,
    );
  });

  it("openSurface mints the open's secret where only the extension reads it", async () => {
    await openSurface(
      { id: 9, windowId: 1 },
      { page: "popup.html", mode: "panel" },
    );
    const stored = await fake.storage.session!.get(null);
    const [key] = Object.keys(stored);
    expect(key).toMatch(/^genesis-extension:surface:9:[0-9a-f-]{36}$/);
    expect(stored[key!]).toEqual({ at: expect.any(Number) });
    const state = (globalThis as { __gxSurface?: { frame: HTMLIFrameElement } })
      .__gxSurface!;
    expect(state.frame.name).toBe(""); // never put on the frame
  });
});

describe("fallback window", () => {
  it("a window with ?tab= is trusted only with the secret openSurface gave it", async () => {
    vi.spyOn(window, "top", "get").mockReturnValue(window);
    await fake.storage.session!.set({
      "genesis-extension:surface:7:minted": { at: Date.now() },
    });
    history.replaceState(null, "", "/popup.html?tab=7#gx=guess");
    resetSurfaceForTests();
    const forged = connectSurface({ autoResize: false });
    expect(forged.mode).toBe("popup");
    expect(await forged.ready).toBe(false);
    expect(location.hash).toBe(""); // the fragment is cleared once read
    history.replaceState(null, "", "/popup.html?tab=7#gx=minted");
    resetSurfaceForTests();
    const real = connectSurface({ autoResize: false });
    expect(await real.ready).toBe(true);
    expect(document.documentElement.style.visibility).toBe("");
    history.replaceState(null, "", "/popup.html");
    resetSurfaceForTests();
    expect(await connectSurface({ autoResize: false }).ready).toBe(true); // a toolbar popup
    delete document.documentElement.dataset.gxUntrusted;
  });
});

describe("surface visibility", () => {
  it("counts as hidden until Chrome says it's visible, where Chrome can tell", () => {
    history.replaceState(null, "", "/popup.html?tab=3&panel=1");
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    class Entry {}
    Object.defineProperty(Entry.prototype, "isVisible", { value: false });
    vi.stubGlobal("IntersectionObserverEntry", Entry);
    resetSurfaceForTests();
    expect(connectSurface({ autoResize: false }).visible()).toBe(false);
    vi.unstubAllGlobals();
    resetSurfaceForTests();
    expect(connectSurface({ autoResize: false }).visible()).toBe(true);
  });
});

describe("page bar", () => {
  it("draws text only, sends its actions, and shrinks to a tab", async () => {
    const sent: unknown[] = [];
    createRouter({
      content: { "gx-page-bar": (m) => void sent.push([m.action, m.value]) },
    });
    // As the content script: messages carry a tab.
    fake.runtime.sendMessage = (m) => fake.deliver(m, fake.contentSender(5));
    renderPageBar({
      mark: "B",
      lead: "In Acme's library:",
      title: "<img src=x onerror=alert(1)>",
      chips: [{ label: "Draft", tone: "warning" }],
      actions: [{ id: "edit", label: "Edit", value: "r1", primary: true }],
      collapsedLabel: "✓ Saved",
    });
    const shadow = (globalThis as { __gxPageBar?: { shadow: ShadowRoot } })
      .__gxPageBar!.shadow;
    expect(shadow.querySelector("img")).toBeNull();
    expect(shadow.textContent).toContain("<img src=x onerror=alert(1)>");
    (shadow.querySelector('[data-action="edit"]') as HTMLButtonElement).click();
    (shadow.querySelector(".icon") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([
      ["edit", "r1"],
      ["collapse", undefined],
    ]);
    expect(shadow.querySelector(".tab")?.textContent).toContain("✓ Saved");
    renderPageBar(null);
    expect(
      (globalThis as { __gxPageBar?: { root: unknown } }).__gxPageBar!.root,
    ).toBeNull();
  });
});

describe("native jobs", () => {
  it("reports progress, waits for a step, answers requests and finishes", async () => {
    fake.nativeHost("com.acme.helper", (m, reply) => {
      if (m.type === "grab") {
        reply({ type: "progress", percent: 50 });
        reply({ type: "downloaded", size: 10 });
      } else if (m.type === "upload") reply({ type: "need-token" });
      else if (m.type === "token") reply({ type: "done", token: m.token });
    });
    const job = startNativeJob("com.acme.helper", { type: "grab" });
    const progress: unknown[] = [];
    job.onProgress = (m) => progress.push(m.percent);
    job.answer("need-token", () => ({ type: "token", token: "fresh" }));
    const finished = job.waitFor("done");
    expect(await job.waitFor("downloaded")).toMatchObject({ size: 10 });
    job.post({ type: "upload" });
    expect(await job.done).toMatchObject({ type: "done", token: "fresh" });
    expect(await finished).toMatchObject({ token: "fresh" }); // waiting for done is answered by success
    expect(progress).toEqual([50]);
  });

  it("fails on the helper's error, a failing reply, a timeout and a cancel", async () => {
    fake.nativeHost("com.acme.helper", (_m, reply) =>
      reply({ type: "error", message: "No video here" }),
    );
    await expect(
      startNativeJob("com.acme.helper", { type: "grab" }).done,
    ).rejects.toThrow("No video here");
    fake.nativeHost("com.acme.asks", (_m, reply) =>
      reply({ type: "need-token" }),
    );
    const asking = startNativeJob("com.acme.asks", { type: "grab" });
    asking.answer("need-token", () => {
      throw new Error("Signed out");
    });
    await expect(asking.done).rejects.toThrow("Signed out");
    fake.nativeHost("com.acme.slow", () => {});
    await expect(
      startNativeJob("com.acme.slow", { type: "grab" }, { timeoutMs: 10 }).done,
    ).rejects.toThrow("took too long");
    const job = startNativeJob("com.acme.slow", { type: "grab" });
    const waiting = job.waitFor("downloaded");
    job.close();
    await expect(job.done).rejects.toThrow("Cancelled");
    await expect(waiting).rejects.toThrow("Cancelled");
  });
});

describe("keys", () => {
  it("names keys the Mac's way on a Mac", () => {
    expect(isMac("MacIntel")).toBe(true);
    expect(shortcutKeys("Alt+Shift+S", true)).toEqual([
      "⌥ Option",
      "⇧ Shift",
      "S",
    ]);
    expect(shortcutKeys("⌥⇧S", true)).toEqual(["⌥ Option", "⇧ Shift", "S"]);
    expect(shortcutKeys("Alt+Shift+S", false)).toEqual(["Alt", "Shift", "S"]);
  });
});
