/**
 * `genesis add <block>`: add a block to an app, from what its package
 * declares (see manifest.ts). In order: install its packages at the pinned
 * Genesis version; copy its migrations in as new timestamped files (see
 * migrations.ts) and their pgTAP tests; copy its Edge Functions, skills and
 * AGENTS.md fragment; write stubs for routes the app doesn't have; add its
 * feature entry to the registry; run `features build`; and print what's left
 * by hand. It never overwrites a file the app has: an existing file with other
 * text is reported and left alone.
 *
 * Everything goes through a plan first, so `--dry-run` prints exactly what a
 * real run does, and a run without `--yes` asks before it writes.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fragmentMarkers, mergeFragment, skillName } from "./agents.js";
import { allBlocks, findBlock, packageDir, packageVersion, type FoundBlock } from "./discover.js";
import { createApp, readApp, readPackageDir, readPackageFile, replaceApp, sha256 } from "./files.js";
import { LOCK_FILE, readLock, writeLock, type GenesisLock } from "./lock.js";
import type { BlockManifest } from "./manifest.js";
import { applyMigrationPlan, formatMigrationRows, planMigrations, type MigrationPlan, type SourceMigration } from "./migrations.js";
import { copyOwned, type OwnedWrite } from "./owned.js";
import { addCommand, detectPackageManager, pinnedVersion, run, shellLine } from "./pm.js";
import { addFeatureEntry, featureSnippet } from "./registry-edit.js";
import { planRouteStubs, routeStub } from "./routes.js";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

export interface AddOptions {
  root: string;
  block: string;
  /** Pick the declaring package when two declare the id. */
  package?: string;
  dryRun?: boolean;
  /** Don't ask before writing. */
  yes?: boolean;
  /** Install packages (default true). */
  install?: boolean;
  /** Run `features build` after (default true). */
  featuresBuild?: boolean;
  now?: Date;
  log?: Logger;
  /** Asked before writing when `yes` is off. */
  confirm?: (question: string) => Promise<boolean>;
}

export interface AddReport {
  block: BlockManifest;
  install: string[] | null;
  migrations: MigrationPlan;
  created: string[];
  kept: { path: string; why: string }[];
  edited: string[];
  steps: string[];
  featureSnippet?: string;
  warnings: string[];
}

const SILENT: Logger = { info() {}, warn() {} };

function appDependencies(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    return { ...pkg["dependencies"], ...pkg["devDependencies"], ...pkg["optionalDependencies"] };
  } catch {
    return {};
  }
}

