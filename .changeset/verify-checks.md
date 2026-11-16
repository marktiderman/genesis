---
"@marktiderman/genesis-cli": minor
---

`@marktiderman/genesis-cli/verify`: the runtime conformance checks behind Genesis's Conformance CI job (and the coming `genesis verify`). `checkPage(page, { viewport })` runs, in a Playwright page: sideways scroll and anything past the viewport outside a scrolling frame (WCAG 1.4.10), axe's WCAG 2.2 A/AA rules with `target-size`, 44px hit areas on a coarse pointer (genesis-ui's `touchTarget` counts), focus hidden under a fixed or sticky bar (2.4.11), more than one floating control on a phone, and a viewport meta without `viewport-fit=cover` and `interactive-widget=resizes-content` (docs/RESPONSIVE.md). `allViewports()` and `contextOptions()` give the matrix (six widths, 200% and 400% zoom as 640×512 and 320×256, touch on phones and tablets, reduced motion), and `applyAllow` the doctor-style known-findings list. `@playwright/test` and `@axe-core/playwright` are optional peers, needed only by this entry.
