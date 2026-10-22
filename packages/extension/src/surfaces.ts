import { chrome, type Tab } from "./chrome";

/**
 * Where an extension's main page (its "surface", e.g. popup.html) opens:
 *
 * - `panel`: a card floating at the top right of the page, which stays open
 *   while the page is clicked, scrolled or played (a toolbar popup closes on
 *   the first click outside it);
 * - `bar`: a strip across the top of the page, as tall as its content;
 * - `side`: Chrome's side panel, which moves the page aside and stays across
 *   tabs.
 *
 * Panel and bar are the page in an iframe, inside a closed shadow root (the
 * page's styles can't reach it), whose host element pins its own style (a
 * page script can't hide, move or cover-and-click-through it), talking to it
 * over a per-open secret in the frame's #fragment, which the page can't read.
 * The surface page must be listed in `web_accessible_resources` with
 * `use_dynamic_url: true`, so a site can't frame or detect it on its own.
 *
 * The side panel is opened by Chrome itself on the toolbar icon and the
 * `_execute_action` shortcut once `syncSidePanel("side")` has run (Chrome keeps
 * that setting), because `chrome.sidePanel.open()` only works inside the
 * click, and a service worker that has just woken can't read its settings in
 * time. Declare `"side_panel": { "default_path": "<page>?side=1" }` and the
 * `sidePanel` permission in the manifest.
 */

export type SurfaceMode = "panel" | "bar" | "side";

/** Tell Chrome whether the icon and shortcut open the side panel. Call when the setting changes and on start. */
export function syncSidePanel(mode: SurfaceMode): Promise<void> {
  const sidePanel = chrome().sidePanel;
  if (!sidePanel) return Promise.resolve();
  return sidePanel
    .setPanelBehavior({ openPanelOnActionClick: mode === "side" })
    .catch(() => undefined);
}

export interface OpenSurfaceOptions {
  /** The surface page, e.g. "popup.html". */
  page: string;
  mode: SurfaceMode;
  /** Open even if it's already open (reopens it fresh), rather than toggle. */
  open?: boolean;
  /** Extra query parameters for the page. */
  params?: Record<string, string>;
}

/**
 * Toggle (or open) the surface on this tab. For `side`, opens the side panel
 * (only works within a click: use it from a context-menu or in-page click).
 * Pages Chrome won't let extensions touch (chrome://, the Web Store) get a
 * small window instead.
 */
export async function openSurface(
  tab: Tab,
  options: OpenSurfaceOptions,
): Promise<"opened" | "closed"> {
  const api = chrome();
  const query = new URLSearchParams({ tab: String(tab.id), ...options.params });
  if (options.mode === "side" && api.sidePanel) {
    await api.sidePanel.open({ windowId: tab.windowId });
    return "opened";
  }
  query.set("panel", "1");
  if (options.mode === "bar") query.set("bar", "1");
  const src = api.runtime.getURL(`${options.page}?${query}`);
  const layout = options.mode === "bar" ? "bar" : "card";
  try {
    const [first] = await api.scripting!.executeScript({
      target: { tabId: tab.id! },
      func: mountSurfaceFrame,
      args: [src, layout],
    });
    if (options.open && first?.result === "closed") {
      await api.scripting!.executeScript({
        target: { tabId: tab.id! },
        func: mountSurfaceFrame,
        args: [src, layout],
      });
      return "opened";
    }
    return first?.result === "closed" ? "closed" : "opened";
  } catch {
    const fallback = new URLSearchParams({
      tab: String(tab.id),
      ...options.params,
    });
    await api.windows?.create({
      url: api.runtime.getURL(`${options.page}?${fallback}`),
      type: "popup",
      width: 400,
      height: 760,
    });
    return "opened";
  }
}

/**
 * Injected into the page's isolated world (self-contained: it's serialized):
 * add the surface frame, or close it if it's open. Messages from the surface:
 * `gx-close` and `gx-resize` (bar only), each carrying the per-open nonce.
 * The surface is told `gx-page-changed` when a single-page site moves on.
 */
