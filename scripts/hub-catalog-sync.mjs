#!/usr/bin/env node
// Pushes this repo's feature registry (features.json, written by `pnpm features build`) to the
// Product hub, whose product with catalog_ref `marktiderman/genesis` then lists Genesis's features
// as the registry has them: key, name, status and owner are the registry's, and the hub refuses
// edits to them; a retired feature is archived there. The hub owns everything else.
//
// It calls the hub's `product_sync_catalog(p_catalog_ref, p_version, p_features)` with the hub's
// service key, the same path a consumer app's deploy uses for its own registry. The version is the
// commit's time in ms, so an older commit never syncs over a newer one.
//
// Environment: HUB_SUPABASE_URL and HUB_SUPABASE_SECRET_KEY (the hub's project URL and a secret
// key). Without them it says so and exits 0: syncing is optional for anyone running Genesis.
//
//   node scripts/hub-catalog-sync.mjs [--dry-run]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const CATALOG_REF = "marktiderman/genesis";

/** The registry's columns the hub takes, for every feature (retired ones included). */
export function catalogFeatures(registry) {
  const list = Array.isArray(registry?.features) ? registry.features : [];
  return list.map((f) => ({ key: f.id, name: f.name, status: f.status, owner: f.owner ?? null }));
}

function commitVersion(root) {
  const seconds = Number(execFileSync("git", ["log", "-1", "--format=%ct"], { cwd: root, encoding: "utf8" }).trim());
  return seconds * 1000;
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");
  const features = catalogFeatures(JSON.parse(readFileSync(join(root, "features.json"), "utf8")));
  if (features.length === 0) throw new Error("features.json has no features: run pnpm features build");
  const version = commitVersion(root);
  if (dryRun) {
    console.log(JSON.stringify({ catalog: CATALOG_REF, version, features: features.length }));
    return;
  }
  const url = process.env.HUB_SUPABASE_URL;
  const key = process.env.HUB_SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.log("Hub catalog sync: HUB_SUPABASE_URL and HUB_SUPABASE_SECRET_KEY aren't set; nothing synced.");
    return;
  }
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/product_sync_catalog`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_catalog_ref: CATALOG_REF, p_version: version, p_features: features }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`product_sync_catalog answered ${res.status}: ${text.slice(0, 500)}`);
  const result = JSON.parse(text || "{}");
  if (!result.product) {
    console.log(`Hub catalog sync: the hub has no product with catalog ${CATALOG_REF}; nothing synced.`);
    return;
  }
  console.log(`Hub catalog sync: ${result.product} ${JSON.stringify(result)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
