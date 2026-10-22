# @marktiderman/genesis-extension

Build Chrome extensions (Manifest V3) with Genesis. Each extension writes only its own screens and actions; this package supplies the parts every one of them needs, done once and tested. Breakthrough's Resource Saver is the first extension built on it.

| Entry                                     | For                                                       |
| ----------------------------------------- | --------------------------------------------------------- |
| `@marktiderman/genesis-extension`         | the service worker, content scripts and extension pages   |
| `@marktiderman/genesis-extension/react`   | React pages (popup, side panel, options), with Genesis UI |
| `@marktiderman/genesis-extension/testing` | a working fake of the `chrome.*` APIs for vitest          |

## What's in it

- **Checked messaging.** `createRouter({ pages, content })` answers the extension's own pages and, separately, its scripts inside web pages. A hostile page can drive those scripts, so they may only send the few message types listed for them, and their handlers get only their own tab. `request()` throws the other side's error.
- **Settings.** `createPrefs(key, defaults)` stores settings in `chrome.storage.local`. Each write merges into the latest saved values under a Web Lock that every page and the service worker share, so two pages writing at once don't overwrite each other. A failed write doesn't block later ones. `subscribe` and React's `usePrefs` follow changes made from any page.
- **Three ways to open the main page.** `openSurface(tab, { page, mode })` opens it as a floating panel over the page, a top bar across it, or Chrome's side panel.
  - **Panel and bar:** the page sits in an iframe in a closed shadow root, whose host pins its own style against hiding and moving. The host and the page talk over a private `MessageChannel`. Nothing is ever posted to the page: the host offers the frame a fresh channel every 200ms, addressed to the extension's own origin (`chrome-extension://<id>`, which is where a `use_dynamic_url` page really loads), with a per-open secret that also travels in the frame's name, which the page can't read. The surface page takes the first offer that carries its secret once it calls `connectSurface()`, however late, and answers on it. Until it answers, the panel stays blank, so whatever else the frame shows first is never seen; with no answer in 30 seconds, it closes. Any later load of the frame (the page navigating it, or the surface reloading itself) closes it. The secret is minted by the service worker for each open and kept in `chrome.storage.session` (which content scripts and pages can't read), so the surface also checks it there: a surface a web page frames itself stays hidden, and `surface.ready` resolves `false`. Await `surface.ready` before reading the tab or acting for the user. Call `connectSurface()` early, before awaiting data. `connectSurface()` returns the same surface however often it's called. The frame's address (its `params` and `tab`) is visible to the page in its Resource Timing, so don't put anything sensitive in `params`. A page can still draw over the frame to trick a click, so check `surface.visible()` (Chrome's IntersectionObserver v2) before a sensitive action.
  - **Side panel:** `syncSidePanel(mode)` hands the icon and the shortcut to Chrome, so it opens even right after the service worker wakes. `params` reach a side panel through its path, which Chrome may not have applied yet when a panel opens for the first time. Pass anything a side panel must have this time through `chrome.storage.session` instead.
  - **In the page itself:** `connectSurface()` says which of the three it is, closes it, and keeps a top bar as tall as its content.
- **An in-page bar.** `showPageBar(tabId, model)` draws a thin bar across a web page, such as "already in your library", with chips and buttons. It shrinks to a corner tab, is built from plain text in a closed shadow root, and reports its buttons back as `gx-page-bar` messages.
- **Native helper jobs.** `startNativeJob(host, message)` talks to a local helper (unpacked or private builds only) and supports progress, `waitFor("step")`, `answer("need-token", …)`, `post` and `close` (cancel). `pingNativeHost` checks the helper is installed.
- **Mac-aware shortcuts.** `shortcutKeys` and `<ShortcutKeys command="_execute_action" />` show "⌥ Option + ⇧ Shift + S" on a Mac, in the keys Chrome currently has for the command.
- **React, on Genesis UI:**
  - `<ExtensionSettings tabs={…}>` is a tabbed options page. The open tab is kept in the address (`#tab=`), and only that tab is rendered, so each tab loads its data when it's opened.
  - `<SurfaceModePicker>` chooses panel, bar or side panel.
  - `useLazyList` with `<LazyListFooter>` and `<ListSkeleton>` loads a long list a page at a time as it scrolls, with placeholders and Retry.

## A minimal extension

```js
// background.js (the service worker)
import {
  createPrefs,
  createRouter,
  openSurface,
  syncSidePanel,
} from "@marktiderman/genesis-extension";

export const prefs = createPrefs("acme_prefs", { mode: "panel" });
prefs.get().then((p) => syncSidePanel(p.mode));
prefs.subscribe((p) => syncSidePanel(p.mode));

chrome.action.onClicked.addListener(async (tab) => {
  const { mode } = await prefs.get(); // not called in side mode: Chrome opens the side panel
  openSurface(tab, { page: "popup.html", mode });
});

createRouter({
  pages: { SAVE: async (message) => ({ saved: true }) },
  content: {
    "gx-page-bar": (message, { tab }) =>
      openSurface(tab, { page: "popup.html", mode: "panel", open: true }),
  },
});
```

```json
// manifest.json (the parts this package relies on)
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "action": {},
  "background": { "service_worker": "background.js", "type": "module" },
  "side_panel": { "default_path": "popup.html?side=1" },
  "web_accessible_resources": [
    {
      "resources": ["popup.html"],
      "matches": ["<all_urls>"],
      "use_dynamic_url": true
    }
  ],
  "commands": {
    "_execute_action": { "suggested_key": { "default": "Alt+Shift+S" } }
  }
}
```

Build the pages with any bundler that handles several entry points (Vite works well), import Genesis's theme CSS in each page, and wrap the page in Genesis's `ThemeProvider` as any Genesis app does.

## Testing

```ts
import { installChromeFake } from "@marktiderman/genesis-extension/testing";

const fake = installChromeFake();
fake.nativeHost("com.acme.helper", (message, reply) => reply({ type: "done" }));
await fake.deliver({ type: "SAVE" }, fake.pageSender()); // as from the extension's own page
await fake.deliver({ type: "SAVE" }, fake.contentSender(7)); // as from its script in tab 7
fake.uninstall();
```

## Chrome Web Store notes

- Keep `nativeMessaging` and any download code out of a store build. Store policy forbids downloading media from sites such as YouTube.
- Ask for broad page access (`<all_urls>`) as an optional permission, only when a feature that needs it is turned on.
- Send page addresses in request bodies rather than in URLs, and say so in the privacy policy.
