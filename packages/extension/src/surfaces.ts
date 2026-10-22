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
 * over a MessageChannel. The host offers the frame a fresh channel every
 * 200ms, addressed to the extension's own origin (chrome-extension://<id>,
 * where a use_dynamic_url page really loads) with a per-open secret the
 * service worker minted and kept in chrome.storage.session. The surface page,
 * once `connectSurface()` runs (however late), takes the first offer whose
 * secret matches what the worker kept for its tab, uses the secret up, and
 * answers on it. Nothing is posted to the page, and the secret is never put
 * on the frame. Any page in a frame must be confirmed this way, so one a
 * web page framed itself stays hidden. Until that
 * answer the panel is blank (no answer in 30s: it closes), so whatever else
 * the frame shows first is never seen, and any later load of the frame (the
 * page navigating it, or the surface reloading itself) closes it.
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
 *
 * `params` reach a side panel through its path, set just before it opens;
 * Chrome may show a panel that's opening for the first time with the
 * previous path. Pass anything a side panel must have this time (which item
 * to edit, say) through `chrome.storage.session` instead.
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
  // The open's secret, minted here and kept where only the extension's own
  // pages can read it (session storage isn't open to content scripts by
  // default), so the surface can tell it was opened by this extension and
  // not framed by the page itself.
  const nonce = crypto.randomUUID();
  try {
    await api.storage.session?.set({
      [surfaceKey(tab.id!)]: { nonce, at: Date.now() },
    });
    const run = () =>
      api.scripting!.executeScript({
        target: { tabId: tab.id! },
        func: mountSurfaceFrame,
        args: [src, layout, nonce],
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
  nonce: string = crypto.randomUUID(),
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
  // The origin the surface page really has. With use_dynamic_url, `src` is the
  // per-session address, but the page it loads is at the extension's own
  // origin, chrome-extension://<id> (checked in Chrome).
  // (Serialized into the page: it can't use getChrome().)
  const extensionId = (
    globalThis as unknown as { chrome: { runtime: { id: string } } }
  ).chrome.runtime.id;
  const origin = `chrome-extension://${extensionId}`;
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
  // Blank until the surface page answers on its line: whatever else the frame
  // shows first (a look-alike the page navigated it to) is never seen.
  wrap.style.visibility = "hidden";
  const frame = document.createElement("iframe");
  // The secret is never put on the frame (its name or address): it goes only
  // in the host's offers, which reach the extension's own origin, and the
  // surface checks it against what the service worker kept.
  frame.src = src;
  wrap.append(frame);
  shadow.append(css, wrap);

  // The frame's own line. Nothing is ever posted where the page can see it:
  // the host offers a fresh channel to the frame, with the secret, addressed
  // to the extension's origin only, every 200ms until the surface page
  // (however late it calls connectSurface) answers on one. That one is kept,
  // the rest are dropped. No answer in 30s: close.
  let closed = false;
  let port: MessagePort | null = null;
  const offered: MessagePort[] = [];
  const started = Date.now();
  const offer = () => {
    if (port || closed) return;
    if (Date.now() - started > 30_000) return close();
    const channel = new MessageChannel();
    channel.port1.onmessage = (e: MessageEvent) => {
      if (port || e.data?.type !== "gx-hello") return;
      port = channel.port1;
      for (const other of offered) if (other !== port) other.close();
      offered.length = 0;
      port.onmessage = onPortMessage;
      wrap.style.visibility = "visible";
    };
    offered.push(channel.port1);
    frame.contentWindow?.postMessage({ type: "gx-connect", nonce }, origin, [
      channel.port2,
    ]);
  };
  const offering = setInterval(offer, 200);
  let loads = 0;
  frame.addEventListener("load", () => {
    loads += 1;
    if (loads === 1) offer();
    // Navigated again: by the page (frames[i].location = …), perhaps to a
    // look-alike, or the surface reloading itself. Close rather than show
    // whatever it is.
    else close();
  });
  function onPortMessage(e: MessageEvent) {
    if (e.data?.type === "gx-close") close();
    if (e.data?.type === "gx-resize" && layout === "bar") {
      const height = Math.round(
        Math.min(Math.max(Number(e.data.height) || 0, 32), innerHeight * 0.8),
      );
      pinned = style(height);
      host.setAttribute("style", pinned);
    }
  }
  document.documentElement.append(host);

  const here = () => location.href.split("#")[0];
  let last = here();
  const timer = setInterval(() => {
    if (!host.isConnected) return close();
    if (here() !== last) {
      last = here();
      port?.postMessage({ type: "gx-page-changed", url: last });
    }
  }, 700);
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearInterval(offering);
    keepPinned.disconnect();
    port?.close();
    for (const other of offered) other.close();
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
  /**
   * Panel and bar: resolves true once the page is confirmed to have been
   * opened by this extension (the open's secret matches the one the service
   * worker minted for this tab), false when a web page framed it itself.
   * Until it's true the page stays hidden. Await it before reading the tab
   * or doing anything for the user. Always true elsewhere.
   */
  ready: Promise<boolean>;
}

/** Where openSurface keeps a tab's current open secret (chrome.storage.session). */
export function surfaceKey(tabId: number): string {
  return `genesis-extension:surface:${tabId}`;
}

/**
 * In the surface page: what it's shown as, and how to talk to its host.
 * With `autoResize`, a bar keeps the host as tall as the page's content.
 */
export function connectSurface({
  autoResize = true,
}: { autoResize?: boolean } = {}): Surface {
  if (current) return current;
  const params = new URLSearchParams(location.search);
  // Any page in a frame is a panel or bar and must be confirmed, whatever its
  // address says: a page can frame the surface with any parameters.
  const framed = window.top !== window;
  const mode: Surface["mode"] = framed
    ? params.has("bar")
      ? "bar"
      : "panel"
    : params.has("side")
      ? "side"
      : "popup";
  document.documentElement.dataset.gxSurface = mode;

  // The host's line, once it arrives with this page's secret; until then,
  // messages wait. Anything else posted to the window is ignored, and
  // nothing is posted to the page.
  let port: MessagePort | null = null;
  const queue: unknown[] = [];
  const pageListeners = new Set<(url: string) => void>();
  const send = (message: unknown) =>
    port ? port.postMessage(message) : queue.push(message);
  const tabId = params.has("tab") ? Number(params.get("tab")) : null;
  let ready: Promise<boolean> = Promise.resolve(true);
  if (framed) {
    // Hidden until confirmed: a page that frames the surface itself shows nothing.
    document.documentElement.style.visibility = "hidden";
    let confirm: (ok: boolean) => void = () => undefined;
    ready = new Promise<boolean>((resolve) => (confirm = resolve)).then(
      (ok) => {
        if (ok) document.documentElement.style.visibility = "";
        else document.documentElement.dataset.gxUntrusted = "";
        return ok;
      },
    );
    // No offer with the secret the service worker minted for this open, in
    // 30s (the host stops offering by then): it wasn't opened by this extension.
    const giveUp = setTimeout(() => confirm(false), 30_000);
    let checking = false;
    const onConnect = async (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== "gx-connect") return;
      const offered = e.ports[0];
      if (!offered || port || checking || typeof e.data.nonce !== "string")
        return;
      checking = true;
      const ok = await takeSecret(tabId, e.data.nonce);
      checking = false;
      if (!ok || port) return;
      clearTimeout(giveUp);
      window.removeEventListener("message", onConnect);
      port = offered;
      port.onmessage = (m: MessageEvent) => {
        if (m.data?.type === "gx-page-changed") {
          for (const listener of pageListeners) listener(String(m.data.url));
        }
      };
      port.postMessage({ type: "gx-hello" });
      for (const message of queue.splice(0)) port.postMessage(message);
      confirm(true);
    };
    window.addEventListener("message", onConnect);
  }

  // Where Chrome can tell, the frame counts as hidden until it says otherwise.
  const tracked =
    framed &&
    typeof IntersectionObserverEntry !== "undefined" &&
    "isVisible" in IntersectionObserverEntry.prototype;
  let seen = !tracked;
  if (framed && "IntersectionObserver" in window) {
    try {
      const observer = new IntersectionObserver(
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
      );
      whenBody((body) => observer.observe(body));
    } catch {
      /* no visibility tracking here */
    }
  }

  const surface: Surface = {
    mode,
    tabId,
    ready,
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
    whenBody((body) =>
      new ResizeObserver(() =>
        surface.reportHeight(document.documentElement.scrollHeight),
      ).observe(body),
    );
  }
  current = surface;
  return surface;
}

// One surface per page: every connectSurface() call (a remount, two
// components) gets the same surface.
let current: Surface | null = null;

/** How long an open's secret stays good: the host stops offering after 30s. */
const SECRET_TTL_MS = 60_000;

/**
 * Whether `nonce` is the secret the service worker minted for this tab's
 * current open, and fresh. It's used up either way it matches, so the same
 * secret never confirms a second page.
 */
async function takeSecret(
  tabId: number | null,
  nonce: string,
): Promise<boolean> {
  if (!nonce || tabId === null || !Number.isInteger(tabId)) return false;
  try {
    const area = getChrome().storage.session;
    if (!area) return false;
    const key = surfaceKey(tabId);
    const stored = (await area.get(key))[key] as
      { nonce?: unknown; at?: unknown } | undefined;
    if (!stored || stored.nonce !== nonce) return false;
    await area.remove(key);
    return (
      typeof stored.at === "number" && Date.now() - stored.at < SECRET_TTL_MS
    );
  } catch {
    return false;
  }
}

function whenBody(run: (body: HTMLElement) => void) {
  if (document.body) run(document.body);
  else
    document.addEventListener("DOMContentLoaded", () => run(document.body), {
      once: true,
    });
}

/** Tests only: forget the page's surface, as a fresh page would. */
export function resetSurfaceForTests(): void {
  current = null;
}
