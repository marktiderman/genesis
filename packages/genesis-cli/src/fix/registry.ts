/**
 * Where fixes come from: Genesis's own (builtin.ts) and the ones packages declare in package.json
 * `genesis.doctor.fixes`, a module in the package loaded like a doctor plugin. A package's fixes are
 * namespaced like its rules (`ui/…`) and may only fix its own rules, so no package can take over
 * a built-in rule's fix.
 */
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { DeclaringPackage } from "../doctor/types.js";
import { builtinFixes, type BuiltinDeps } from "./builtin.js";
import type { Fix } from "./types.js";

export { builtinFixes, type BuiltinDeps };

const KINDS = new Set(["auto", "guided", "manual"]);

/** Identity helper that types a fix. */
export function defineFix(fix: Fix): Fix {
  return fix;
}

/** Why a value isn't a Fix, or null. */
function fixProblem(value: unknown): string | null {
  if (!value || typeof value !== "object") return "a fix must be an object";
  const f = value as Partial<Fix>;
  if (typeof f.id !== "string" || !/^[a-z0-9][a-z0-9.-]*$/.test(f.id)) return `a fix's id must be lower-case words, dots and dashes (got ${JSON.stringify(f.id)})`;
  if (!KINDS.has(f.kind as string)) return `${f.id}: kind must be auto, guided or manual`;
  if (!Array.isArray(f.rules) || !f.rules.length || f.rules.some((r) => typeof r !== "string")) return `${f.id}: rules must list the rule ids it fixes`;
  if (typeof f.title !== "string" || !f.title.trim()) return `${f.id}: needs a title`;
  if (typeof f.plan !== "function") return `${f.id}: needs plan(context)`;
  return null;
}

export interface LoadedFixes {
  fixes: Fix[];
  /** A package whose fixes module couldn't be used, with why. */
  problems: Array<{ package: string; message: string }>;
}

/** The fixes every installed and local package declares (`genesis.doctor.fixes`). A broken module is reported, never thrown. */
export async function loadFixes(packages: readonly DeclaringPackage[]): Promise<LoadedFixes> {
  const fixes: Fix[] = [];
  const problems: LoadedFixes["problems"] = [];
  for (const p of packages) {
    const file = p.declaration?.fixes;
    if (!file) continue;
    let value: unknown;
    try {
      const mod = (await import(`${pathToFileURL(file).href}?mtime=${statSync(file).mtimeMs}`)) as { default?: unknown };
      value = mod.default;
      if (typeof value === "function" && !("plan" in value)) value = await (value as () => unknown)();
    } catch (err) {
      problems.push({ package: p.name, message: `could not load its fixes (${file}): ${(err as Error).message}` });
      continue;
    }
    for (const one of Array.isArray(value) ? value : [value]) {
      const problem = fixProblem(one);
      if (problem) {
        problems.push({ package: p.name, message: problem });
        continue;
      }
      const fix = one as Fix;
      const ns = (id: string) => (id.startsWith(`${p.namespace}/`) ? id : `${p.namespace}/${id}`);
      fixes.push({ ...fix, id: ns(fix.id), rules: fix.rules.map(ns) });
    }
  }
  return { fixes, problems };
}

/** Every fix: the built-ins, then the packages'. */
export async function allFixes(packages: readonly DeclaringPackage[], deps: BuiltinDeps = {}): Promise<LoadedFixes> {
  const loaded = await loadFixes(packages);
  return { fixes: [...builtinFixes(deps), ...loaded.fixes], problems: loaded.problems };
}