export function mountSurfaceFrame(
  src: string,
  layout: "card" | "bar" = "card",
): "opened" | "closed" {
  const state = ((globalThis as Record<string, unknown>).__gxSurface ||=
    {}) as {
    host?: HTMLElement | null;
    close?: () => void;
  };
  if (state.host?.isConnected) {
    state.close?.();
    return "closed";
  }
  const nonce = crypto.randomUUID();
  const origin = new URL(src).origin;
  const host = document.createElement("div");
  const place = (height: number) =>
    layout === "bar"
      ? " top: 0 !important; left: 0 !important; right: 0 !important; width: auto !important;" +
        ` height: ${height}px !important;`
      : " top: 12px !important; right: 12px !important; width: 380px !important;" +
        " height: min(780px, calc(100vh - 24px)) !important;";
  const style = (height: number) =>
    "all: initial !important; display: block !important; position: fixed !important;" +
    " z-index: 2147483647 !important;" +
    place(height) +
    " opacity: 1 !important; visibility: visible !important; transform: none !important;" +
    " filter: none !important; clip-path: none !important; pointer-events: auto !important;";
  let pinned = style(120);
  host.setAttribute("style", pinned);
  const keepPinned = new MutationObserver(() => {
    if (host.getAttribute("style") !== pinned)
      host.setAttribute("style", pinned);
    if (host.hasAttribute("hidden")) host.removeAttribute("hidden");
  });
  keepPinned.observe(host, { attributes: true });

  // DOM calls, not innerHTML: sites that enforce Trusted Types refuse HTML strings.
  const shadow = host.attachShadow({ mode: "closed" });
  const css = document.createElement("style");
  css.textContent = `
    .wrap { width: 100%; height: 100%; overflow: hidden; border-radius: ${layout === "bar" ? "0" : "12px"};
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.12); }
    iframe { display: block; width: 100%; height: 100%; border: 0; }`;
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const frame = document.createElement("iframe");
  frame.src = `${src}#${nonce}`;
  wrap.append(frame);
  shadow.append(css, wrap);
  document.documentElement.append(host);

  const here = () => location.href.split("#")[0];
  let last = here();
  const timer = setInterval(() => {
    if (!host.isConnected) return close();
    if (here() !== last) {
      last = here();
      frame.contentWindow?.postMessage(
        { type: "gx-page-changed", url: last, nonce },
        origin,
      );
    }
  }, 700);
  function onMessage(e: MessageEvent) {
    if (e.origin !== origin || e.data?.nonce !== nonce) return;
    if (e.data.type === "gx-close") close();
    if (e.data.type === "gx-resize" && layout === "bar") {
      const height = Math.round(
        Math.min(Math.max(Number(e.data.height) || 0, 48), innerHeight * 0.8),
      );
      pinned = style(height);
      host.setAttribute("style", pinned);
    }
  }
  function close() {
    clearInterval(timer);
    keepPinned.disconnect();
    window.removeEventListener("message", onMessage);
    host.remove();
    state.host = null;
  }
  window.addEventListener("message", onMessage);
  state.host = host;
  state.close = close;
  return "opened";
}

export interface Surface {
  /** How this page is shown. */
  mode: SurfaceMode | "popup";
  /** The tab the page is about (from `?tab=`), when given. */
  tabId: number | null;
  /** Close the panel, bar, side panel or popup window. */
  close(): void;
  /** Bar only: report the content's height (done automatically with `autoResize`). */
  reportHeight(height: number): void;
  /** A single-page site moved on to another address (panel and bar). */
  onPageChanged(listener: (url: string) => void): () => void;
}

/**
 * In the surface page: what it's shown as, and how to talk to its host.
 * With `autoResize`, a bar keeps the host as tall as the page's content.
 */
export function connectSurface({
  autoResize = true,
}: { autoResize?: boolean } = {}): Surface {
  const params = new URLSearchParams(location.search);
  const framed = params.has("panel") && window.top !== window;
  const mode: Surface["mode"] = params.has("side")
    ? "side"
    : framed
      ? params.has("bar")
        ? "bar"
        : "panel"
      : "popup";
  const nonce = framed ? location.hash.slice(1) : "";
  const pageOrigin = location.ancestorOrigins?.[0] || "*";
  const post = (message: Record<string, unknown>) =>
    window.parent.postMessage({ ...message, nonce }, pageOrigin);
  document.documentElement.dataset.gxSurface = mode;
  const surface: Surface = {
    mode,
    tabId: params.has("tab") ? Number(params.get("tab")) : null,
    close() {
      if (framed) post({ type: "gx-close" });
      else if (mode === "side" && chrome().sidePanel?.close) {
        chrome()
          .windows?.getCurrent()
          .then((w) => chrome().sidePanel!.close!({ windowId: w.id }));
      } else window.close();
    },
    reportHeight(height) {
      if (mode === "bar") post({ type: "gx-resize", height });
    },
    onPageChanged(listener) {
      const onMessage = (e: MessageEvent) => {
        if (
          !framed ||
          e.source !== window.parent ||
          e.data?.type !== "gx-page-changed"
        )
          return;
        if (!nonce || e.data.nonce !== nonce) return;
        listener(String(e.data.url));
      };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },
  };
  if (mode === "bar" && autoResize && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() =>
      surface.reportHeight(document.documentElement.scrollHeight),
    ).observe(document.body);
  }
  return surface;
}
