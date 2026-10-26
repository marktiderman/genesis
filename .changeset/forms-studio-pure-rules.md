---
"@marktiderman/genesis-forms-studio": minor
---

`/rules` is pure: it imports only `@marktiderman/genesis-forms` and `@marktiderman/genesis-core` (a new peer, 1.12.0 or later), never React, react-dom or genesis-ui, so a phone app or a server can compute form summaries without installing them. `@marktiderman/genesis-ui`, `react` and `react-dom` are now optional peers, needed only for the components. A test checks the built `dist/rules.js` and `dist/rules.d.ts` and everything they load, and imports `/rules` in Node with no React installed.

`FormNavItem` is now a shape (`NavItemShape`) rather than genesis-ui's `SubNavItem`, and still passes to `useAppShellSubNav`: `FormNavItem<Icon>` takes the icon's type, `never` by default, and `formNavItems` infers it from the icons you pass. `headlineCards` returns core's `HeadlineNumber` (string or number values), which genesis-ui's `HeadlineNumbers` accepts.

Features: forms-studio, resource-workspace