/** The registry file, as `genesis features` finds it. */
export function registryFile(root: string): string | null {
  const read = (file: string, key: string): string | undefined => {
    try {
      const v = (JSON.parse(readFileSync(path.join(root, file), "utf8")) as Record<string, { registry?: string } | undefined>)[key]?.registry;
      return typeof v === "string" ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const named = read("genesis.config.json", "features") ?? read("package.json", "genesisFeatures");
  for (const candidate of named ? [named] : ["src/features.ts", "features.ts"]) if (existsSync(path.join(root, candidate))) return candidate;
  return null;
}

async function registryIds(root: string, file: string): Promise<Set<string> | null> {
  try {
    const { loadRegistry } = await import("../features.js");
    return new Set(Object.keys((await loadRegistry({ dir: root, registry: file })).features));
  } catch {
    return null;
  }
}

/** The package migrations of a block, with their text read from the installed package. */
export function sourceMigrations(root: string, manifest: BlockManifest): SourceMigration[] {
  return manifest.migrations.map((m) => {
    const dir = packageDir(root, m.package);
    return {
      ...m,
      block: manifest.id,
      source: dir ? readPackageFile(dir, m.file) : null,
      ...(m.test ? { testSource: dir ? readPackageFile(dir, m.test) : null } : {}),
    };
  });
}

/** The owned files a block brings: Edge Functions and skills. */
export function ownedWrites(root: string, manifest: BlockManifest, warnings: string[]): OwnedWrite[] {
  const out: OwnedWrite[] = [];
  for (const fn of manifest.functions) {
    const dir = packageDir(root, fn.package);
    const files = dir ? readPackageDir(dir, fn.dir) : null;
    const name = fn.dir.split("/").pop()!;
    if (!files) {
      warnings.push(`${fn.package} ${fn.dir}: can't read it (not installed?); the ${name} function wasn't copied.`);
      continue;
    }
    const version = packageVersion(dir!);
    for (const f of files) out.push({ path: `supabase/functions/${name}/${f.name}`, source: `${fn.package}:${fn.dir}/${f.name}`, content: f.content, ...(version ? { version } : {}) });
  }
  for (const skill of manifest.skills) {
    const dir = packageDir(root, skill.package);
    const content = dir ? readPackageFile(dir, skill.path) : null;
    if (!dir || content === null) {
      warnings.push(`${skill.package} ${skill.path}: can't read it (not installed?); the skill wasn't copied.`);
      continue;
    }
    const version = packageVersion(dir);
    const name = skillName(content, skill.path);
    const folder = skill.path.split("/").slice(0, -1).join("/");
    // A skill in its own folder brings that folder's other files (references); one at the package root only itself.
    const files = folder ? (readPackageDir(dir, folder) ?? []) : [{ name: "SKILL.md", content }];
    for (const f of files) out.push({ path: `.claude/skills/${name}/${f.name}`, source: `${skill.package}:${folder ? `${folder}/` : ""}${f.name}`, content: f.content, ...(version ? { version } : {}) });
  }
  return out;
}

/** The block's AGENTS.md fragment, read from its package. */
export function agentsFragment(root: string, manifest: BlockManifest): { text: string; source: string } | null {
  if (!manifest.agents) return null;
  const dir = packageDir(root, manifest.agents.package);
  const text = dir ? readPackageFile(dir, manifest.agents.path) : null;
  return text === null ? null : { text, source: `${manifest.agents.package}/${manifest.agents.path}` };
}

/** Append `[functions.<name>] verify_jwt = false` sections config.toml lacks. */
function configTomlEdit(root: string, manifest: BlockManifest): { content: string; names: string[] } | null {
  const config = readApp(root, "supabase/config.toml");
  if (config === null) return null;
  const names = manifest.functions
    .filter((f) => f.verifyJwt === false)
    .map((f) => f.dir.split("/").pop()!)
    .filter((name) => !new RegExp(`^\\[functions\\.${name.replace(/[-_]/g, "\\$&")}\\]`, "m").test(config));
  if (!names.length) return null;
  const add = names.map((n) => `\n# Added by \`genesis add ${manifest.id}\`: the function checks its caller itself.\n[functions.${n}]\nverify_jwt = false\n`).join("");
  return { content: `${config.replace(/\s*$/, "\n")}${add}`, names };
}

export async function runAdd(options: AddOptions): Promise<AddReport> {
  const root = path.resolve(options.root);
  const log = options.log ?? SILENT;
  const now = options.now ?? new Date();
  const warnings: string[] = [];
  const install = options.install !== false;
  let found: FoundBlock = await findBlock(root, options.block, { ...(options.package ? { package: options.package } : {}), warnings });
  const lock = readLock(root);

  // 1. Packages.
  const deps = appDependencies(root);
  const pm = detectPackageManager(root);
  const specs: string[] = [];
  for (const name of found.manifest.packages) {
    if (deps[name]) continue;
    const pin = pinnedVersion(root, name);
    specs.push(pin ? `${name}@${pin.version}` : name);
  }
  for (const spec of found.manifest.install) {
    const name = spec.startsWith("@") ? `@${spec.slice(1).split("@")[0]}` : spec.split("@")[0]!;
    if (!deps[name]) specs.push(spec);
  }
  const command = specs.length ? addCommand(pm, specs) : null;

  // 2. Requirements: other blocks or app features that must be there.
  const registry = registryFile(root);
  const ids = registry ? await registryIds(root, registry) : null;
  const blockIds = new Set((await allBlocks(root)).map((b) => b.manifest.id));
  for (const req of found.manifest.requires) {
    if (lock.blocks[req] || ids?.has(req)) continue;
    warnings.push(blockIds.has(req) ? `${options.block} requires the ${req} block: add it too (genesis add ${req}), unless the app already has it.` : `${options.block} requires the ${req} feature; make sure the app has it.`);
  }

  log.info(`${found.manifest.id}: from ${found.manifest.package}${found.manifest.version ? ` ${found.manifest.version}` : ""} (${found.from === "installed" ? "installed" : "not installed yet"})`);
  if (command) log.info(`  install: ${shellLine(command)}${install ? "" : " (skipped: --no-install)"}`);

  if (!options.dryRun && !options.yes) {
    const ok = options.confirm ? await options.confirm(`Add ${found.manifest.id} to ${root}?`) : false;
    if (!ok) throw new Error("Nothing written. Pass --yes to add without asking, or --dry-run to see the plan.");
  }

  if (command && install && !options.dryRun) {
    run(root, command);
    found = await findBlock(root, options.block, { package: found.manifest.package, warnings });
  }
  if (found.from === "catalog") warnings.push(`${found.manifest.package} isn't installed, so its files can't be read yet: migrations, functions and skills are listed, not copied. Install it and run genesis add ${found.manifest.id} again.`);
  const manifest = found.manifest;

  // 3. The plan.
  const migrations = planMigrations(root, sourceMigrations(root, manifest), { now });
  const owned = ownedWrites(root, manifest, warnings);
  const fragment = agentsFragment(root, manifest);
  if (manifest.agents && !fragment) warnings.push(`${manifest.agents.package} ${manifest.agents.path}: can't read it; AGENTS.md wasn't changed.`);
  const { routerRoot, stubs } = planRouteStubs(root, manifest.routes);
  const toml = configTomlEdit(root, manifest);

  const steps: string[] = [];
  const kept: AddReport["kept"] = [];
  const created: string[] = [];
  const edited: string[] = [];

  for (const row of migrations.rows) {
    if (row.state === "edited" || row.state === "changed-upstream" || row.state === "differs") kept.push({ path: row.copy!, why: `${row.state}: ${row.detail}. Run genesis migrate --forward to add a forward migration.` });
  }
  for (const stub of stubs) {
    if (stub.existing) continue;
    if (!stub.file) steps.push(`Add a ${stub.route.path} screen to your router${stub.route.description ? ` (${stub.route.description})` : ""}${stub.route.signedIn ? ", for signed-in people only" : ""}.`);
  }
  for (const fn of manifest.functions) {
    const name = fn.dir.split("/").pop()!;
    if (fn.verifyJwt === false && !readApp(root, "supabase/config.toml")) steps.push(`Deploy ${name} without the gateway's JWT check: supabase functions deploy ${name} --no-verify-jwt`);
    if (fn.secrets?.length) steps.push(`Set the ${name} function's secrets: supabase secrets set ${fn.secrets.map((s) => `${s}=…`).join(" ")}`);
  }
  if (migrations.creates.some((c) => c.kind === "migration")) steps.push("Review the new migrations in supabase/migrations, then apply them (supabase db push, or open a pull request).");
  steps.push(...manifest.steps);
  if (manifest.privacy?.collects?.length) steps.push(`Update the App Store privacy label and Play data safety form: ${manifest.id} collects ${manifest.privacy.collects.map((c) => c.type).join(", ")}.`);

  // The registry entry.
  let snippet: string | undefined;
  let registryEdit: string | null = null;
  if (ids?.has(manifest.id)) {
    // Already listed.
  } else {
    const owner = (JSON.parse(readApp(root, "package.json") ?? "{}") as { name?: string }).name ?? "app";
    snippet = featureSnippet(manifest, owner);
    if (registry) {
      registryEdit = addFeatureEntry(readApp(root, registry) ?? "", snippet);
      if (!registryEdit) steps.push(`Add ${manifest.id} to ${registry} (the edit wasn't safe to make automatically):\n${snippet}`);
    } else steps.push(`No feature registry (features.ts) here; when you add one, list ${manifest.id}:\n${snippet}`);
  }

  // 4. Report the plan; with --dry-run, stop here.
  const print = (mark: string, p: string, note = "") => log.info(`  ${mark} ${p}${note ? ` ${note}` : ""}`);
  log.info(formatMigrationRows(migrations.rows).replace(/^/gm, "  "));
  for (const c of migrations.creates) if (c.kind === "test") print("+", c.path, "(pgTAP test)");
  for (const w of owned) {
    const existing = readApp(root, w.path);
    print(existing === null ? "+" : existing === w.content ? "=" : "!", w.path, existing !== null && existing !== w.content ? "exists with other text; left alone" : "");
  }
  for (const s of stubs) if (s.file) print(readApp(root, s.file) === null ? "+" : "=", s.file, "(route stub)");
  if (toml) print("~", "supabase/config.toml", `([functions.${toml.names.join("], [functions.")}] verify_jwt = false)`);
  if (fragment) print("~", "AGENTS.md", `(${fragmentMarkers(manifest.id).start})`);
  if (registryEdit && registry) print("~", registry, `(adds ${manifest.id})`);

  if (options.dryRun) return { block: manifest, install: command, migrations, created, kept, edited, steps, ...(snippet ? { featureSnippet: snippet } : {}), warnings };

  // 5. Write.
  created.push(...applyMigrationPlan(root, migrations));
  for (const c of migrations.creates) if (c.kind === "test" && c.source) recordOwned(lock, c.path, `${c.source.package}:${c.source.file}`, c.content, root, c.source.package);
  for (const w of owned) {
    const outcome = copyOwned(root, lock, w);
    if (outcome === "created") created.push(w.path);
    if (outcome === "kept") kept.push({ path: w.path, why: `exists with other text; the package's version wasn't copied` });
  }
  for (const s of stubs) {
    if (!s.file || readApp(root, s.file) !== null) continue;
    createApp(root, s.file, routeStub(manifest.id, s.route));
    created.push(s.file);
    steps.push(`Fill in the ${s.route.path} stub (${s.file}) with the block's screen.`);
  }
  if (toml) {
    replaceApp(root, "supabase/config.toml", toml.content);
    edited.push("supabase/config.toml");
  }
  if (fragment) {
    const before = readApp(root, "AGENTS.md");
    const after = mergeFragment(before, manifest.id, fragment.text, fragment.source);
    if (after !== before) {
      replaceApp(root, "AGENTS.md", after);
      edited.push("AGENTS.md");
    }
  }
  if (registryEdit && registry) {
    const before = readApp(root, registry)!;
    replaceApp(root, registry, registryEdit);
    // The edit must still load; if it doesn't, put the file back and hand over the snippet.
    if (!(await registryIds(root, registry))?.has(manifest.id)) {
      replaceApp(root, registry, before);
      steps.push(`Add ${manifest.id} to ${registry} (the automatic edit didn't load, so it was undone):\n${snippet}`);
    } else edited.push(registry);
  }
  lock.blocks[manifest.id] = { package: manifest.package, ...(manifest.version ? { version: manifest.version } : {}) };
  const lockBefore = readApp(root, LOCK_FILE);
  writeLock(root, lock);
  if (readApp(root, LOCK_FILE) !== lockBefore) edited.push(LOCK_FILE);

  if (registry && options.featuresBuild !== false) {
    try {
      const { runFeaturesBuild } = await import("../features.js");
      const changed = await runFeaturesBuild({ dir: root });
      edited.push(...changed);
    } catch (err) {
      warnings.push(`features build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!routerRoot && manifest.routes.length) warnings.push("No Expo Router root (a _layout.tsx in src/app or app), so no route stubs were written; the steps list the screens.");
  return { block: manifest, install: command, migrations, created, kept, edited, steps, ...(snippet ? { featureSnippet: snippet } : {}), warnings };
}

/** Record a file the migration plan created (a pgTAP test) as owned, like copyOwned does. */
export function recordOwned(lock: GenesisLock, appRel: string, source: string, content: string, root: string, pkg: string): void {
  const dir = packageDir(root, pkg);
  const version = dir ? packageVersion(dir) : undefined;
  lock.files[appRel] = { source, sha256: sha256(content), ...(version ? { version } : {}) };
}
