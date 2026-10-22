---
"@marktiderman/genesis-ui": minor
---

Router adapters for the navigation contract, so apps stop hand-writing them. `@marktiderman/genesis-ui/router/react-router` exports `ReactRouterLink`, `useReactRouterNavigate`, `useReactRouterSearchParams` and `useReactRouterActivePath`; `@marktiderman/genesis-ui/router/tanstack-router` exports the same four as `TanStackRouterLink` and `useTanStackRouter…`. Pass the link as `linkComponent`, the navigate fn as `onNavigate`, the search-params adapter to `useDataFilters`, and the active path as `activePath`. The TanStack link splits Genesis's `href` into `to`, `search` and `hash`, parsing the query with the router's own `parseSearch`, and both adapters leave the active state (`aria-current`) to Genesis. `react-router` (^7) and `@tanstack/react-router` (^1) are new optional peers, loaded only by their own subpath. Additive: nothing existing changes.
