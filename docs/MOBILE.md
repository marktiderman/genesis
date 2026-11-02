# The mobile contract

Every Genesis web primitive works on a phone without the app doing anything. This page says what
that promise covers, what an app still owes, and how the promise is kept. Phones are checked at
375, 393 and 430px wide, tablets at 768px.

## What the primitives promise

### The app shell (`AppShell`)

- Below 768px the sidebar becomes a menu button and a drawer. The drawer is a modal: focus moves
  into it, Escape closes it and returns focus to the menu button, and the page behind is inert and
  doesn't scroll. Its rows and buttons are at least 44px.
- The bottom bar shows five slots at most, the back item included. Past that, the last slot is
  **More**, which opens the rest in a bottom sheet.
- The phone header, drawer and bottom bar pad for the notch, the home indicator and the side
  insets, so an app can run edge to edge.

### Lists (`ResourceView`) and tables

- A list can open in cards or rows on a phone and as a table on a desktop. Do it once for the app
  with `<ResourceViewDefaultsProvider phoneMode="grid">`, or per screen with
  `mode={{ mobile: "list", desktop: "table" }}`. A screen's own `mode` wins, and so does the view
  the person picks. New apps should turn the provider on. It's opt-in only so that existing apps
  don't change under a minor release.
- Table cells clip at their column's edge, so values never overlap. A table wider than the screen
  scrolls sideways inside its own box; the page never does.
- The list search is named for screen readers, shows a search keyboard and offers no autofill.

### Dialogs, sheets and drawers

- Below `sm`, `DialogContent` docks to the bottom as a sheet by default. `mobileLayout="fullscreen"`
  fills the screen (long forms, editors, media); `mobileLayout="center"` keeps the centred box.
  From `sm` up every dialog is the centred box.
- Every dialog, alert, sheet and drawer is capped to the screen in `dvh`, scrolls inside itself,
  and pads for the safe areas, so its actions can always be reached.
- Close buttons are 44px targets.
- On a phone, `ResourceForm` opens full width. Its fields scroll, and Save and Cancel stay pinned
  to the bottom, above the home indicator.

### Forms

- Inputs get the keyboard and autofill their type asks for: `email`, `tel` (new), `url`, and the
  decimal keypad for numbers. A field can set its own `autoComplete`, `inputMode` and
  `enterKeyHint`. In a `ResourceView` form, a text field named like a phone number (`phone`,
  `mobile`, `work_tel`) becomes a `tel` field.
- Form controls keep 16px text on a touch screen, so iOS Safari doesn't zoom in on focus. Only a
  mouse gets the 14px text from `md` up.

### Touch targets

On a touch screen (a coarse pointer), these are at least 44px:

- buttons of every size;
- tab triggers;
- inputs and select triggers;
- select options and menu items;
- the AppShell drawer's rows;
- SettingsPage's section links;
- genesis-sites text links.

A mouse keeps the compact sizes.

### Page layouts

- `DashboardPage` puts two stat cards side by side on a phone.
- `SettingsPage` shows its section links as one compact row that scrolls sideways on a phone, and
  as the sticky rail from `navAt` up. A section that is jumped to clears the phone header.

### Motion

`@marktiderman/genesis-ui/styles.css` stops every animation and transition when the person has
asked their device for less motion. They still run, but in an instant, so Radix's open and close
still finish. A spinner keeps turning.

## What an app owes

- **Viewport.** Use
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  `viewport-fit=cover` lets the safe-area padding above take effect. Never block zoom.
- **Full-height pages.** Use `min-h-dvh`, not `min-h-screen`. `100vh` is the browser's largest
  viewport, so a phone's toolbar hides the bottom of the page.
- **Lists.** Turn on `ResourceViewDefaultsProvider phoneMode`. A legacy table that has no card
  view should move to `ResourceView`.
- **Don't fight the primitives.** Don't set a dialog's height in `vh`, don't strip its side
  gutter, and don't hand-build a drawer, bottom sheet or responsive dialog. Pick a
  `mobileLayout` instead.
- **Field types.** Give fields their real type (`email`, `tel`, `url`, `number`). Give a field
  that isn't the person's own data (a project's name) `autoComplete="off"`, so the browser
  doesn't offer the person's name.
- **One nav.** Don't draw a page's own tab row as navigation when AppShell's sub-nav or bottom bar
  already shows the same pages, and keep a way home in every bottom bar.

## How it's kept

- `packages/ui/src/__tests__/mobile-contract.test.ts` reads the source and fails when any of
  these slips:
  - a control loses its 44px touch size;
  - an input shrinks its text on an iPad;
  - something fixed to the bottom edge forgets the home indicator;
  - the reduced-motion rule goes;
  - an overlay is sized in `vh`.
- Overlay, shell and list behaviour have their own tests:
  - `components/ui/__tests__/mobile-overlays.test.tsx`;
  - `components/layout/__tests__/app-shell-mobile.test.tsx`;
  - `components/data/__tests__/resource-view-phone.test.tsx`.
- `genesis doctor` warns in apps through `ui/overlays-fit-the-phone`. It flags a `DialogContent`,
  `AlertDialogContent` or `SheetContent` whose height is set in `vh`.

## Native

`genesis-ui-native` and `genesis-native` follow the same rules with native means: safe areas
from the shell, keyboard-aware scrolling in `SettingsSubPage` and `FormFocus`, and 44pt list
rows. Known gaps:

- `NativeButton` is 40pt at `md` and 36pt at `sm`;
- `ScreenContainer scroll` doesn't use the keyboard-aware scroll;
- the native form field has no `phone-pad` or `textContentType`.
