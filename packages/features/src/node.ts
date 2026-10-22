import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAgentsBlock, replaceAgentsBlock, toAgentsMarkdown, toJson } from "./generate";
import { expiredFlags, type Features, type Flags } from "./model";

/**
 * What `genesis features build` and `check` work from. Paths are relative to
 * `root`.
 *
 * @stability Beta
 */
export interface FeatureOutputOptions {
  /** The repository root. */
  root: string;
  features: Features;
  flags?: Flags;
  /** The registry file, named in the generated output. Default `src/features.ts`. */
  source?: string;
  /** The AGENTS.md to keep the block in, or `false` for none. Default `AGENTS.md`. */
  agents?: string | false;
  /** Where to write the JSON copy, if anywhere. */
  json?: string;
  /** `YYYY-MM-DD`, for the expired-flag warning. Default today (UTC). */
  today?: string;
}

/** @stability Beta */
export interface FeatureCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * Writes every generated output (the AGENTS.md block, and the JSON when
 * asked) and returns the paths it changed.
 *
 * @stability Beta
 */
export function buildFeatureOutputs(options: FeatureOutputOptions): string[] {
  const { root, features, flags, source } = options;
  const agents = options.agents ?? "AGENTS.md";
  const changed: string[] = [];
  const write = (rel: string, next: string) => {
    const file = join(root, rel);
    if (read(file) === next) return;
    writeFileSync(file, next);
    changed.push(rel);
  };
  if (agents) write(agents, replaceAgentsBlock(read(join(root, agents)) ?? "", toAgentsMarkdown(features, flags, { source })));
  if (options.json) write(options.json, toJson(features, flags, { source }));
  return changed;
}

/**
 * Compares each generated output with what the generator makes now, and checks
 * that every `links.code` path (and every repo-relative `links.docs` path)
 * exists. It only ever compares generated output with the generator, never two
 * hand-written files. Expired release flags are warnings.
 *
 * @stability Beta
 */
export function checkFeatureOutputs(options: FeatureOutputOptions): FeatureCheckResult {
  const { root, features, flags, source } = options;
  const agents = options.agents ?? "AGENTS.md";
  const errors: string[] = [];
  const warnings: string[] = [];
  const stale = (rel: string) => `${rel} is stale. Run \`genesis features build\` and commit the result.`;

  if (agents) {
    const doc = read(join(root, agents));
    if (doc === null) errors.push(`${agents} is missing. Run \`genesis features build\`.`);
    else if (readAgentsBlock(doc) !== toAgentsMarkdown(features, flags, { source })) errors.push(stale(agents));
  }
  if (options.json && read(join(root, options.json)) !== toJson(features, flags, { source })) errors.push(stale(options.json));

  for (const [id, def] of Object.entries(features)) {
    for (const path of def.links?.code ?? []) {
      if (!existsSync(join(root, path))) errors.push(`${id}.links.code: ${path} doesn't exist`);
    }
    for (const path of def.links?.docs ?? []) {
      if (!/^https?:\/\//.test(path) && !existsSync(join(root, path))) errors.push(`${id}.links.docs: ${path} doesn't exist`);
    }
  }
  for (const name of expiredFlags(flags, options.today)) {
    warnings.push(`${name} expired on ${flags![name]!.expires}: remove it or move the date`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
