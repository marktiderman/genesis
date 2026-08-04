import type { Config } from "@react-router/dev/config";

// GH_PAGES is set only by .github/workflows/deploy-pages.yml's build step —
// local dev and every other build (CI, `pnpm build`) stay at the root path.
// GitHub Pages serves a project site at https://<org>.github.io/<repo>/, a
// subpath, so the deployed build needs every route/asset URL prefixed with
// /genesis/ or navigation breaks. See react-router's `basename` config
// (the framework-native mechanism for this — not a raw Vite `base` hack).
export default {
  ssr: false,
  basename: process.env.GH_PAGES ? "/genesis/" : "/",
} satisfies Config;
