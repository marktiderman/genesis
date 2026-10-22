import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installChromeFake, type ChromeFake } from "../testing";
import {
  createPrefs,
  createRouter,
  isMac,
  mountSurfaceFrame,
  openSurface,
  renderPageBar,
  request,
  shortcutKeys,
  startNativeJob,
  syncSidePanel,
} from "../index";

let fake: ChromeFake;
beforeEach(() => {
  fake = installChromeFake();
  document.documentElement.replaceChildren(
    document.createElement("head"),
    document.createElement("body"),
  );
});
afterEach(() => fake.uninstall());

describe("messaging", () => {
  it("answers the extension's pages, and content scripts only for their own types", async () => {
    const router = createRouter({
      pages: {
        SAVE: (m) => ({ saved: m.title }),
        FAIL: () => Promise.reject(new Error("nope")),
      },
      content: { HIDE: (_m, { tab }) => ({ tab: tab.id }) },
    });
    expect(
      await fake.deliver({ type: "SAVE", title: "A" }, fake.pageSender()),
    ).toEqual({ saved: "A" });
    expect(await fake.deliver({ type: "HIDE" }, fake.contentSender(7))).toEqual(
      { tab: 7 },
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
    expect(
      await fake.deliver({ type: "SAVE" }, fake.pageSender()),
    ).toBeUndefined();
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

  it("mounts the page in a pinned, closed frame, and toggles it", () => {
    const src =
      "chrome-extension://testextensionid/popup.html?tab=3&panel=1&bar=1";
    expect(mountSurfaceFrame(src, "bar")).toBe("opened");
    const host = document.documentElement.lastElementChild as HTMLElement;
    expect(host.shadowRoot).toBeNull(); // closed: the page can't reach in
    expect(host.getAttribute("style")).toContain("top: 0 !important");
    expect(mountSurfaceFrame(src, "bar")).toBe("closed");
    expect(host.isConnected).toBe(false);
  });

  it("opens the frame through scripting, and reopens rather than closes when asked", async () => {
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
    expect(await job.waitFor("downloaded")).toMatchObject({ size: 10 });
    job.post({ type: "upload" });
    expect(await job.done).toMatchObject({ type: "done", token: "fresh" });
    expect(progress).toEqual([50]);
  });

  it("fails on the helper's error, and on a cancel", async () => {
    fake.nativeHost("com.acme.helper", (_m, reply) =>
      reply({ type: "error", message: "No video here" }),
    );
    await expect(
      startNativeJob("com.acme.helper", { type: "grab" }).done,
    ).rejects.toThrow("No video here");
    fake.nativeHost("com.acme.slow", () => {});
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
