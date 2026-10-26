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
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import * as path from "node:path";
import { localPackages, type LocalPackage } from "../blocks/local.js";
import { MIGRATION_FILE, ManifestError, parseManifest, rawBlocksOf } from "../blocks/manifest.js";
import { compareVersions, parseVersion } from "./semver.js";
import { stripForImports } from "./trail.js";
import type { DoctorContext } from "./types.js";

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".turbo"]);
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
/** `import type … from "x"` and `export type … from "x"`, across lines: compile-time only, never a runtime dependency. */
const TYPE_ONLY = /\b(?:import|export)\s+type\s+(?:\{[^}]*\}|\*\s+as\s+[\w$]+|\*|[\w$]+)\s*from\s*["'][^"']+["']/g;

/** Every source file in a package (not node_modules or build output), package-relative. */
function sourceFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(dir, rel)).sort()) {
    if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
    const child = rel ? `${rel}/${entry}` : entry;
    // Symlinks aren't followed (as scan.ts): no loops, nothing outside the package.
    const stat = lstatSync(path.join(dir, child));
    if (stat.isSymbolicLink()) continue;
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
  exports?: unknown;
  imports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** A pattern with one `*` (package.json `imports`, tsconfig `paths`) matched against a specifier: the `*` part, or null. */
function matchPattern(pattern: string, spec: string): string | null {
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === spec ? "" : null;
  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);
  return spec.startsWith(head) && spec.endsWith(tail) && spec.length >= head.length + tail.length ? spec.slice(head.length, spec.length - tail.length) : null;
}

/** The package's own tsconfig `paths`, resolved to folders: alias pattern → absolute target patterns. */
function tsconfigPaths(dir: string): Array<{ pattern: string; targets: string[] }> {
  const file = path.join(dir, "tsconfig.json");
  if (!existsSync(file)) return [];
  try {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s{,[])\/\/[^\n]*/g, "$1").replace(/,(\s*[}\]])/g, "$1");
    const options = (JSON.parse(text) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }).compilerOptions ?? {};
    const base = path.resolve(dir, options.baseUrl ?? ".");
    return Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({ pattern, targets: targets.map((t) => path.resolve(base, t)) }));
  } catch {
    return [];
  }
}

