---
"@marktiderman/genesis-design-system": minor
---

A WCAG contrast check for brands. `validateBrand` returns `warnings` for every theme role pair the brand draws under its minimum (4.5:1 for text, 3:1 for fills, the focus ring and status marks) and for every `extensions` color against the text drawn on it: a scale's new optional `foreground` stop, or else the brand's text and surface colors. `ok` stays true for them, so an existing brand keeps building; only body text under 1.5:1 on its page is an error. `brandContrastProblems(brand)` returns the same findings as data. `createGenesisNativewindPreset({ brand })` also makes the brand's extension colors classes, under the kebab-case names `tailwindFromBrand` gives them on web (`bg-game-mode-solo`).
