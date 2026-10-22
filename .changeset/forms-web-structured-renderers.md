---
"@marktiderman/genesis-forms-web": minor
---

Renderers for the `list`, `table`, `media-notes` and `text-highlights` field types, in `defaultRegistry`. Lists and tables add, remove and reorder entries (SortableList: drag, keyboard and a Move menu). Media notes take a typed time (`m:ss`, `h:mm:ss` or seconds); text highlights come from selecting words in the passage or typing them. New `MediaTimeContext` / `useMediaTime` (type `MediaTime`) link notes to the host's video or audio player (`currentTime` prefills "Add note at 1:23", `seek` plays from a note), and `SourceTextContext` / `useSourceText` supply the passage to highlight.
