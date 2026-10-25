---
"@marktiderman/genesis-sites": patch
---

The site editor no longer saves over another editor's work after a publish: a change made while publishing is saved on the new revision only when the store still holds what the publish left; otherwise it meets the conflict dialog. While a publish runs (or in view-only mode) the Add, Up, Down and Remove buttons and the menu editor are off too. A slot inside an object or a list item is reported as "can't be edited here" instead of being treated as a top-level slot.
