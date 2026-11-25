#!/usr/bin/env node
// On EAS only: build the Genesis workspace packages this app depends on, right after the install.
//
// Written by `genesis init` for an app made inside the Genesis workspace (`apps/<name>`).
// The app lives in the Genesis monorepo and links the packages (`workspace:^`). Their `dist/` is
// git-ignored, but the app's config loads it (the genesis-cli Expo plugin, genesis-native's
// rich-push plugin) and so does `genesis build-stamp`. Locally `pnpm build:packages` has made it; on
// an EAS build or a workflow job (fingerprint, update) nothing has, so every one would fail.
// `postinstall` runs after every install there: `eas/install_node_modules` in each custom job, and
// the build's own install, before the config is read. EAS sets EAS_BUILD_ID on every job's machine
// (docs.expo.dev/eas/environment-variables/usage, "Built-in environment variables").
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.EAS_BUILD_ID && process.env.EAS_BUILD !== "true") process.exit(0);

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const { name } = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
console.log(`[${name}] Building the workspace packages this app depends on (EAS)…`);
// `<app>^...`: every workspace package the app depends on, in dependency order, not the app itself.
const r = spawnSync("pnpm", ["--dir", join(app, "..", ".."), "--filter", `${name}^...`, "run", "build"], { stdio: "inherit" });
process.exit(r.status ?? 1);
