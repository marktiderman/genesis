---
"@marktiderman/genesis-forms-builder": minor
---

The `photo` field type in the builder, for a host that opts in with `palette={[...defaultPalette(), ...UPLOAD_FIELD_TYPES]}` (it stays out of `defaultPalette()`, since the host must store the files): a camera icon and a settings panel for the most photos (1–5), the largest photo in MB (1–25) and the formats (at least one stays on). Formulas can't read photos, so `formulaNames` leaves them out.
