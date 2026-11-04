---
"@marktiderman/genesis-ui": minor
---

Touch screens and reduced motion:
- **44px targets on touch screens.** Buttons of every size, tab triggers, inputs, select triggers, select options and menu items are now at least 44px on a touch screen (a coarse pointer). A mouse keeps the compact sizes. The sizes are `min-` sizes, so a screen's own `h-8 w-8` icon button grows on touch too.
- **No zoom on focus.** Inputs and textareas keep 16px text on a touch screen, an iPad included, so iOS Safari no longer zooms in on focus; only a mouse gets 14px from `md` up.
- **Reduced motion.** `styles.css` stops every animation and transition when the person asks their device for less motion. Spinners still turn.
- **DashboardPage.** Two stat cards side by side on a phone, not one per row.
- **SettingsPage.** On a phone the section links are one compact row of 44px links that scrolls sideways, instead of a full list that filled the first screen. The sticky rail starts at `navAt`, and a section that is jumped to clears the phone header.
- **New doctor rule.** `ui/overlays-fit-the-phone` warns when an app sizes a dialog or sheet in `vh`.
- **Contract doc.** `docs/MOBILE.md` is the mobile contract.
