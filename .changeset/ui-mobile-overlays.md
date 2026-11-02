---
"@marktiderman/genesis-ui": minor
---

Dialogs, alert dialogs, sheets and drawers fit a phone.

What changes by default, for every existing overlay:

- **Height caps in `dvh`.** `DialogContent` and `AlertDialogContent` are capped to the screen's height (`dvh`, inside the top and bottom safe areas on a phone) and scroll inside themselves, so the actions at the bottom can always be reached. Bottom and top `SheetContent` and `DrawerContent` are capped below the notch. `DetailPanel`'s dialog and `ResourceForm`'s fields use `dvh` where the browser has it (a phone's toolbar cuts `vh` off), and keep `85vh` and `60vh` where it doesn't. A caller's own `max-h-*`, padding, border or width on `DialogContent` still wins at every size.
- **Safe areas.** Side sheets pad clear of the notch and the home indicator; bottom sheets and drawers pad above the home indicator. A dialog on a phone keeps its side gutters and stays clear of both.
- **44px close buttons** on `DialogContent` and `SheetContent` (the icon is unchanged; its hit area grows).
- **Reduced motion.** Overlays and their backdrops don't animate when reduced motion is asked for.
- **`ResourceForm` on a phone pins Save and Cancel.** It already opens as a side sheet on a phone. The fields now scroll inside the sheet and the actions stay pinned at the bottom, above the home indicator, where before they sat after a `60vh` scrolling box inside a sheet that scrolled too, and scrolled out of reach. (iOS Safari's keyboard doesn't resize the viewport, so with the keyboard up the footer can still sit under it.) The sheet's header and footer gain a border line; its width is unchanged. This also applies to `layout="sheet"` on a desktop.

- **Small visual changes.** Bottom sheets get `rounded-t-xl` corners. Every sheet scrolls inside itself (`overflow-y-auto`). The close buttons of dialogs and sheets show their focus ring for keyboard focus only (`focus-visible`), drop the open-state background, and sit about 2px closer to the corner. `DetailPanel`'s sheet and the chat thread's search sheet pad clear of the notch and the home indicator themselves, since their `p-0` replaces the sheet's.

The dialog's position on a phone does not change: it is still the centred box.

Added:

- **`DialogContent mobileLayout`** (`"center" | "sheet" | "fullscreen"`, type `DialogMobileLayout`), opt-in per dialog. `center` is the default and today's layout. `sheet` docks the dialog to the bottom edge at full width on a phone, as tall as its content up to the top safe area. `fullscreen` fills the screen inside the safe areas, for long forms, editors and media. From `sm` up every layout is the same centred box.
