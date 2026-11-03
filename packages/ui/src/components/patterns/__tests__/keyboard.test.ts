/**
 * isAppShortcutTarget: the guard between a lightbox's `onKey` shortcuts and
 * everything that must keep its own keys (fields, menus, sliders, the OS).
 */
import { describe, expect, it } from "vitest";

import { isAppShortcutTarget } from "../keyboard";

function keydownOn(target: Element | null, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true, ...init });
  if (target) {
    let captured: KeyboardEvent | null = null;
    const listener = (e: Event) => {
      captured = e as KeyboardEvent;
    };
    document.addEventListener("keydown", listener, { once: true });
    target.dispatchEvent(event);
    document.removeEventListener("keydown", listener);
    return captured ?? event;
  }
  return event;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("isAppShortcutTarget", () => {
  it("accepts a plain keydown on a neutral element", () => {
    const div = mount("<div tabindex='0'></div>");
    expect(isAppShortcutTarget(keydownOn(div))).toBe(true);
  });

  it("rejects an event something already claimed", () => {
    const div = mount("<div></div>");
    const event = keydownOn(div);
    event.preventDefault();
    expect(isAppShortcutTarget(event)).toBe(false);
  });

  it("rejects ctrl / meta / alt chords", () => {
    const div = mount("<div></div>");
    expect(isAppShortcutTarget(keydownOn(div, { ctrlKey: true }))).toBe(false);
    expect(isAppShortcutTarget(keydownOn(div, { metaKey: true }))).toBe(false);
    expect(isAppShortcutTarget(keydownOn(div, { altKey: true }))).toBe(false);
    // Shift is part of ordinary typing ("F"), so it passes.
    expect(isAppShortcutTarget(keydownOn(div, { shiftKey: true }))).toBe(true);
  });

  it.each(["input", "textarea", "select", "video", "audio"])("rejects focus in a <%s>", (tag) => {
    const el = mount(`<${tag}></${tag}>`);
    expect(isAppShortcutTarget(keydownOn(el))).toBe(false);
  });

  it("rejects contenteditable, including an ancestor", () => {
    const root = mount("<div contenteditable='true'><span><b>x</b></span></div>");
    const inner = root.querySelector("b")!;
    expect(isAppShortcutTarget(keydownOn(inner))).toBe(false);
    const off = mount("<div contenteditable='false'><b>x</b></div>");
    expect(isAppShortcutTarget(keydownOn(off.querySelector("b")!))).toBe(true);
  });

  it.each(["listbox", "menu", "slider", "combobox", "radiogroup", "tablist"])(
    "rejects focus inside role=%s",
    (role) => {
      const root = mount(`<div role="${role}"><div tabindex="0">opt</div></div>`);
      expect(isAppShortcutTarget(keydownOn(root.firstElementChild!))).toBe(false);
    },
  );

  it("still accepts focus inside a role it does not list (a dialog, say)", () => {
    const root = mount('<div role="dialog"><button>ok</button></div>');
    expect(isAppShortcutTarget(keydownOn(root.firstElementChild!))).toBe(true);
  });
});
