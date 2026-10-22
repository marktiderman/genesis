/**
 * `genesis features build|check|find`: load the repo's feature registry (a
 * TypeScript file that running code imports) and its settings, then write,
 * check or search what is generated from it. The logic lives in
 * `@marktiderman/genesis-features/node`; this file finds and loads things.
 *
 * Settings come from `package.json` → `"genesisFeatures"` (any
 * `FeatureProjectOptions` field that is a path, a list or a switch, plus
 * `registry` and `flagsFile`); command-line options win.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";
import {
  buildFeatureOutputs,
  checkFeatureOutputs,
  summarizeCheck,
  type FeatureCheckResult,
  type FeatureProjectOptions,
} from "@marktiderman/genesis-features/node";
import { findFeatures, type FeatureRecord, type Features, type Flags } from "@marktiderman/genesis-features";

type Settings = Omit<FeatureProjectOptions, "root" | "features" | "flags" | "labels" | "today">;

export interface FeaturesCommandOptions extends Settings {
  /** The repo root. */
  dir: string;
  /** The registry file. Default: src/features.ts, then features.ts. */
  registry?: string;
  /** A separate flags file exporting `flags`. Default: the registry's own `flags` export, if any. */
  flagsFile?: string;
  /** The PR's labels, for `check`. */
  labels?: string[];
}

const DEFAULT_REGISTRIES = ["src/features.ts", "features.ts"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** package.json's "genesisFeatures", under the command line's options. */
function settings(root: string, options: FeaturesCommandOptions): FeaturesCommandOptions {
  let fromPackage: Record<string, unknown> = {};
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as Record<string, unknown>;
    if (isObject(pkg.genesisFeatures)) fromPackage = pkg.genesisFeatures;
  } catch {
    // No package.json: command-line options only.
  }
  const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
  return { ...fromPackage, ...given } as FeaturesCommandOptions;
}

export async function loadRegistry(input: FeaturesCommandOptions) {
  const root = path.resolve(input.dir);
  const options = settings(root, input);
  const registry = options.registry ?? DEFAULT_REGISTRIES.find((p) => existsSync(path.join(root, p)));
  if (!registry || !existsSync(path.join(root, registry))) {
    throw new Error(`No feature registry found. Looked for ${options.registry ?? DEFAULT_REGISTRIES.join(" and ")}; pass --registry.`);
  }
  const jiti = createJiti(path.join(root, "package.json"), { moduleCache: false });
  const load = async (file: string) => (await jiti.import(path.join(root, file))) as Record<string, unknown>;

  const mod = await load(registry);
  const features = mod.features ?? mod.default;
  if (!isObject(features)) throw new Error(`${registry} must export \`features\` (from defineFeatures).`);
  const flags = options.flagsFile ? (await load(options.flagsFile)).flags : mod.flags;
  if (flags !== undefined && !isObject(flags)) {
    throw new Error(`${options.flagsFile ?? registry}'s \`flags\` export must be an object (from defineFlags).`);
  }
  const { dir: _dir, registry: _registry, flagsFile: _flagsFile, ...rest } = options;
  const project: FeatureProjectOptions = {
    ...rest,
    root,
    source: options.source ?? registry.split(path.sep).join("/"),
    features: features as Features,
    flags: flags as Flags | undefined,
  };
  return project;
}

export async function runFeaturesBuild(options: FeaturesCommandOptions): Promise<string[]> {
  return buildFeatureOutputs(await loadRegistry(options));
}

export async function runFeaturesCheck(options: FeaturesCommandOptions): Promise<FeatureCheckResult & { summary: string }> {
  const project = await loadRegistry(options);
  const result = checkFeatureOutputs(project);
  return { ...result, summary: summarizeCheck(result, project.features) };
}

export async function runFeaturesFind(options: FeaturesCommandOptions, term: string): Promise<FeatureRecord[]> {
  const project = await loadRegistry(options);
  return findFeatures(project.features, term, project.flags);
}

/** One search hit, for the terminal. */
export function formatFeature(r: FeatureRecord): string {
  const lines = [`${r.id} — ${r.name} [${r.status}${r.horizon ? `, ${r.horizon}` : ""}] (${r.owner})`, `  ${r.summary}`];
  if (r.links?.code?.length) lines.push(`  code: ${r.links.code.join(", ")}`);
  if (r.flags.length) lines.push(`  flags: ${r.flags.join(", ")}`);
  if (r.claimedBy) lines.push(`  being built by ${r.claimedBy}`);
  return lines.join("\n");
}
