import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import { sitesDemo } from "./sites-demo/vite-plugin";
import { studioDevServer } from "./studio/vite-plugin";

// The footer's version, commit and build date. The version is the umbrella
// package's (the one version coordinate for Genesis); the commit comes from
// the host's build variables, or git.
function buildInfo() {
  const version = JSON.parse(readFileSync(new URL("../../packages/genesis/package.json", import.meta.url), "utf8")).version as string;
  let commit =
    process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_REF ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      commit = "";
    }
  }
  return { version, commit: commit.slice(0, 7), date: new Date().toISOString().slice(0, 10) };
}

export default defineConfig(({ mode }) => ({
  define: { __GENESIS_BUILD__: JSON.stringify(buildInfo()) },
  // react-router.config.ts's `basename` only prefixes routes; asset URLs
  // come from Vite's `base`. Keep the two in step. The Pages site is served
  // at the root of https://genesisone.dev, so both default to "/"; set
  // PAGES_BASE (e.g. "/genesis/") only to build for a subpath again.
  base: process.env.PAGES_BASE ?? "/",
  // The studio handler runs in the dev server only (`apply: "serve"`), so a
  // production build of this static sample is unchanged by it.
  // The genesis-sites demo answers /sites-demo/* in dev and preview, and is
  // prerendered into the static build (sites-demo/vite-plugin.ts).
  plugins: [sitesDemo(), tailwindcss(), reactRouter(), studioDevServer(loadEnv(mode, process.cwd(), "STUDIO_"))],
  resolve: { tsconfigPaths: true },
  server: { port: 3200 },
}));
