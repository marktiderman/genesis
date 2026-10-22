import { getChrome } from "./chrome";

/**
 * A thin bar across the top of a web page, drawn by the extension: "this page
 * is already in your library", say, with a few facts and buttons. It shrinks
 * to a tab in the corner. Drawn in the page's isolated world, with DOM calls
 * in a closed shadow root (the page can't restyle or read it), from data
 * only: the model is plain text, never HTML.
 *
 * A button sends `{ type: "gx-page-bar", action, value }` to the service
 * worker, from the content script, so handle it in `createRouter`'s `content`
 * handlers (which may only act on the sender's own tab). Shrinking and
 * growing send the actions "collapse" and "expand".
 */

export interface PageBarChip {
  label: string;
  tone?: "neutral" | "warning" | "accent";
}

export interface PageBarAction {
  /** Sent back as `action`. */
  id: string;
  label: string;
  /** Sent back as `value` (an item's id, say). */
  value?: string;
  primary?: boolean;
  title?: string;
}

export interface PageBarModel {
  /** A short mark for the logo (one or two letters). */
  mark: string;
  /** Plain text before the title, e.g. "In Acme's library:". */
  lead: string;
  title: string;
  chips?: PageBarChip[];
  actions?: PageBarAction[];
  /** The corner tab's text, e.g. "✓ Saved". */
  collapsedLabel: string;
  collapsed?: boolean;
}

/** Show the bar on this tab, or take it away with `null`. Pages Chrome won't touch are skipped. */
export async function showPageBar(
  tabId: number,
  model: PageBarModel | null,
): Promise<void> {
  await getChrome()
    .scripting?.executeScript({
      target: { tabId },
      func: renderPageBar,
      args: [model],
    })
    .catch(() => undefined);
}

/** Injected into the page (self-contained: it's serialized). */
export function renderPageBar(model: PageBarModel | null): void {
  const state = ((globalThis as Record<string, unknown>).__gxPageBar ||=
    {}) as {
    root?: HTMLElement | null;
    shadow?: ShadowRoot;
  };
  state.root?.remove();
  state.root = null;
  if (!model) return;
  const root = document.createElement("div");
  root.setAttribute(
    "style",
    "all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important;" +
      " right: 0 !important; z-index: 2147483646 !important; pointer-events: none !important;",
  );
  const shadow = root.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    :host { --gx-bg: #0f172a; --gx-fg: #e2e8f0; --gx-strong: #fff; --gx-muted: #94a3b8; --gx-chip: #1e293b;
      --gx-accent: #2563eb; --gx-warn-bg: #422006; --gx-warn-fg: #fcd34d; --gx-acc-bg: #3b0764; --gx-acc-fg: #e9d5ff; }
    .bar { pointer-events: auto; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 6px 12px;
      background: var(--gx-bg); color: var(--gx-fg); font-size: 13px; box-shadow: 0 2px 10px rgba(15, 23, 42, .25); }
    .logo { flex: none; width: 22px; height: 22px; border-radius: 6px; background: var(--gx-accent); color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 12px; }
    .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .what b { color: var(--gx-strong); font-weight: 600; }
    .chips { display: flex; gap: 6px; overflow: hidden; }
    .chip { flex: none; padding: 2px 8px; border-radius: 999px; background: var(--gx-chip); font-size: 12px; white-space: nowrap; }
    .chip.warning { background: var(--gx-warn-bg); color: var(--gx-warn-fg); }
    .chip.accent { background: var(--gx-acc-bg); color: var(--gx-acc-fg); }
    .spacer { flex: 1; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 6px; }
    .primary { padding: 4px 12px; background: var(--gx-accent); color: #fff; font-weight: 600; }
    .link { padding: 4px 6px; background: none; color: var(--gx-muted); text-decoration: underline; }
    .icon { width: 28px; height: 28px; background: none; color: var(--gx-muted); font-size: 16px; }
    .icon:hover, .link:hover { color: var(--gx-strong); }
    .tab { pointer-events: auto; position: fixed; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px;
      padding: 4px 10px 4px 4px; border-radius: 999px; background: var(--gx-bg); color: var(--gx-fg); font-size: 12px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, .3); }
    @media (max-width: 640px) { .chips { display: none; } }`;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const send = (action: string, value?: string) =>
    (
      globalThis as unknown as {
        chrome: { runtime: { sendMessage(m: unknown): Promise<unknown> } };
      }
    ).chrome.runtime
      .sendMessage({ type: "gx-page-bar", action, value })
      .catch(() => undefined);

  const drawTab = (): HTMLElement => {
    const tab = el("button", "tab");
    tab.title = model.title;
    tab.append(
      el("span", "logo", model.mark),
      el("span", "", model.collapsedLabel),
    );
    tab.addEventListener("click", () => {
      send("expand");
      shadow.replaceChildren(style, drawBar());
    });
    return tab;
  };
  const drawBar = (): HTMLElement => {
    const bar = el("div", "bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", `${model.lead} ${model.title}`);
    const what = el("div", "what");
    what.append(
      document.createTextNode(`${model.lead} `),
      el("b", "", model.title),
    );
    const chips = el("div", "chips");
    for (const chip of model.chips || [])
      chips.append(el("span", `chip ${chip.tone || "neutral"}`, chip.label));
    bar.append(
      el("span", "logo", model.mark),
      what,
      chips,
      el("span", "spacer"),
    );
    for (const action of model.actions || []) {
      const button = el(
        "button",
        action.primary ? "primary" : "link",
        action.label,
      );
      if (action.title) button.title = action.title;
      button.dataset.action = action.id;
      button.addEventListener("click", () => send(action.id, action.value));
      bar.append(button);
    }
    const shrink = el("button", "icon", "▴");
    shrink.title = "Shrink to a tab";
    shrink.setAttribute("aria-label", "Shrink to a tab");
    shrink.addEventListener("click", () => {
      send("collapse");
      shadow.replaceChildren(style, drawTab());
    });
    bar.append(shrink);
    return bar;
  };
  shadow.append(style, model.collapsed ? drawTab() : drawBar());
  document.documentElement.append(root);
  state.root = root;
  state.shadow = shadow; // isolated world only: the page can't reach it
}
