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

/** The bar's line icons, drawn as SVG paths (never markup). */
export type PageBarIcon =
  | "check"
  | "download"
  | "captions"
  | "clips"
  | "chevron-down"
  | "chevron-up"
  | "close";

export interface PageBarChip {
  label: string;
  tone?: "neutral" | "warning" | "accent" | "success";
  /** A tooltip: what the chip means, or what "+1" stands for. */
  title?: string;
  icon?: PageBarIcon;
  /** A mark (icon and text, no pill), e.g. "Copy" for a saved copy. */
  bare?: boolean;
}

export interface PageBarAction {
  /** Sent back as `action`. */
  id: string;
  label: string;
  /** Sent back as `value` (an item's id, say). */
  value?: string;
  primary?: boolean;
  title?: string;
  /** Draw the icon instead of the text; `label` becomes its accessible name. */
  icon?: PageBarIcon;
  /** `"hover"`: shown only while the bar is hovered or has focus. */
  reveal?: "hover";
}

export interface PageBarModel {
  /** A short mark for the logo (one or two letters). */
  mark: string;
  /** Plain text before the title, e.g. "In Acme's library:". */
  lead: string;
  /** `"success"`: the lead in green with a check, e.g. "In your library". */
  leadTone?: "success";
  title: string;
  /** The title's tooltip, e.g. the practice it's saved in. */
  titleTip?: string;
  chips?: PageBarChip[];
  actions?: PageBarAction[];
  /** The corner tab's text, e.g. "✓ Saved". */
  collapsedLabel: string;
  /** The corner tab's accessible name (default: the title). */
  collapsedTitle?: string;
  collapsed?: boolean;
  /** `"compact"`: one 32px row with 12px text. */
  density?: "compact";
  /** The shrink control: a chevron (the default) or a ×. */
  shrinkIcon?: "chevron-up" | "close";
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
      --gx-accent: #2563eb; --gx-warn-bg: #422006; --gx-warn-fg: #fcd34d; --gx-acc-bg: #3b0764; --gx-acc-fg: #e9d5ff;
      --gx-ok: #86efac; --gx-mark: #cbd5e1; }
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
    .icon { width: 28px; height: 28px; background: none; color: var(--gx-muted); display: grid; place-items: center; }
    .icon:hover, .link:hover { color: var(--gx-strong); }
    .lead.success { display: inline-flex; align-items: center; gap: 6px; color: var(--gx-ok); font-weight: 600; }
    .chip { display: inline-flex; align-items: center; gap: 3px; }
    .chip.success { color: var(--gx-ok); }
    .chip.bare { padding: 0; background: none; }
    .chip.bare.neutral { color: var(--gx-mark); }
    .reveal { opacity: 0; transition: opacity .12s; }
    .bar:hover .reveal, .bar:focus-within .reveal { opacity: 1; }
    @media (hover: none) { .reveal { opacity: 1; } }
    svg { flex: none; }
    .bar.compact { min-height: 32px; padding: 0 8px 0 10px; font-size: 12px; box-shadow: 0 1px 4px rgba(15, 23, 42, .25); }
    .bar.compact .logo { width: 18px; height: 18px; border-radius: 5px; font-size: 11px; }
    .bar.compact .chip { padding: 1px 7px; font-size: 11px; }
    .bar.compact .chip.bare { padding: 0; }
    .bar.compact .primary { height: 22px; padding: 0 10px; }
    .bar.compact .icon { width: 24px; height: 24px; }
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
  // Each icon's SVG paths, drawn with createElementNS (never innerHTML).
  const ICONS: Record<string, string[]> = {
    check: ["M20 6 9 17l-5-5"],
    download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
    captions: [
      "M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z",
      "M10 10.5a2.5 2.5 0 1 0 0 3",
      "M17 10.5a2.5 2.5 0 1 0 0 3",
    ],
    clips: [
      "M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
      "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
      "M20 4 8.1 15.9",
      "M14.5 14.5 20 20",
      "M8.1 8.1 12 12",
    ],
    "chevron-down": ["m6 9 6 6 6-6"],
    "chevron-up": ["m18 15-6-6-6 6"],
    close: ["M18 6 6 18", "m6 6 12 12"],
  };
  const icon = (name: string, size = 13): SVGSVGElement => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [k, v] of [
      ["width", String(size)],
      ["height", String(size)],
      ["viewBox", "0 0 24 24"],
      ["fill", "none"],
      ["stroke", "currentColor"],
      ["stroke-width", "2.2"],
      ["stroke-linecap", "round"],
      ["stroke-linejoin", "round"],
      ["aria-hidden", "true"],
    ])
      svg.setAttribute(k!, v!);
    for (const d of ICONS[name] || []) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
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
    tab.setAttribute("aria-label", model.collapsedTitle || model.title);
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
    const bar = el("div", model.density === "compact" ? "bar compact" : "bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", `${model.lead} ${model.title}`);
    const title = el("b", "", model.title);
    if (model.titleTip) title.title = model.titleTip;
    const what = el("div", "what");
    if (model.leadTone === "success") {
      const lead = el("span", "lead success");
      lead.append(icon("check", 12), document.createTextNode(model.lead));
      bar.append(el("span", "logo", model.mark), lead);
      what.append(title);
    } else {
      what.append(document.createTextNode(`${model.lead} `), title);
      bar.append(el("span", "logo", model.mark));
    }
    const chips = el("div", "chips");
    for (const chip of model.chips || []) {
      const node = el(
        "span",
        `chip ${chip.tone || "neutral"}${chip.bare ? " bare" : ""}`,
      );
      if (chip.icon) node.append(icon(chip.icon));
      node.append(document.createTextNode(chip.label));
      if (chip.title) node.title = chip.title;
      chips.append(node);
    }
    bar.append(what, chips, el("span", "spacer"));
    for (const action of model.actions || []) {
      const kind = action.icon ? "icon" : action.primary ? "primary" : "link";
      const button = el(
        "button",
        action.reveal === "hover" ? `${kind} reveal` : kind,
        action.icon ? undefined : action.label,
      );
      if (action.icon) {
        button.append(icon(action.icon, 14));
        button.setAttribute("aria-label", action.label);
      }
      button.title = action.title || (action.icon ? action.label : "");
      if (!button.title) button.removeAttribute("title");
      button.dataset.action = action.id;
      button.addEventListener("click", () => send(action.id, action.value));
      bar.append(button);
    }
    const shrink = el("button", "icon");
    shrink.dataset.shrink = "";
    shrink.append(icon(model.shrinkIcon || "chevron-up", 14));
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
