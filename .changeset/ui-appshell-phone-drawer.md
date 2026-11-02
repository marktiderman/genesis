---
"@marktiderman/genesis-ui": minor
---

`AppShell` on a phone. Two visible changes, so check your app's phone layout:
- **The bottom bar holds five slots at most.** The back item counts as one. An app with six or more bar items now shows the first four and a fifth slot, "More", which opens the rest in a bottom sheet. Before, every item was squeezed into the bar until labels clipped. More is highlighted when the current page is under it, and screen readers hear "More, includes the current page".
- **The drawer is wider:** 18rem (was 15rem), at most 85% of the screen. Its rows and buttons are at least 44px tall.

Also:
- **The drawer is genesis-ui's `Sheet` (`side="left"`), so Radix runs the modal.** Focus moves in and stays in, including away from toasts and other portals. Escape closes only the topmost layer: a dialog or popover opened from the drawer closes first, then the drawer. Scroll locking doesn't shift the layout and stacks with other dialogs. Closing hands focus back to the menu button, also after a drawer link navigates. The drawer still closes on a route change and when the screen widens past the phone breakpoint, and the shell's keyboard shortcuts still stand down while it's open. Closed, the drawer is no longer in the page at all, rather than kept off-screen and inert. When the screen widens with the drawer open, focus goes to the desktop sidebar's collapse toggle rather than the hidden menu button.
- **The drawer's content mounts each time it opens.** What you pass in the user slot and the footer is mounted when the drawer opens and unmounted when it closes, so effects in them re-run on every open.
- **The More sheet closes when the screen widens** past the phone breakpoint, and its scrim is hidden from that width up. Before, widening with it open left the page frozen under a scrim.
- **Safe areas.** The phone header, drawer, bottom bar and More sheet pad clear of the notch, the home indicator and the side insets, for apps that run edge to edge (`viewport-fit=cover`).
- **Reduced motion.** The drawer doesn't slide when reduced motion is asked for.
- **New copy in the UI message catalogue,** under `shell`: `navigation`, `openNavigation`, `closeNavigation`, `expandSidebar`, `collapseSidebar`, `primaryNavigation` (the bottom bar's name), `more`, `moreDescription` and `moreCurrent`. The sidebar toggle's "Expand sidebar" and "Collapse sidebar", and the bottom bar's "Primary", were hardcoded before. Reword or translate them with `UiMessagesProvider`.
