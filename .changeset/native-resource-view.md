---
"@marktiderman/genesis-ui-native": minor
---

`<NativeResourceView view={...} />`: a native list screen from a `genesis-core/resource-view` view, in one line. It reads the same view as the web's `ResourceView`.

**What maps where:**
- `view.summary(row)` gives a row's title, subtitle and chip in a `NativeListItem`. The subtitle is the summary's only, never a raw column.
- The view's `groupBy` gives `SectionList` sections, inset grouped on iOS.
- `view.can()` gives the swipe actions (InboxPage's shape: long press, accessibility actions and a `swipeable` slot). A refused action keeps its place and says why. Delete reads "Move to Bin" when the provider bins deletes.
- `view.form(mode)` and `view.writable(mode)` give the form sheet: Cancel and Save in the bar, sections as groups, native date and time pickers, choices as a segmented control or a list. Read-only fields (a required link, for one) show as text, never inputs. An edit sends only writable keys; a create also saves the screen's `filter` values, so a new row lands in the list it was made from.

**Behaviour:**
- Paging is by cursor on `onEndReached`, and search waits 300 ms after the last keystroke.
- A delete is optimistic and comes back if the server refuses; the refusal shows inline in plain words.
- A row press calls `onRowPress` (push a detail route) or opens a peek sheet. The peek shows `view.columns()` drawn like the web's, so `when` and sensitive values stay hidden.

**Also new:**
- `useNativeResourceView` is the headless form.
- `DisplayRenderersProvider` replaces how a display hint draws, with the web's shape. Links and images go through core's `isSafeUrl`, and calendar days are formatted from their parts.
