import type { Config } from "@react-router/dev/config";
import { prerenderPaths } from "./app/lib/site-paths";

// The Pages site is served at the root of its custom domain,
// https://genesisone.dev, so every build uses the root path. PAGES_BASE
// (e.g. "/genesis/") builds for a subpath instead, such as the bare
// https://<org>.github.io/<repo>/ project site. Keep it in step with
// vite.config.ts's `base`. See react-router's `basename` config.
//
// Every page is prerendered to its own index.html (app/lib/site-paths.ts),
// so a deep link answers 200 with its own title and description on any
// static host; any other path gets the SPA fallback.
export default {
  ssr: false,
  basename: process.env.PAGES_BASE ?? "/",
  prerender: prerenderPaths(),
} satisfies Config;
