---
"@marktiderman/genesis-cli": minor
---

`genesis figma:routes`: a read-only check that an app's Figma app file covers its routes. With a `figma` block in genesis.config.json (`file`, `pages.web` / `pages.native`, `proposalsPage`) and `FIGMA_ACCESS_TOKEN`, it reads the app's Expo Router and TanStack routes, the navigation targets its code names as string literals, and the file's frames and prototype links through the REST API, and reports routes with no frame, frames with no route, the Proposals page by section, navigation with no hotspot, hotspots to a frame with no route, and `// figma: <node-id>` route comments that don't match (`--json` for CI). The doctor runs it as the `figma-routes` rule: `info`, `warn` under `--strict`, never `error`.
