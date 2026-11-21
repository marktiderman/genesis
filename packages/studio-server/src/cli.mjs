#!/usr/bin/env node
// Deprecated: `genesis-studio-server` is now `genesis-data-server` (@marktiderman/genesis-data-server). This runs it.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pkg = createRequire(import.meta.url).resolve("@marktiderman/genesis-data-server/package.json");
await import(pathToFileURL(path.join(path.dirname(pkg), "dist", "cli.js")).href);
