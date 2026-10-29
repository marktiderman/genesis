/** Set at build time by vite.config.ts. */
declare const __GENESIS_BUILD__: { version: string; commit: string; date: string };

export const BUILD: { version: string; commit: string; date: string } =
  typeof __GENESIS_BUILD__ === "undefined" ? { version: "dev", commit: "", date: "" } : __GENESIS_BUILD__;

export const COMMIT_URL = BUILD.commit ? `https://github.com/marktiderman/genesis/commit/${BUILD.commit}` : undefined;
