---
"@marktiderman/genesis-ui": patch
---

Dialogs and sheets fit a phone. Below `sm`, `DialogContent` docks to the bottom edge as a sheet by default. It is capped below the notch, scrolls inside itself and pads clear of the home indicator. `mobileLayout="fullscreen"` or `"center"` choose the other phone layouts. From `sm` up it is the same centred box, now capped to the screen's height and scrolling inside. `AlertDialogContent` keeps a gutter on each side on a phone and scrolls when its text is long. Every `SheetContent` side scrolls inside itself and pads for the safe areas; bottom and top sheets are capped to the screen. The close buttons are 44px targets. Overlays and their backdrops don't animate when reduced motion is asked for. On a phone, `ResourceForm` opens full width: the fields scroll, and Save and Cancel stay pinned to the bottom above the home indicator, where before they scrolled away inside a box nested in another scrolling box.
