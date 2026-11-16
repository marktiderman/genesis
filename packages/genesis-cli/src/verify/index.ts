/**
 * `@marktiderman/genesis-cli/verify`: the runtime conformance checks (docs/RESPONSIVE.md, WCAG
 * 2.2 reflow, target size, focus not obscured, axe). Genesis's own CI runs them over the sample
 * app and Storybook; `genesis verify` runs them over an app. Needs the optional peers
 * `@playwright/test` and `@axe-core/playwright`.
 */
export { domChecks, type DomCheckOptions, type DomFinding } from "./dom.js";
export { checkPage, zoomText, AXE_TAGS, type CheckId, type CheckPageOptions, type Finding } from "./page.js";
export { ENGINES, TEXT_ZOOM_VIEWPORT, WIDTHS, ZOOM_VIEWPORTS, allViewports, contextOptions, runsIn, widthViewport, type Engine, type Viewport } from "./matrix.js";
export { allowFor, applyAllow, formatFinding, matchesPage, validateAllow, type AllowEntry, type Where } from "./allow.js";
export { flattenReactRouterRoutes, matchesPattern, onePathPerPattern, patternFor, type ReactRouterRoute, type RoutePattern } from "./routes.js";
