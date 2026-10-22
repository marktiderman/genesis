/**
 * `genesis features build|check`: load the repo's feature registry (a
 * TypeScript file that running code imports) and write or check everything
 * generated from it. The logic lives in `@marktiderman/genesis-features/node`;
 * this file only finds and loads the registry.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";
import {
  buildFeatureOutputs,
  checkFeatureOutputs,
  type FeatureCheckResult,
} from "@marktiderman/genesis-features/node";
import type { Features, Flags } from "@marktiderman/genesis-features";

export interface FeaturesCommandOptions {
  /** The repo root. */
  dir: string;
  /** The registry file. Default: src/features.ts, then features.ts. */
  registry?: string;
  /** A separate flags file exporting `flags`. Default: the registry's own `flags` export, if any. */
  flags?: string;
  /** The AGENTS.md to keep the block in, or false. */
  agents: string | false;
  /** Where to keep a JSON copy, if anywhere. */
  json?: string;
}

const DEFAULT_REGISTRIES = ["src/features.ts", "features.ts"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadRegistry(options: FeaturesCommandOptions) {
  const root = path.resolve(options.dir);
  const registry = options.registry ?? DEFAULT_REGISTRIES.find((p) => existsSync(path.join(root, p)));
  if (!registry || !existsSync(path.join(root, registry))) {
    throw new Error(`No feature registry found. Looked for ${options.registry ?? DEFAULT_REGISTRIES.join(" and ")}; pass --registry.`);
  }
  const jiti = createJiti(path.join(root, "package.json"), { moduleCache: false });
  const load = async (file: string) => (await jiti.import(path.join(root, file))) as Record<string, unknown>;

  const mod = await load(registry);
  const features = mod.features ?? mod.default;
  if (!isObject(features)) throw new Error(`${registry} must export \`features\` (from defineFeatures).`);
  const flags = options.flags ? (await load(options.flags)).flags : mod.flags;
  if (flags !== undefined && !isObject(flags)) {
    throw new Error(`${options.flags ?? registry}'s \`flags\` export must be an object (from defineFlags).`);
  }
  return {
    root,
    source: registry.split(path.sep).join("/"),
    features: features as Features,
    flags: flags as Flags | undefined,
  };
}

export async function runFeaturesBuild(options: FeaturesCommandOptions): Promise<string[]> {
  const loaded = await loadRegistry(options);
  return buildFeatureOutputs({ ...loaded, agents: options.agents, json: options.json });
}

export async function runFeaturesCheck(options: FeaturesCommandOptions): Promise<FeatureCheckResult> {
  const loaded = await loadRegistry(options);
  return checkFeatureOutputs({ ...loaded, agents: options.agents, json: options.json });
}
