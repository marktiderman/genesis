---
"@marktiderman/genesis-forms-web": minor
---

Renderers for the `list`, `rows`, `timestamp-notes` and `highlights` field types, in `defaultRegistry`. Lists and rows add, remove and reorder entries (SortableList: drag, keyboard and a Move menu). Notes take a typed time (`m:ss`, `h:mm:ss` or seconds); highlights come from selecting words in the passage or typing them. New `SubjectTimeContext` / `useSubjectTime` link notes to the host's video player (`currentTime` prefills "Add note at 1:23", `seek` plays from a note), and `SubjectTextContext` / `useSubjectText` supply the passage to highlight.
