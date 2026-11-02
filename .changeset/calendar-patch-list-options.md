---
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-studio": patch
"@marktiderman/genesis-core": patch
---

ResourceView's calendar mode now honours the list's options. `resourceOptions.enabled` holds the requests while a screen waits on its scope. `resourceOptions.select` is sent with both requests, so joined columns show. `live` subscribes and refetches as a list does. The list and the calendar build their filters and peek from one place, so they can't drift. In development, a `select` that leaves out the calendar's own fields warns. "+N more" no longer disappears once opened: it becomes "Show fewer". Focus stays put when it opens (it moves to the first revealed event, or stays on the toggle) and when PageDown leaves a lane the next week doesn't have (it goes to the same day in the first lane). A bad `timeZone` throws a `ResourceView(resource): …` error. The lanes layout buckets events once, so moving focus is fast with thousands of events. Lanes from a link (`laneBy` on a field with `references`) show the linked row's words, never the raw id. Studio's calendar is busy while a new month loads. Focus also stays in the grid when new data removes the focused lane.
