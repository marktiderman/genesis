---
"@marktiderman/genesis-ui": minor
---

Dialogs, alert dialogs, sheets and drawers fit a phone.

What changes by default, for every existing overlay:

- **Height caps in `dvh`.** `DialogContent` and `AlertDialogContent` are capped to the screen's height (`dvh`, inside the top and bottom safe areas on a phone) and scroll inside themselves, so the actions at the bottom can always be reached. Bottom and top `SheetContent` and `DrawerContent` are capped below the notch. `DetailPanel`'s dialog drops its `max-h-[85vh]` for the dialog's own cap, and `ResourceForm`'s dialog caps its fields at `60dvh` instead of `60vh` (a phone's toolbar cuts `vh` off).
- **Safe areas.** Side sheets pad clear of the notch and the home indicator; bottom sheets and drawers pad above the home indicator. A dialog on a phone keeps its side gutters and stays clear of both.
- **44px close buttons** on `DialogContent` and `SheetContent` (the icon is unchanged; its hit area grows).
- **Reduced motion.** Overlays and their backdrops don't animate when reduced motion is asked for.
- **`ResourceForm` on a phone pins Save and Cancel.** It already opens as a side sheet on a phone. The fields now scroll inside the sheet and the actions stay pinned at the bottom, above the home indicator, where before they sat after a `60vh` scrolling box inside a sheet that scrolled too, and scrolled out of reach (worst with the keyboard up). The sheet's header and footer gain a border line; its width is unchanged. This also applies to `layout="sheet"` on a desktop.

The dialog's position on a phone does not change: it is still the centred box.

Added:

- **`DialogContent mobileLayout`** (`"center" | "sheet" | "fullscreen"`, type `DialogMobileLayout`), opt-in per dialog. `center` is the default and today's layout. `sheet` docks the dialog to the bottom edge at full width on a phone, as tall as its content up to the top safe area. `fullscreen` fills the screen inside the safe areas, for long forms, editors and media. From `sm` up every layout is the same centred box.
