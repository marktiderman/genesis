// @vitest-environment happy-dom
/**
 * @feat:sites-editor
 * `<SiteEditor>` mounted on the memory store: view-only mode, the canvas and
 * autosaves held while a publish runs, and unsaved changes saved (and
 * reported) when the editor goes away.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../sections/index";
import { createMemorySiteStore, type PageDoc, type SiteStore } from "../index";
import { SiteEditor, type SiteEditorProps } from "../editor/site-editor";
import { brand } from "./fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A site that passes the publish checks: one page with a hero, no header or footer. */
async function publishableSite() {
  const store = createMemorySiteStore();
  const doc: PageDoc = {
    schemaVersion: 1,
    root: { props: { title: "Home" } },
    // No variant: a publish writes the default one back, so it re-saves this draft on a new revision.
    content: [{ id: "hero1", type: "hero", v: 1, props: { heading: "Train with people who know your name" } }],
  };
  const { siteId, pageIds } = await store.createSite({ site: { schemaVersion: 1, name: "Example Gym" }, pages: [{ path: "/", doc }] });
  return { store, siteId, home: pageIds[0]! };
}

let mounted: { root: Root; el: HTMLElement } | null = null;

afterEach(async () => {
  if (mounted) await act(async () => mounted!.root.unmount());
  mounted?.el.remove();
  mounted = null;
});

async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
}

async function waitFor<T>(find: () => T | null | undefined | false, what: string, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}. The page says: ${document.body.textContent?.slice(0, 600)}`);
    await settle(1);
  }
}

async function mount(props: Partial<SiteEditorProps> & Pick<SiteEditorProps, "siteId" | "store">) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounted = { root, el };
  await act(async () => root.render(<SiteEditor brand={brand} siteStylesheet="/sites.css" autosaveDelay={60_000} {...props} />));
  await waitFor(() => el.querySelector("[data-gs-editor]"), "the editor to open");
  await settle();
  return el;
}

const buttons = (el: HTMLElement, name: string) => [...el.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name);

/** The input a label names, or null. */
function findField(el: HTMLElement, label: string): HTMLInputElement | null {
  const l = [...el.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  return l?.htmlFor ? (el.ownerDocument.getElementById(l.htmlFor) as HTMLInputElement | null) : null;
}

function field(el: HTMLElement, label: string): HTMLInputElement {
  const input = findField(el, label);
  if (!input) throw new Error(`No field labelled ${label}.`);
  return input;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** Radix tabs switch on mouse down. */
async function openTab(el: HTMLElement, name: string) {
  const tab = [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === name) as HTMLElement | undefined;
  if (!tab) throw new Error(`No ${name} tab.`);
  await act(async () => {
    tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
  await settle();
}

const tabNames = (el: HTMLElement) => [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());

describe("SiteEditor readOnly", () => {
  it("shows the site with nothing to change, publish or roll back, and never saves", async () => {
    const { store, siteId } = await publishableSite();
    await store.publish(siteId, { brand });
    await store.publish(siteId, { brand }); // Two releases, so one could be rolled back to.
    const saves = [vi.spyOn(store, "savePageDraft"), vi.spyOn(store, "saveSiteDraft"), vi.spyOn(store, "publish"), vi.spyOn(store, "rollback")];
    const el = await mount({ siteId, store, readOnly: true });

    expect(el.querySelector('[role="note"]')?.textContent).toMatch(/View only/);
    expect(el.querySelector('[role="status"]')?.textContent).toBe("View only");
    expect(tabNames(el)).not.toContain("Add");
    expect(el.querySelector("[data-gs-drawer]")).toBeNull();
    // Puck's fields honour the permissions: the page title can't be typed into.
    expect(field(el, "Page title").disabled).toBe(true);

    await openTab(el, "Pages");
    expect(buttons(el, "Add page")).toEqual([]);
    expect(el.querySelector('[aria-label^="Delete "]')).toBeNull();
    expect(buttons(el, "Edit the footer")).toEqual([]);

    await openTab(el, "Releases");
    await waitFor(() => el.textContent?.includes("Release 1"), "the release history");
    expect(buttons(el, "Publish site")).toEqual([]);
    expect(el.querySelector('[aria-label^="Roll back"]')).toBeNull();
    expect(field(el, "Search title").disabled).toBe(true);

    await act(async () => mounted!.root.unmount());
    mounted = null;
    await settle();
    for (const spy of saves) expect(spy).not.toHaveBeenCalled();
  });
});

describe("SiteEditor unsaved changes", () => {
  it("reports them, and saves them when the editor goes away before the autosave", async () => {
    const { store, siteId, home } = await publishableSite();
    const save = vi.spyOn(store, "savePageDraft");
    const onDirtyChange = vi.fn();
    const el = await mount({ siteId, store, onDirtyChange });
    expect(onDirtyChange).not.toHaveBeenCalled();

    await type(field(el, "Page title"), "Home, renamed");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(save).not.toHaveBeenCalled(); // The autosave is a minute away.

    await act(async () => mounted!.root.unmount());
    mounted = null;
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect((await store.getPageDraft(home))!.doc.root.props.title).toBe("Home, renamed");
  });

  it("reports false again once the change is saved", async () => {
    const { store, siteId } = await publishableSite();
    const onDirtyChange = vi.fn();
    const el = await mount({ siteId, store, onDirtyChange, autosaveDelay: 0 });
    await type(field(el, "Page title"), "Home again");
    await waitFor(() => onDirtyChange.mock.calls.at(-1)?.[0] === false, "the save to land");
    expect(onDirtyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});

describe("SiteEditor publishing", () => {
  it("holds the canvas and the autosaves while a publish runs, then saves on the new revision", async () => {
    const { store, siteId, home } = await publishableSite();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const realPublish = store.publish.bind(store);
    const publish = vi.spyOn(store, "publish").mockImplementation(async (...args: Parameters<SiteStore["publish"]>) => {
      await gate;
      return realPublish(...args);
    });
    const save = vi.spyOn(store, "savePageDraft");
    const el = await mount({ siteId, store, autosaveDelay: 0 });

    await openTab(el, "Publish");
    const button = await waitFor(() => buttons(el, "Publish site").find((b) => !b.disabled), "the checks to pass");
    await act(async () => button.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => publish.mock.calls.length > 0, "the publish to start");

    // While it runs: the canvas is read-only, undo is off, and the status says so.
    expect(el.querySelector('[role="status"]')?.textContent).toBe("Publishing…");
    await openTab(el, "Edit");
    expect(field(el, "Page title").disabled).toBe(true);
    expect((el.querySelector('[aria-label="Undo"]') as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();

    await act(async () => release());
    await waitFor(() => el.textContent?.includes("Published release 1"), "the publish to finish");
    await settle();
    // The publish re-saved the page (it wrote the default variant), so its revision moved.
    const after = (await store.getPageDraft(home))!;
    expect(after.rev).toBe(2);
    // The canvas reopens on what the store has now, editable again.
    await waitFor(() => findField(el, "Page title")?.disabled === false, "the canvas to unlock");

    // The editor adopted that revision: the next edit saves, with no conflict.
    await type(field(el, "Page title"), "After publishing");
    await waitFor(() => save.mock.calls.length > 0 && el.querySelector('[role="status"]')?.textContent === "All changes saved", "the save");
    expect(save.mock.calls[0]![1]).toBe(2);
    const saved = (await store.getPageDraft(home))!;
    expect(saved.rev).toBe(3);
    expect(saved.doc.root.props.title).toBe("After publishing");
    expect(el.textContent).not.toMatch(/Someone else saved/);
  });
});
