---
"@marktiderman/genesis-cli": minor
---

`@marktiderman/genesis-cli/verify`: the runtime conformance checks behind Genesis's Conformance CI job, for an app's own Playwright tests too. `checkPage(page, { viewport })` runs axe's WCAG 2.2 A/AA rules with `target-size`, then the in-page checks: sideways scroll of the page or an app shell's scroller, and anything past the viewport outside a frame that scrolls wide content (WCAG 1.4.10); text cut off at 200% text size (1.4.4, the `text-200` viewport with `zoomText`); 44px hit areas on a coarse pointer, hit-tested (genesis-ui's `touchTarget` counts); focus hidden under a fixed or sticky bar (2.4.11); more than one floating control on a phone; and a viewport meta without `viewport-fit=cover` and `interactive-widget=resizes-content` (docs/RESPONSIVE.md). `allViewports()` and `contextOptions()` give the matrix (six widths with touch at 768px and below, 200% and 400% zoom as 640×512 and 320×256 with a mouse, text at 200%, reduced motion); `flattenReactRouterRoutes` and `onePathPerPattern` pick one page per route; `applyAllow` applies a doctor-style known-findings list. `@playwright/test` and `@axe-core/playwright` are optional peers, needed only by this entry.

Features: cli-conformance
