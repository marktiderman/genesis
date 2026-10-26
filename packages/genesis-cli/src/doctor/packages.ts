/**
 * The `packages` pack: rules for the app's local packages (genesis.config.json
 * `localPackages`), so they stay as clean as a Genesis package. Turned on with
 * `doctor.packs: ["packages"]`.
 *
 * - package-app-import: a package imports the app's own code (`@/…`, `~/…`, or a
 *   relative path that leaves the package).
 * - package-undeclared-dependency: a package imports a module its package.json
 *   doesn't list (dependencies, peerDependencies or devDependencies).
 * - package-migration-test: a block migration with no pgTAP test beside it.
 * - package-migration-number: two migrations in one package share a number.
 * - package-migration-edited: a package migration that exists on the base ref changed.
 * - package-unregistered: no feature in features.json lists the package in `links.code`.
 * - package-unversioned-change: files in the package changed since the base ref, but
 *   neither its version nor a new changeset naming it did.
 *
 * The change rules (package-migration-edited, package-unversioned-change) run only
 * with a base ref: `--base <ref>`, or `doctor.packages.base`. Without one, or when git
 * can't compare, they report one info finding and nothing else. Like every rule,
 * anything the pack can't be sure of (a file whose literals it can't parse) is
 * left alone rather than guessed at.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import { localPackages, type LocalPackage } from "../blocks/local.js";
import { MIGRATION_FILE, rawBlocksOf } from "../blocks/manifest.js";
import { stripForImports } from "./trail.js";
import type { DoctorContext } from "./types.js";

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".turbo"]);
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
/** `import type …` and `export type … from`: compile-time only, never a runtime dependency. */
const TYPE_ONLY = /^\s*(?:import|export)\s+type\b/;

/** Every source file in a package (not node_modules or build output), package-relative. */
function sourceFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, rel)).sort()) {
    if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
    const child = rel ? `${rel}/${entry}` : entry;
    const stat = statSync(path.join(dir, child));
    if (stat.isDirectory()) out.push(...sourceFiles(dir, child));
    else if (SOURCE.test(entry) && !entry.endsWith(".d.ts")) out.push(child);
  }
  return out;
}

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function git(root: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function checkImports(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson): void {
  const declared = new Set([
    json.name,
    ...Object.keys(json.dependencies ?? {}),
    ...Object.keys(json.peerDependencies ?? {}),
    ...Object.keys(json.devDependencies ?? {}),
    ...Object.keys(json.optionalDependencies ?? {}),
  ]);
  for (const file of sourceFiles(pkg.dir)) {
    // Comments and string contents blanked, specifiers kept (the import trail's reader).
    // A file whose literals can't be parsed for sure is skipped: no guesses.
    const code = stripForImports(readFileSync(path.join(pkg.dir, file), "utf8"));
    if (code === null) continue;
    const at = `${pkg.rel}/${file}`;
    code.split("\n").forEach((text, i) => {
      if (TYPE_ONLY.test(text)) return;
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1]!;
        const line = i + 1;
        if (spec.startsWith("@/") || spec.startsWith("~/")) {
          ctx.report({ rule: "package-app-import", file: at, line, subject: spec, message: `${pkg.name} imports the app's own code (${spec}); a package may only use its own files and its declared dependencies` });
          continue;
        }
        if (spec.startsWith(".")) {
          const target = path.resolve(pkg.dir, path.dirname(file), spec);
          const rel = path.relative(pkg.dir, target);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            ctx.report({ rule: "package-app-import", file: at, line, subject: spec, message: `${pkg.name} reaches outside its folder (${spec}); move what it needs into the package or a dependency` });
          }
          continue;
        }
        if (BUILTINS.has(spec) || spec.startsWith("node:") || spec.startsWith("virtual:") || /^[a-z]+:/.test(spec)) continue;
        const name = packageName(spec);
        if (!declared.has(name)) {
          ctx.report({ rule: "package-undeclared-dependency", file: at, line, subject: name, message: `${pkg.name} imports ${name}, which its package.json doesn't list; add it to dependencies or peerDependencies` });
        }
      }
    });
  }
}

function checkMigrations(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson): void {
  for (const [id, raw] of Object.entries(rawBlocksOf(json))) {
    const migrations = (raw as { migrations?: Array<{ file?: unknown; test?: unknown }> }).migrations ?? [];
    for (const m of migrations) {
      if (typeof m.file === "string" && typeof m.test !== "string") {
        ctx.report({ rule: "package-migration-test", file: `${pkg.rel}/package.json`, subject: m.file, message: `${pkg.name} block ${id}: ${m.file} has no pgTAP test; declare one as "test" beside it` });
      } else if (typeof m.test === "string" && !existsSync(path.join(pkg.dir, m.test))) {
        ctx.report({ rule: "package-migration-test", file: `${pkg.rel}/package.json`, subject: m.test, message: `${pkg.name} block ${id}: its test ${m.test} doesn't exist` });
      }
    }
  }
  const dir = path.join(pkg.dir, "migrations");
  if (!existsSync(dir)) return;
  const seen = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    const m = MIGRATION_FILE.exec(name);
    if (!m) continue;
    const other = seen.get(m[1]!);
    if (other) ctx.report({ rule: "package-migration-number", file: `${pkg.rel}/migrations/${name}`, subject: m[1], message: `${pkg.name}: ${name} and ${other} share the number ${m[1]}; give each migration its own` });
    else seen.set(m[1]!, name);
  }
}

