---
"@marktiderman/genesis-forms-builder": minor
---

A host that opts in gets the new worksheet field types in the palette, with icons and settings panels. The default palette (`defaultPalette()`) leaves them out, so existing hosts don't change; opt in with `palette={[...defaultPalette(), ...WORKSHEET_FIELD_TYPES]}`. The types are list (fewest and most items, placeholder), rows (columns with label, key and long answer, reorderable; fewest and most rows), notes at moments (most notes) and highlights (passage, most highlights). A new rows field starts with the SMACtalk columns (`SMACTALK_COLUMNS`: Say, Mean, Apply, Commit). The builder's own editors are exported as `BUILT_IN_FIELD_EDITORS`; a host `fieldEditors` entry for the same type replaces one.
