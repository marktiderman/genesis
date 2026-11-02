---
"@marktiderman/genesis-ui": patch
---

`AppShell` on a phone:
- **The drawer is a real modal.** It opens as a dialog with focus inside it. Escape closes it and hands focus back to the menu button. The page and sidebar behind it are inert and stop scrolling, and widening past the phone breakpoint closes it.
- **Bigger drawer targets.** The drawer's rows and buttons are at least 44px, and the drawer is a little wider (18rem, at most 85% of the screen).
- **Safe areas.** The phone header, drawer and bottom bar pad clear of the notch, the home indicator and the side insets, for apps that run edge to edge (`viewport-fit=cover`).
- **No more squeezed bottom bar.** It shows five slots at most, the back item included. Past that, the last slot is "More", which opens the rest in a bottom sheet and is highlighted when the current page is one of them. Before, every item was squeezed into the bar until labels clipped.
- **Reduced motion.** The drawer doesn't slide when reduced motion is asked for.
