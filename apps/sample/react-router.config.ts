import type { Config } from "@react-router/dev/config";

// The Pages site is served at the root of its custom domain,
// https://genesisone.dev, so every build uses the root path. PAGES_BASE
// (e.g. "/genesis/") builds for a subpath instead, such as the bare
// https://<org>.github.io/<repo>/ project site. Keep it in step with
// vite.config.ts's `base`. See react-router's `basename` config.
export default {
  ssr: false,
  basename: process.env.PAGES_BASE ?? "/",
} satisfies Config;
