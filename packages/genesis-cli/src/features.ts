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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { createJiti } from "jiti";
import {
  buildFeatureOutputs,
  checkFeatureOutputs,
  summarizeCheck,
  type FeatureCheckResult,
  type FeaturePrEvidence,
  type FeatureProjectOptions,
} from "@marktiderman/genesis-features/node";
import { findFeatures, type FeatureRecord, type Features, type FindOptions, type Flags } from "@marktiderman/genesis-features";

type Settings = Omit<FeatureProjectOptions, "root" | "features" | "flags" | "labels" | "today" | "evidence">;

/** Runs `gh` with these arguments in `cwd` and returns its stdout; throws when it can't. */
export type GhRunner = (args: string[], cwd: string) => string;

export interface FeaturesCommandOptions extends Settings {
  /** The repo root. */
  dir: string;
  /** The registry file. Default: src/features.ts, then features.ts. */
  registry?: string;
  /** A separate flags file exporting `flags`. Default: the registry's own `flags` export, if any. */
  flagsFile?: string;
  /** The PR's labels, for `check`. */
  labels?: string[];
  /** `check`: also read merged PRs labelled `feature:<id>` for planned features, with `gh`. */
  prs?: boolean;
  /** How `--prs` runs `gh`. Tests pass a fake. */
  gh?: GhRunner;
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
  const { dir: _dir, registry: _registry, flagsFile: _flagsFile, prs: _prs, gh: _gh, ...rest } = options;
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

const runGh: GhRunner = (args, cwd) =>
  execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });

/** Labels per `gh` search: a comma list is an OR, and GitHub caps a query's length. */
const LABELS_PER_SEARCH = 10;

/** Why `gh` failed, in one line: not installed, timed out, or the first line it printed. */
function ghFailure(error: unknown): string {
  const e = error as NodeJS.ErrnoException & { stderr?: string | Buffer; signal?: string };
  if (e?.code === "ENOENT") return "gh is not installed";
  if (e?.code === "ETIMEDOUT" || e?.signal === "SIGTERM") return "gh timed out";
  const stderr = e?.stderr?.toString().trim();
  return (stderr || String(error instanceof Error ? error.message : error)).split("\n")[0]!;
}

/**
 * Merged PRs labelled `feature:<id>`, for each planned feature's id and
 * aliases, read with one `gh` search per ten labels. Only planned features
 * are asked about: that is all the evidence is for. When `gh` is missing or
 * fails, stops and says so once.
 */
export function gatherPrEvidence(project: FeatureProjectOptions, gh: GhRunner = runGh): { prs: Record<string, FeaturePrEvidence[]>; warning?: string } {
  const prs: Record<string, FeaturePrEvidence[]> = {};
  const names = Object.entries(project.features)
    .filter(([, f]) => f.status === "planned")
    .flatMap(([id, f]) => [id, ...(f.aliases ?? [])]);
  for (let i = 0; i < names.length; i += LABELS_PER_SEARCH) {
    const batch = names.slice(i, i + LABELS_PER_SEARCH);
    const search = `label:${batch.map((n) => `"feature:${n}"`).join(",")}`;
    try {
      const out = gh(["pr", "list", "--state", "merged", "--search", search, "--limit", "1000", "--json", "number,title,labels"], project.root);
      for (const { number, title, labels } of JSON.parse(out) as (FeaturePrEvidence & { labels: { name: string }[] })[]) {
        for (const { name: label } of labels) {
          const name = label.startsWith("feature:") ? label.slice("feature:".length) : null;
          if (name && batch.includes(name)) (prs[name] ??= []).push({ number, title });
        }
      }
    } catch (error) {
      return { prs, warning: `--prs: couldn't read merged PRs with gh (${ghFailure(error)}), so only changesets were checked for shipped work` };
    }
  }
  return { prs };
}

export async function runFeaturesCheck(options: FeaturesCommandOptions): Promise<FeatureCheckResult & { summary: string }> {
  const project = await loadRegistry(options);
  const evidence = options.prs ? gatherPrEvidence(project, options.gh) : undefined;
  const result = checkFeatureOutputs({ ...project, evidence: evidence && { prs: evidence.prs } });
  let summary = summarizeCheck(result, project.features);
  if (evidence?.warning) {
    result.warnings.push(evidence.warning);
    summary = `${summarizeCheck(result, project.features)}\n- ${evidence.warning}.`;
  }
  return { ...result, summary };
}

export async function runFeaturesFind(options: FeaturesCommandOptions, term: string, filters: FindOptions = {}): Promise<FeatureRecord[]> {
  const project = await loadRegistry(options);
  return findFeatures(project.features, term, project.flags, filters);
}

/** One search hit, for the terminal. */
export function formatFeature(r: FeatureRecord): string {
  const kind = r.layer ? ` ${r.layer}` : "";
  const lines = [`${r.id} — ${r.name} [${r.status}${r.horizon ? `, ${r.horizon}` : ""}]${kind} (${r.owner})`, `  ${r.summary}`];
  if (r.platforms) lines.push(`  platforms: ${Object.entries(r.platforms).map(([p, s]) => `${p} ${s}`).join(", ")}`);
  if (r.entry) lines.push(`  import: ${Object.entries(r.entry).map(([p, e]) => `${e} (${p})`).join(", ")}`);
  if (r.extends) lines.push(`  variant of: ${r.extends}`);
  if (r.slots?.length) lines.push(`  slots: ${r.slots.join(", ")}`);
  if (r.requires?.length) lines.push(`  requires: ${r.requires.join(", ")}`);
  if (r.links?.code?.length) lines.push(`  code: ${r.links.code.join(", ")}`);
  if (r.flags.length) lines.push(`  flags: ${r.flags.join(", ")}`);
  if (r.claimedBy) lines.push(`  being built by ${r.claimedBy}`);
  return lines.join("\n");
}
