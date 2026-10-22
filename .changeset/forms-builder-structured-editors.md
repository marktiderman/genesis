---
"@marktiderman/genesis-forms-builder": minor
---

A host that opts in gets the structured field types in the palette, with icons and settings panels. The default palette (`defaultPalette()`) leaves them out, so existing hosts don't change; opt in with `palette={[...defaultPalette(), ...STRUCTURED_FIELD_TYPES]}`. The types are list (fewest and most items, placeholder), table (columns with label, key and long answer, reorderable; fewest and most rows), media notes (most notes) and text highlights (passage, most highlights). A new table field starts with two neutral columns ("Column 1", "Column 2") for the author to rename. The builder's own editors are exported as `BUILT_IN_FIELD_EDITORS`; a host `fieldEditors` entry for the same type replaces one.
