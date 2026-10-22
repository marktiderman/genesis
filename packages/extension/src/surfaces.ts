import { getChrome, type Tab } from "./chrome";

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
 * page's styles and scripts can't reach into it), whose host element pins its
 * own style (a page script can't hide or move it). The frame and the host talk
 * over a MessageChannel handed to the frame once, addressed to the
 * extension's origin and checked by a per-open secret in the frame's
 * #fragment; nothing is ever posted through `window.parent`, which the page's
 * own scripts could read. If the page navigates the frame anywhere else, the
 * host closes it.
 *
 * What this can't stop: the page can still draw over the frame to trick a
 * click into it. `connectSurface()` reports whether Chrome sees the frame as
 * really visible (IntersectionObserver v2); check `surface.visible()` before
 * a sensitive action (save, upload, delete), or ask for a second step.
 *
 * The surface page must be listed in `web_accessible_resources` with
 * `use_dynamic_url: true`, so a site can't frame or detect it on its own.
 *
 * The side panel is opened by Chrome itself on the toolbar icon and the
 * `_execute_action` shortcut once `syncSidePanel("side")` has run (Chrome
 * keeps that setting), because `chrome.sidePanel.open()` only works inside a
 * click, and a service worker that has just woken can't read its settings in
 * time. Declare `"side_panel": { "default_path": "<page>?side=1" }` and the
 * `sidePanel` permission in the manifest.
 */

export type SurfaceMode = "panel" | "bar" | "side";

/** Tell Chrome whether the icon and shortcut open the side panel. Call when the setting changes and on start. */
export function syncSidePanel(mode: SurfaceMode): Promise<void> {
  const sidePanel = getChrome().sidePanel;
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
 * Toggle (or open) the surface on this tab.
 *
 * For `side`, call it straight from a click (an in-page or context-menu
 * click, with nothing awaited first): Chrome only opens the side panel within
 * one. If it can't, the floating panel opens instead. Pages Chrome won't let
 * extensions touch (chrome://, the Web Store) get a small window.
 */
export function openSurface(
  tab: Tab,
  options: OpenSurfaceOptions,
): Promise<"opened" | "closed"> {
  const api = getChrome();
  const query = new URLSearchParams({ tab: String(tab.id), ...options.params });
  if (options.mode === "side" && api.sidePanel) {
    // Both called within the click, before anything is awaited.
    if (options.params && api.sidePanel.setOptions && tab.id !== undefined) {
      api.sidePanel
        .setOptions({ tabId: tab.id, path: `${options.page}?side=1&${query}` })
        .catch(() => undefined);
    }
    return api.sidePanel.open({ windowId: tab.windowId }).then(
      () => "opened" as const,
      () => openSurface(tab, { ...options, mode: "panel" }),
    );
  }
  return openFrame(tab, options, query);
}

async function openFrame(
  tab: Tab,
  options: OpenSurfaceOptions,
  query: URLSearchParams,
): Promise<"opened" | "closed"> {
  const api = getChrome();
  query.set("panel", "1");
  if (options.mode === "bar") query.set("bar", "1");
  const src = api.runtime.getURL(`${options.page}?${query}`);
  const layout = options.mode === "bar" ? "bar" : "card";
  try {
    const run = () =>
      api.scripting!.executeScript({
        target: { tabId: tab.id! },
        func: mountSurfaceFrame,
        args: [src, layout],
      });
    const [first] = await run();
    if (options.open && first?.result === "closed") {
      await run();
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
 * add the surface frame, or close it if it's open. Internal: use
 * `openSurface`.
 */
export function mountSurfaceFrame(
  src: string,
  layout: "card" | "bar" = "card",
): "opened" | "closed" {
  const state = ((globalThis as Record<string, unknown>).__gxSurface ||=
    {}) as {
    host?: HTMLElement | null;
    close?: () => void;
    frame?: HTMLIFrameElement;
  };
  if (state.host?.isConnected) {
    state.close?.();
    return "closed";
  }
  const nonce = crypto.randomUUID();
  // scheme://host of the page (URL.origin is "null" for chrome-extension: in some engines).
  const origin = src.split("/").slice(0, 3).join("/");
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

  // The frame's own line: handed over once, to the extension's origin only.
  const channel = new MessageChannel();
  const port = channel.port1;
  let loads = 0;
  frame.addEventListener("load", () => {
    loads += 1;
    if (loads === 1) {
      frame.contentWindow?.postMessage({ type: "gx-connect", nonce }, origin, [
        channel.port2,
      ]);
    } else {
      // Navigated again: by the page (frames[i].location = …), perhaps to a
      // look-alike. Close rather than show whatever it is.
      close();
    }
  });
  port.onmessage = (e: MessageEvent) => {
    if (e.data?.type === "gx-close") close();
    if (e.data?.type === "gx-resize" && layout === "bar") {
      const height = Math.round(
        Math.min(Math.max(Number(e.data.height) || 0, 48), innerHeight * 0.8),
      );
      pinned = style(height);
      host.setAttribute("style", pinned);
    }
  };
  document.documentElement.append(host);

  const here = () => location.href.split("#")[0];
  let last = here();
  const timer = setInterval(() => {
    if (!host.isConnected) return close();
    if (here() !== last) {
      last = here();
      port.postMessage({ type: "gx-page-changed", url: last });
    }
  }, 700);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    keepPinned.disconnect();
    port.close();
    host.remove();
    state.host = null;
  }
  state.host = host;
  state.close = close;
  state.frame = frame; // isolated world only (the page can't reach it): for tests
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
  /**
   * Whether Chrome sees this page as really visible, not covered by the page
   * (panel and bar; always true elsewhere). Check it before a sensitive action.
   */
  visible(): boolean;
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
  document.documentElement.dataset.gxSurface = mode;

  // The host's line, once it arrives with this page's secret; until then,
  // messages wait. Anything else posted to the window is ignored.
  let port: MessagePort | null = null;
  const queue: unknown[] = [];
  const pageListeners = new Set<(url: string) => void>();
  const send = (message: unknown) =>
    port ? port.postMessage(message) : queue.push(message);
  if (framed) {
    const onConnect = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== "gx-connect") return;
      if (!nonce || e.data.nonce !== nonce || !e.ports[0]) return;
      window.removeEventListener("message", onConnect);
      port = e.ports[0];
      port.onmessage = (m: MessageEvent) => {
        if (m.data?.type === "gx-page-changed") {
          for (const listener of pageListeners) listener(String(m.data.url));
        }
      };
      for (const message of queue.splice(0)) port.postMessage(message);
    };
    window.addEventListener("message", onConnect);
  }

  let seen = true;
  if (framed && "IntersectionObserver" in window) {
    try {
      new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const visible = (
              entry as IntersectionObserverEntry & { isVisible?: boolean }
            ).isVisible;
            if (typeof visible === "boolean") seen = visible;
          }
          document.documentElement.toggleAttribute("data-gx-obscured", !seen);
        },
        { trackVisibility: true, delay: 100 } as IntersectionObserverInit,
      ).observe(document.body);
    } catch {
      /* no visibility tracking here */
    }
  }

  const surface: Surface = {
    mode,
    tabId: params.has("tab") ? Number(params.get("tab")) : null,
    close() {
      if (framed) send({ type: "gx-close" });
      else if (mode === "side" && getChrome().sidePanel?.close) {
        getChrome()
          .windows?.getCurrent()
          .then((w) => getChrome().sidePanel!.close!({ windowId: w.id }));
      } else window.close();
    },
    reportHeight(height) {
      if (mode === "bar") send({ type: "gx-resize", height });
    },
    onPageChanged(listener) {
      pageListeners.add(listener);
      return () => pageListeners.delete(listener);
    },
    visible: () => seen,
  };
  if (mode === "bar" && autoResize && typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() =>
      surface.reportHeight(document.documentElement.scrollHeight),
    ).observe(document.body);
  }
  return surface;
}
