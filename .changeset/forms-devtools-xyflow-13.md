---
"@marktiderman/genesis-forms-devtools": patch
---

The flow map runs on `@xyflow/react` 13 (was 12). Version 13 reads a bare number in `fitViewOptions.padding` as pixels, so the map now asks for `"10%"` and keeps the margin it had around the form. React Flow 13 brings zustand 5 and a new `@xyflow/system`, which your app installs with it; nothing in this package's API changes.