function checkImports(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson): void {
  const aliases = tsconfigPaths(pkg.dir);
  const subpathImports = Object.keys(json.imports ?? {});
  /** Inside the package (true), outside it (false), or not an alias (null). */
  const viaAlias = (spec: string): boolean | null => {
    if (spec.startsWith("#")) return subpathImports.some((k) => matchPattern(k, spec) !== null) ? true : null;
    for (const { pattern, targets } of aliases) {
      const hit = matchPattern(pattern, spec);
      if (hit === null) continue;
      return targets.some((t) => {
        const rel = path.relative(pkg.dir, t.replace("*", hit));
        return !rel.startsWith("..") && !path.isAbsolute(rel);
      });
    }
    return null;
  };
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
    const typeOnly = [...code.matchAll(TYPE_ONLY)].map((m) => [m.index!, m.index! + m[0].length] as const);
    let offset = 0;
    code.split("\n").forEach((text, i) => {
      const lineStart = offset;
      offset += text.length + 1;
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1]!;
        const line = i + 1;
        const at0 = lineStart + m.index!;
        if (typeOnly.some(([a, b]) => at0 >= a && at0 < b)) continue;
        const alias = viaAlias(spec);
        if (alias === true) continue;
        if (alias === false) {
          ctx.report({ rule: "package-app-import", file: at, line, subject: spec, message: `${pkg.name} imports ${spec}, an alias that points outside the package` });
          continue;
        }
        if (spec.startsWith("#")) continue;
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
  const declaredFiles = new Set<string>();
  for (const [id, raw] of Object.entries(rawBlocksOf(json))) {
    const migrations = (raw as { migrations?: Array<{ file?: unknown; test?: unknown }> }).migrations ?? [];
    for (const m of migrations) {
      if (typeof m.file === "string" && typeof m.test === "string") declaredFiles.add(m.file);
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
    // Every migration has a pgTAP test beside it, declared in a block or not.
    if (!declaredFiles.has(`migrations/${name}`) && !existsSync(path.join(dir, "tests", name.replace(/\.sql$/, ".test.sql")))) {
      ctx.report({ rule: "package-migration-test", file: `${pkg.rel}/migrations/${name}`, subject: name, message: `${pkg.name}: ${name} has no pgTAP test (migrations/tests/${name.replace(/\.sql$/, ".test.sql")})` });
    }
  }
}

/** Every export target that is a source path (not build output) exists. Build output (dist/, build/) is left alone: it may not be built yet. */
function checkExports(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson): void {
  const targets: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") targets.push(v);
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(json.exports);
  for (const t of targets) {
    // Only source targets (.ts, .tsx, .mts, .cts, .json): a .js target may be build output that
    // isn't built yet, wherever it lives, so it's left alone.
    if (!t.startsWith("./") || t.includes("*") || !/\.(?:[cm]?tsx?|json)$/.test(t)) continue;
    if (!existsSync(path.join(pkg.dir, t))) {
      ctx.report({ rule: "package-export-missing", file: `${pkg.rel}/package.json`, subject: t, message: `${pkg.name} exports ${t}, which doesn't exist` });
    }
  }
}

/** Its block declarations parse as a Genesis block manifest would. */
function checkBlocks(ctx: DoctorContext, pkg: LocalPackage, json: PackageJson): void {
  for (const [id, raw] of Object.entries(rawBlocksOf(json))) {
    try {
      parseManifest(json.name, id, raw, json.version, { local: true });
    } catch (err) {
      if (!(err instanceof ManifestError)) throw err;
      for (const problem of err.problems) ctx.report({ rule: "package-block-invalid", file: `${pkg.rel}/package.json`, subject: id, message: problem });
    }
  }
}

/** Its tests carry the feature they cover (`@feat:<id>`), so the registry's check can find them. */
function checkTaggedTests(ctx: DoctorContext, pkg: LocalPackage): void {
  const tests = sourceFiles(pkg.dir).filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  if (!tests.length) return;
  const tagged = tests.some((f) => /@feat:[a-z]/.test(readFileSync(path.join(pkg.dir, f), "utf8")));
  if (!tagged) ctx.report({ rule: "package-untagged-tests", level: "warn", file: pkg.rel, message: `${pkg.name}'s tests name no feature; tag them with // @feat:<feature id>` });
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
  // links.code paths are relative to the repository root (or, outside git, the app).
  const top = git(ctx.root, ["rev-parse", "--show-toplevel"])?.trim();
  const forms = new Set([pkg.rel]);
  if (top) forms.add(path.relative(top, realpathSync(pkg.dir)).split(path.sep).join("/"));
  const covered = (doc.features ?? []).some((f) =>
    (f.links?.code ?? []).some((c) => {
      const norm = c.replace(/^\.\//, "").replace(/\/+$/, "");
      return [...forms].some((rel) => norm === rel || norm.startsWith(`${rel}/`) || rel.startsWith(`${norm}/`));
    }),
  );
  if (!covered) {
    ctx.report({ rule: "package-unregistered", level: "warn", file: pkg.rel, message: `no feature in features.ts lists ${pkg.rel} in links.code; add the package to the feature it implements` });
  }
}

/** The packages a changeset's front matter releases: `"name": bump`, `'name': bump` or `name: bump` lines between the `---` fences. */
export function changesetNames(text: string): Set<string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const names = new Set<string>();
  if (!m) return names;
  for (const line of m[1]!.split(/\r?\n/)) {
    const entry = /^\s*(?:"([^"]+)"|'([^']+)'|([^\s:'"]+))\s*:\s*(major|minor|patch)\s*$/.exec(line);
    if (entry) names.add((entry[1] ?? entry[2] ?? entry[3])!);
  }
  return names;
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
  // From the repository root, so a package above the app (`../../packages/os`) is seen too
  // (`--relative` drops paths outside the app's folder); paths are then made app-relative.
  const top = git(ctx.root, ["rev-parse", "--show-toplevel"])?.trim();
  if (!top) return;
  const appRelative = (fromTop: string) => path.relative(realpathSync(ctx.root), path.join(top, fromTop)).split(path.sep).join("/");
  const inRepo = path.relative(top, realpathSync(pkg.dir)).split(path.sep).join("/");
  const diff = (git(top, ["diff", "--name-status", "-M", mergeBase, "--", inRepo]) ?? "")
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split("\t").map((cell, i) => (i === 0 ? cell : appRelative(cell))).join("\t"))
    .join("\n");
  const untracked = (git(top, ["ls-files", "--others", "--exclude-standard", "--", inRepo]) ?? "").split("\n").filter(Boolean).map(appRelative);
  const changed = [...diff.split("\n").filter(Boolean).map((row) => row.split("\t").at(-1)!), ...untracked].filter(
    (f) => !/(^|\/)(CHANGELOG\.md|node_modules\/)/.test(f),
  );
  for (const row of diff.split("\n").filter(Boolean)) {
    const [status, a] = row.split("\t");
    if (a && /\/migrations\/\d{4}_[a-z0-9_]+\.sql$/.test(a) && /^[MDRT]/.test(status!)) {
      ctx.report({ rule: "package-migration-edited", level: "warn", file: a, message: `${a} existed on ${base} and was ${status!.startsWith("D") ? "deleted" : "changed"}; once a migration may have been applied, add a new one instead` });
    }
  }
  if (!changed.length) return;
  // `./` makes git read the path from the app's folder, not the repository root (gitrevisions(7)).
  const before = git(ctx.root, ["show", `${mergeBase}:./${pkg.rel}/package.json`]);
  let versionBefore: string | undefined;
  try {
    versionBefore = before ? (JSON.parse(before) as { version?: string }).version : undefined;
  } catch {
    versionBefore = undefined;
  }
  // A new package counts as versioned; otherwise the version must go up (semver), not just change.
  const now = typeof json.version === "string" ? parseVersion(json.version) : null;
  const was = typeof versionBefore === "string" ? parseVersion(versionBefore) : null;
  const bumped = before === null || (now !== null && was !== null && compareVersions(now, was) > 0);
  // Changesets live at the repository root, wherever the app is inside it.
  const changesets = top
    ? (git(top, ["diff", "--name-only", "--diff-filter=A", mergeBase, "--", ".changeset"]) ?? "")
        .split("\n")
        .concat((git(top, ["ls-files", "--others", "--exclude-standard", "--", ".changeset"]) ?? "").split("\n"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => path.join(top, f))
    : [];
  const naming = changesets.filter((p) => existsSync(p) && changesetNames(readFileSync(p, "utf8")).has(json.name));
  const named = naming.length > 0;
  if (named && !naming.some((p) => /^Features:\s*\S/m.test(readFileSync(p, "utf8")))) {
    ctx.report({ rule: "package-unversioned-change", level: "warn", file: path.relative(realpathSync(ctx.root), naming[0]!), message: `the changeset for ${pkg.name} has no "Features:" line; name the features it changes` });
  }
  // Blocks or exports changed: the registry (features.ts) should say so too.
  let jsonBefore: { genesis?: unknown; exports?: unknown } | null = null;
  try {
    jsonBefore = before ? (JSON.parse(before) as { genesis?: unknown; exports?: unknown }) : null;
  } catch {
    jsonBefore = null;
  }
  const raw = json as unknown as { genesis?: unknown; exports?: unknown };
  if (jsonBefore && (JSON.stringify(jsonBefore.genesis) !== JSON.stringify(raw.genesis) || JSON.stringify(jsonBefore.exports) !== JSON.stringify(raw.exports))) {
    const registry = (git(ctx.root, ["diff", "--relative", "--name-only", mergeBase, "--", "features.ts", "src/features.ts"]) ?? "").trim();
    if (!registry) ctx.report({ rule: "package-unversioned-change", level: "warn", file: `${pkg.rel}/package.json`, message: `${pkg.name}'s blocks or exports changed but features.ts didn't; update the features they belong to` });
  }
  if (bumped && !named && before !== null) {
    ctx.report({ rule: "package-unversioned-change", level: "warn", file: `${pkg.rel}/package.json`, message: `${pkg.name}'s version went up without a changeset; add one with a "Features:" line so the change is recorded` });
  }
  if (!bumped && !named) {
    ctx.report({
      rule: "package-unversioned-change",
      level: "warn",
      file: `${pkg.rel}/package.json`,
      message: `${pkg.name} changed since ${base} (${changed.length} file${changed.length === 1 ? "" : "s"}) but neither its version nor a new changeset naming it did; add a changeset (or bump "version") saying what changed`,
    });
  }
}