function checkRegistered(ctx: DoctorContext, pkg: LocalPackage): void {
  const file = path.join(ctx.root, "features.json");
  if (!existsSync(file)) return;
  let doc: { features?: Array<{ links?: { code?: string[] } }> };
  try {
    doc = JSON.parse(readFileSync(file, "utf8")) as typeof doc;
  } catch {
    return;
  }
  const covered = (doc.features ?? []).some((f) =>
    (f.links?.code ?? []).some((c) => {
      const norm = c.replace(/^\.\//, "").replace(/\/+$/, "");
      return norm === pkg.rel || norm.startsWith(`${pkg.rel}/`) || pkg.rel.startsWith(`${norm}/`);
    }),
  );
  if (!covered) {
    ctx.report({ rule: "package-unregistered", level: "warn", file: pkg.rel, message: `no feature in features.ts lists ${pkg.rel} in links.code; add the package to the feature it implements` });
  }
}

/** The merge base with `base`, or why the change gate can't run. */
function mergeBaseOf(root: string, base: string): { sha: string } | { reason: string } {
  if (git(root, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return { reason: "not a git repository" };
  if (git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]) === null) return { reason: `the git ref ${base} isn't available (fetch it)` };
  const sha = git(root, ["merge-base", "HEAD", base])?.trim();
  return sha ? { sha } : { reason: `HEAD has no merge base with ${base} (fetch with depth 0)` };
}

/** Version bump or changeset, against the merge base; edited migrations too. */
function checkChanges(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson, base: string, mergeBase: string): void {
  const diff = git(ctx.root, ["diff", "--relative", "--name-status", "-M", mergeBase, "--", pkg.rel]) ?? "";
  const untracked = (git(ctx.root, ["ls-files", "--others", "--exclude-standard", "--", pkg.rel]) ?? "").split("\n").filter(Boolean);
  const changed = [...diff.split("\n").filter(Boolean).map((row) => row.split("\t").at(-1)!), ...untracked].filter(
    (f) => !/(^|\/)(CHANGELOG\.md|node_modules\/)/.test(f),
  );
  for (const row of diff.split("\n").filter(Boolean)) {
    const [status, a] = row.split("\t");
    if (a && /\/migrations\/\d{4}_[a-z0-9_]+\.sql$/.test(a) && /^[MDRT]/.test(status!)) {
      ctx.report({ rule: "package-migration-edited", file: a, message: `${a} existed on ${base} and was ${status!.startsWith("D") ? "deleted" : "changed"}; once a migration may have been applied, add a new one instead` });
    }
  }
  if (!changed.length) return;
  const before = git(ctx.root, ["show", `${mergeBase}:${pkg.rel}/package.json`]);
  let versionBefore: string | undefined;
  try {
    versionBefore = before ? (JSON.parse(before) as { version?: string }).version : undefined;
  } catch {
    versionBefore = undefined;
  }
  const bumped = before === null || versionBefore !== json.version;
  const changesets = (git(ctx.root, ["diff", "--relative", "--name-only", "--diff-filter=A", mergeBase, "--", ".changeset"]) ?? "")
    .split("\n")
    .concat((git(ctx.root, ["ls-files", "--others", "--exclude-standard", "--", ".changeset"]) ?? "").split("\n"))
    .filter((f) => f.endsWith(".md"));
  const named = changesets.some((f) => {
    const p = path.join(ctx.root, f);
    return existsSync(p) && readFileSync(p, "utf8").includes(`"${json.name}"`);
  });
  if (!bumped && !named) {
    ctx.report({
      rule: "package-unversioned-change",
      file: `${pkg.rel}/package.json`,
      message: `${pkg.name} changed since ${base} (${changed.length} file${changed.length === 1 ? "" : "s"}) but neither its version nor a new changeset naming it did; add a changeset (or bump "version") saying what changed`,
    });
  }
}

export function checkPackagesPack(ctx: DoctorContext): void {
  const packages = localPackages(ctx.root);
  if (!packages.length) return;
  const base = ctx.base ?? ctx.config.packages?.base;
  const merge = base ? mergeBaseOf(ctx.root, base) : { reason: "no base ref (pass --base <ref>, e.g. --base origin/main)" };
  if ("reason" in merge) {
    ctx.report({ rule: "package-unversioned-change", level: "info", file: "genesis.config.json", message: `change gate skipped: ${merge.reason}` });
  }
  for (const pkg of packages) {
    const json = JSON.parse(readFileSync(path.join(pkg.dir, "package.json"), "utf8")) as PackageJson;
    checkImports(ctx, pkg, json);
    checkMigrations(ctx, pkg, json);
    checkRegistered(ctx, pkg);
    if (base && "sha" in merge) checkChanges(ctx, pkg, json, base, merge.sha);
  }
}
