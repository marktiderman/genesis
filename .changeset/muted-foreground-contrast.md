---
"@marktiderman/genesis-design-system": minor
---

Muted text reads at AA on the muted fill as well as the page. The Genesis light `--muted-foreground` (`mutedForeground` on native) is zinc 600 (`#52525b`, 7.0:1 on `--muted`) in place of zinc 500 (`#71717a`, 4.40:1 on `--muted`, under AA for an unselected segment's label). A brand's muted text is now the first neutral from 500 down that reads at 4.5:1 on both its page and its muted fill, and `brandContrastProblems` checks muted text on the muted fill. Dark mode is unchanged.