export function checkPackagesPack(ctx: DoctorContext): void {
  let packages: LocalPackage[];
  try {
    packages = localPackages(ctx.root);
  } catch (err) {
    ctx.report({ rule: "package-block-invalid", file: "genesis.config.json", message: (err as Error).message });
    return;
  }
  if (!packages.length) return;
  const base = ctx.base ?? ctx.config.packages?.base;
  const merge = base ? mergeBaseOf(ctx.root, base) : { reason: "no base ref (pass --base <ref>, e.g. --base origin/main)" };
  if ("reason" in merge) {
    // Asked for a base that can't be compared: a warning (it fails --strict), since the gate the
    // run was asked to apply didn't run. Not asked at all: info.
    ctx.report({ rule: "package-unversioned-change", level: base ? "warn" : "info", file: "genesis.config.json", message: `change gate skipped: ${merge.reason}` });
  }
  for (const pkg of packages) {
    const json = JSON.parse(readFileSync(path.join(pkg.dir, "package.json"), "utf8")) as PackageJson;
    checkImports(ctx, pkg, json);
    checkExports(ctx, pkg, json);
    checkBlocks(ctx, pkg, json);
    checkMigrations(ctx, pkg, json);
    checkTaggedTests(ctx, pkg);
    checkRegistered(ctx, pkg);
    if (base && "sha" in merge) checkChanges(ctx, pkg, json, base, merge.sha);
  }
}
