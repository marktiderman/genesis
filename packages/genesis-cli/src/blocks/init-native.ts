/**
 * `genesis init <name> --template native`: a new Expo app from the Genesis RN
 * starter, outside the monorepo.
 *
 * - Copies the files an app owns (not installs, build output or the
 *   starter's monorepo-only test), into a folder that must be new or empty.
 * - Renames the app: package name, display name, slug, URL scheme and bundle id,
 *   everywhere the starter's values appear (config.toml's Apple client ids and
 *   the Maestro flows' appId too).
 * - Rewrites `workspace:` dependencies to the published versions released
 *   with this CLI (or the installed umbrella's), and replaces the monorepo's
 *   Metro config with the plain one.
 * - `--without <switches>` turns starter.config.ts feature switches off. A
 *   block an off switch carries (genesis.config.json `starter.blocks`) is left
 *   out whole: its migrations, pgTAP tests and Edge Functions, the starter's
 *   own supabase files tagged only with it, its config.toml sections and the
 *   API schemas its migrations create.
 * - Adds the templates (eas, maestro, ci), and records every Genesis-owned
 *   file, the blocks the starter carries that are on, and the renames in
 *   genesis.lock.json, so `genesis upgrade` can refresh them and `genesis
 *   migrate` knows the blocks. Every file the lock names is written.
 * - Keeps the copied migrations byte for byte (genesis migrate knows them by name and text).
 * - `--beside <web-app>`: a phone app that uses a web app's database. When that
 *   app has a supabase/ folder, none of the starter's supabase/ files are
 *   written (nor the database CI workflow), genesis.config.json says where the
 *   database lives (`"supabase": { "app": "<relative path>" }`) and drops the
 *   doctor's supabase pack, and the lock records the blocks that are on with
 *   no Supabase files, so they can be added in the web app; the result names
 *   the ones its lock doesn't list yet.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { catalogBlocks, CLI_PACKAGE } from "./discover.js";
import { sha256 } from "./files.js";
import { emptyLock, migrationKey, substitute, writeLock, type GenesisLock } from "./lock.js";
import type { BlockManifest } from "./manifest.js";
import { stemOf, MIGRATIONS_DIR, TESTS_DIR } from "./migrations.js";
import { addThereLine, blocksMissingThere, isSupabasePath, orderForAdding } from "./database.js";
import { pinnedVersion } from "./pm.js";
import { blocksSwitchedOff, parseStarterBlocks, parseStarterFeatures, setStarterFeatures, STARTER_CONFIG } from "./starter-features.js";
import { findPlaceholders, placeholderStep } from "../eas-placeholders.js";
import { STARTER_EXCLUDE, starterDir, templateTarget, templatesDir, walk } from "./templates.js";
import { PACKED_GITIGNORE } from "./walk.js";

export interface InitNativeOptions {
  /** The app's slug: package name, Expo slug, default scheme. */
  name: string;
  /** Where to write it. Must not exist, or be empty. */
  target: string;
  displayName?: string;
  bundleId?: string;
  scheme?: string;
  /** Versions for `workspace:` deps; default the CLI's release (or the umbrella's). */
  versionFor?: (name: string) => string | null;
  /** Feature switches in starter.config.ts to turn off (`chat`, `support`…); the blocks they carry are left out. */
  without?: string[];
  /** Blocks it may find in the starter (their migrations all copied) and record. */
  blocks: BlockManifest[];
  /** The web app this phone app sits beside: when it has a supabase/ folder, its database is this app's. */
  beside?: string;
}

export interface InitNativeResult {
  target: string;
  files: string[];
  dependencies: Record<string, string>;
  unpinned: string[];
  blocks: string[];
  /** Blocks the starter carries that `without` switched off, so neither written nor recorded. */
  leftOut: string[];
  steps: string[];
  /**
   * With `beside`: the web app (relative to the new app) and the recorded blocks its
   * genesis.lock.json doesn't list, whose database files go there. `shared` is false when the
   * web app has no supabase/ folder, so the new app kept its own.
   */
  beside?: { app: string; shared: boolean; missing: string[]; line: string };
}

/** The CLI templates that are database files: never written into an app whose database is elsewhere. */
export const DATABASE_TEMPLATES: ReadonlySet<string> = new Set(["ci/supabase-ci.yml"]);

/** The EAS workflow templates' placeholder for the app's code folder (pr-preview.yml `paths`). */
export const APP_FOLDER_PLACEHOLDER = "REPLACE_WITH_APP_FOLDER";
const SLUG = /^[a-z][a-z0-9-]{1,40}$/;
const BUNDLE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
const SCHEME = /^[a-z][a-z0-9+.-]*$/;

/** The starter's own values, read from its starter.config.ts. */
export function starterIdentity(config: string): { name: string; slug: string; scheme: string; bundleId: string } {
  const field = (key: string) => {
    const m = new RegExp(`\\b${key}:\\s*"([^"]+)"`).exec(config);
    if (!m) throw new Error(`starter.config.ts has no app.${key}`);
    return m[1]!;
  };
  return { name: field("name"), slug: field("slug"), scheme: field("scheme"), bundleId: field("bundleId") };
}

const METRO = `// Metro: Expo's defaults with NativeWind. (The starter's monorepo config also watched the
// workspace packages; an app installs them from npm instead.)
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
`;

/**
 * A pnpm-workspace.yaml's settings without the monorepo's own top-level blocks: the `packages:`
 * list, and `patchedDependencies:` (its patch files stay in the monorepo, and pnpm fails an
 * install that names a patch it can't find).
 */
export function appPnpmSettings(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^(packages|patchedDependencies):/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && (/^\s/.test(line) || line === "")) continue;
    skipping = false;
    out.push(line);
  }
  return `# pnpm settings for this app, from the Genesis monorepo it was made from.\n${out.join("\n").replace(/^\n+/, "")}`;
}

function readme(display: string, slug: string, database?: string): string {
  const apply = database
    ? `The database is ${database}'s: this app has no supabase/ folder. Add blocks' database files there (\`genesis add <block>\` in ${database}) and apply its migrations from there.`
    : `Apply \`supabase/migrations\` (\`supabase db push\`, or \`supabase start\` for a local stack).`;
  return `# ${display}

An Expo app made with \`genesis init ${slug} --template native\` from the Genesis RN starter.

1. \`cp .env.example .env\` and fill in your Supabase project's URL and publishable key${database ? ` (${database}'s project)` : ""}.
2. Install: \`pnpm install\` (or your package manager).
3. ${apply}
4. \`pnpm ios\` or \`pnpm android\`.

- Turn features off in \`starter.config.ts\`.
- Add a block: \`genesis add <block>\` (for example \`genesis add tenant-features\`).
- New package migrations: \`genesis migrate\`. Move every Genesis package to one release:
  \`genesis upgrade\`.
- The CI workflows in \`.github/workflows\` name \`GENESIS_SHA\`: replace it with the commit of the
  Genesis release you run (see docs/APP-CI.md in marktiderman/genesis).
`;
}

export function initNative(options: InitNativeOptions): InitNativeResult {
  const slug = options.name;
  if (!SLUG.test(slug)) throw new Error(`"${slug}" isn't an app slug: lowercase letters, digits and -, starting with a letter.`);
  const bundleId = options.bundleId ?? `com.example.${slug.replace(/-/g, "")}`;
  const scheme = options.scheme ?? slug;
  const display = options.displayName ?? slug.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  if (!BUNDLE.test(bundleId)) throw new Error(`"${bundleId}" isn't a bundle id like com.example.app.`);
  if (!SCHEME.test(scheme)) throw new Error(`"${scheme}" isn't a URL scheme.`);
  if (/["\\\n]/.test(display)) throw new Error("The display name can't contain quotes, backslashes or new lines.");
  const target = path.resolve(options.target);
  if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} isn't empty; init writes into a new folder and never overwrites.`);
  // The web app beside it: its database is this app's when it has a supabase/ folder.
  let beside: { dir: string; app: string; shared: boolean } | undefined;
  if (options.beside !== undefined) {
    const dir = path.resolve(options.beside);
    if (!existsSync(dir)) throw new Error(`--beside: ${options.beside} doesn't exist; name the web app's folder.`);
    if (dir === target) throw new Error("--beside names the new app's own folder; name the web app's folder.");
    beside = { dir, app: path.relative(target, dir).split(path.sep).join("/"), shared: existsSync(path.join(dir, "supabase")) };
  }
  const shared = beside?.shared === true;

  const source = starterDir();
  const read = (rel: string) => readFileSync(path.join(source, rel), "utf8");
  const was = starterIdentity(read(STARTER_CONFIG));
  const switches = parseStarterFeatures(read(STARTER_CONFIG)) ?? {};
  const without = [...new Set(options.without ?? [])];
  const unknown = without.filter((w) => !(w in switches));
  if (unknown.length) throw new Error(`--without: ${unknown.join(", ")} ${unknown.length > 1 ? "aren't" : "isn't"} a feature switch in ${STARTER_CONFIG} (${Object.keys(switches).join(", ")}).`);
  const features = { ...switches, ...Object.fromEntries(without.map((w) => [w, false])) };
  if (!features.emailSignIn && !features.appleSignIn && !features.googleSignIn) throw new Error("--without: emailSignIn, appleSignIn and googleSignIn would all be off, so nobody could sign in.");
  // The app is the new repository's root and keeps its code in src/, so pr-preview.yml's paths can
  // name it: nothing is left to replace (and `genesis upgrade` fills it the same way).
  const substitutions: Record<string, string> = {
    [was.bundleId]: bundleId,
    [was.slug]: slug,
    [was.scheme]: scheme,
    [was.name]: display,
    [APP_FOLDER_PLACEHOLDER]: "src",
  };
  const files = new Map<string, string>();
  for (const rel of walk(source, STARTER_EXCLUDE)) {
    const to = rel.replace(new RegExp(`(^|/)${PACKED_GITIGNORE}$`), "$1.gitignore");
    // Migrations and their tests stay the package's bytes; everything else takes the new names.
    files.set(to, /^supabase\/(migrations|tests)\//.test(rel) ? read(rel) : substitute(read(rel), substitutions));
  }

  // package.json: the name, and published versions for workspace deps.
  const versionFor = options.versionFor ?? ((name: string) => pinnedVersion(target, name)?.version ?? null);
  const pkg = JSON.parse(files.get("package.json")!) as Record<string, unknown> & { name: string };
  pkg.name = slug;
  const unpinned: string[] = [];
  const dependencies: Record<string, string> = {};
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = pkg[section] as Record<string, string> | undefined;
    for (const [name, spec] of Object.entries(deps ?? {})) {
      if (!spec.startsWith("workspace:")) continue;
      const version = versionFor(name);
      if (!version) {
        unpinned.push(name);
        continue;
      }
      const range = spec === "workspace:*" ? version : `^${version}`;
      deps![name] = range;
      dependencies[name] = range;
    }
  }
  if (unpinned.length) throw new Error(`No published version known for ${unpinned.join(", ")}; pass versions or install a newer CLI.`);
  files.set("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  files.set("metro.config.js", METRO);
  // pnpm settings the app needs on its own (Metro needs the hoisted layout; pnpm 11 refuses
  // unlisted build scripts; one React): the monorepo's, without its workspace list.
  const pnpmSettings = [path.join(source, "pnpm-workspace.yaml"), path.join(source, "..", "..", "pnpm-workspace.yaml")].find((f) => existsSync(f));
  if (pnpmSettings) files.set("pnpm-workspace.yaml", appPnpmSettings(readFileSync(pnpmSettings, "utf8")));
  files.set("README.md", readme(display, slug, shared ? beside!.app : undefined));
  if (without.length) files.set(STARTER_CONFIG, setStarterFeatures(files.get(STARTER_CONFIG)!, Object.fromEntries(without.map((w) => [w, false]))));

  // Blocks switched off: none of their files, so the lock can name only what is there.
  const carried = options.blocks.filter((b) => carriedBy(files, b)).map((b) => b.id);
  const switchedOff = blocksSwitchedOff(features, parseStarterBlocks(read("genesis.config.json")) ?? {}, options.blocks, carried);
  const leftOut = options.blocks.filter((b) => switchedOff.has(b.id)).map((b) => b.id);
  if (leftOut.length) leaveOut(files, options.blocks.filter((b) => switchedOff.has(b.id)));
  if (shared) {
    // The web app's database: no supabase/ files here, and genesis.config.json says where they are.
    for (const rel of [...files.keys()]) if (isSupabasePath(rel)) files.delete(rel);
    files.set("genesis.config.json", besideConfig(files.get("genesis.config.json")!, beside!.app));
  } else {
    // The copied migrations are the app's applied baseline: the doctor checks only later ones as new.
    const since = sinceAfter(files);
    const config = files.get("genesis.config.json");
    if (since && config && !/"since"\s*:/.test(config)) files.set("genesis.config.json", config.replace(/("supabase"\s*:\s*\{[^}]*?)(\s*\})/, `$1, "since": "${since}"$2`));
  }

  // The lock: renames, owned files and blocks.
  const lock: GenesisLock = { ...emptyLock(), substitutions };
  const cliVersion = pinnedVersion(target, CLI_PACKAGE)?.version;
  const templates = templatesDir();
  for (const rel of walk(templates)) {
    if (shared && DATABASE_TEMPLATES.has(rel)) continue;
    const text = substitute(readFileSync(path.join(templates, rel), "utf8"), substitutions);
    const to = templateTarget(rel, text);
    files.set(to, text);
    lock.files[to] = { source: `${CLI_PACKAGE}:templates/${rel}`, sha256: sha256(text), ...(cliVersion ? { version: cliVersion } : {}) };
  }

  // The blocks the starter carries: every migration of theirs is in it.
  {
    const migrations = [...files.keys()].filter((f) => f.startsWith(`${MIGRATIONS_DIR}/`) && f.endsWith(".sql"));
    const steps: string[] = [];
    const blocks: string[] = [];
    for (const block of options.blocks) {
      if (switchedOff.has(block.id)) continue;
      if (shared) {
        // Its database files go in the web app: recorded here, written there.
        if (carried.includes(block.id)) {
          blocks.push(block.id);
          lock.blocks[block.id] = { package: block.package, ...(block.version ? { version: block.version } : {}) };
        }
        continue;
      }
      const stems = block.migrations.map((m) => stemOf(m.file));
      const copies = stems.map((s) => migrations.find((f) => path.posix.basename(f).replace(/^\d+_/, "") === `${s}.sql`));
      if (!stems.length || copies.some((c) => !c)) continue;
      blocks.push(block.id);
      lock.blocks[block.id] = { package: block.package, ...(block.version ? { version: block.version } : {}) };
      // The copies stay byte for byte the package's (the starter's own tests check that);
      // `genesis migrate` recognizes them by name and text.
      block.migrations.forEach((m, i) => {
        // Where it went, so a copy the app deletes is reported rather than copied again.
        lock.migrations = { ...lock.migrations, [migrationKey(m.package, m.file)]: copies[i]! };
        if (m.test) {
          const test = `${TESTS_DIR}/${path.posix.basename(m.test).replace(/^\d{4}_/, "")}`;
          if (files.has(test)) lock.files[test] = { source: `${m.package}:${m.test}`, sha256: sha256(files.get(test)!) };
        }
      });
      for (const fn of block.functions) {
        const name = fn.dir.split("/").pop()!;
        for (const f of [...files.keys()].filter((p) => p.startsWith(`supabase/functions/${name}/`))) {
          lock.files[f] = { source: `${fn.package}:${fn.dir}/${f.slice(`supabase/functions/${name}/`.length)}`, sha256: sha256(files.get(f)!) };
        }
      }
    }
    mkdirSync(target, { recursive: true });
    for (const [rel, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
      const file = path.join(target, ...rel.split("/"));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content, { encoding: "utf8", flag: "wx" });
    }
    writeLock(target, lock);
    steps.push(
      "Replace GENESIS_SHA in .github/workflows/*.yml with the commit of the Genesis release you run.",
      "Run eas init and put the project id in starter.config.ts app.easProjectId (builds, previews, updates).",
      "Set links.hosts in genesis.config.json to your web domain, or delete the links block (no app links then).",
      // The store ids only the person has: the doctor's eas-placeholder warnings say the same.
      ...[...files].flatMap(([rel, text]) => (rel === "eas.json" || rel.startsWith(".eas/") ? findPlaceholders(rel, text).map((p) => placeholderStep(rel, p.text, p.placeholder)) : [])),
    );
    let besideResult: InitNativeResult["beside"];
    if (beside) {
      const home = { app: beside.app, dir: beside.dir, hasSupabase: beside.shared };
      const missing = shared ? orderForAdding(blocksMissingThere(home, blocks) ?? blocks, options.blocks) : [];
      const line = !shared
        ? `${beside.app} has no supabase folder, so this app keeps its own supabase/ (as without --beside).`
        : (addThereLine(home, missing) ?? `${beside.app} already has the database side of every block this app uses (${blocks.join(", ") || "none"}).`);
      besideResult = { app: beside.app, shared, missing, line };
      steps.unshift(line);
    }
    return { target, files: [...files.keys(), "genesis.lock.json"].sort(), dependencies, unpinned, blocks, leftOut, steps, ...(besideResult ? { beside: besideResult } : {}) };
  }
}

/**
 * genesis.config.json for an app whose database is another app's: top-level
 * `"supabase": { "app": … }`, and no doctor supabase pack (that app's doctor checks the migrations).
 */
export function besideConfig(text: string, app: string): string {
  const json = JSON.parse(text) as Record<string, unknown> & { doctor?: Record<string, unknown> & { packs?: string[] } };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(json)) {
    if (key === "doctor" && value && typeof value === "object") {
      const { supabase: _settings, contracts: _contracts, ...rest } = value as Record<string, unknown> & { packs?: string[] };
      if (Array.isArray(rest.packs)) rest.packs = rest.packs.filter((p) => p !== "supabase");
      out[key] = rest;
    } else out[key] = value;
    // Right after the doctor block, so it reads as part of the app's setup.
    if (key === "doctor") out["supabase"] = { $comment: "This app has no supabase/ folder: its database files (migrations, pgTAP tests, Edge Functions) are in the supabase/ folder of the app named here. Run genesis add and migrate there.", app };
  }
  if (!("supabase" in out)) out["supabase"] = { app };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** True when the starter holds a copy of every migration the block ships (and it ships one). */
function carriedBy(files: Map<string, string>, block: BlockManifest): boolean {
  const names = [...files.keys()].filter((f) => f.startsWith(`${MIGRATIONS_DIR}/`) && f.endsWith(".sql")).map((f) => path.posix.basename(f).replace(/^\d+_/, ""));
  return block.migrations.length > 0 && block.migrations.every((m) => names.includes(`${stemOf(m.file)}.sql`));
}

/**
 * Where the doctor's supabase pack starts counting migrations as new (`doctor.supabase.since`):
 * just after the newest the app was made with, so the starter's copies are its applied baseline
 * even before the app has a git history to compare with.
 */
function sinceAfter(files: Map<string, string>): string | null {
  const versions = [...files.keys()].filter((f) => f.startsWith(`${MIGRATIONS_DIR}/`) && f.endsWith(".sql")).map((f) => /^(\d{14})_/.exec(path.posix.basename(f))?.[1]).filter((v): v is string => Boolean(v)).sort();
  const last = versions.at(-1);
  return last ? String(BigInt(last) + 1n).padStart(14, "0") : null;
}

/** The `@feat:` ids on a file's first line. */
function featTags(text: string): string[] {
  return [...(text.split("\n", 1)[0] ?? "").matchAll(/@feat:([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]!);
}

/**
 * Drop the blocks' files from what init writes: their migrations and pgTAP tests, their Edge
 * Functions and config.toml sections, the starter's own supabase files tagged only with them
 * (chat_people goes with chat), and the API schemas their migrations create (from config.toml's
 * `[api] schemas` and the doctor's exposedSchemas).
 */
function leaveOut(files: Map<string, string>, blocks: BlockManifest[]): void {
  const ids = new Set(blocks.map((b) => b.id));
  const migrations = [...files.keys()].filter((f) => f.startsWith(`${MIGRATIONS_DIR}/`) && f.endsWith(".sql"));
  const schemas = new Set<string>();
  const functions = new Set<string>();
  for (const block of blocks) {
    for (const m of block.migrations) {
      const stem = stemOf(m.file);
      for (const copy of migrations.filter((f) => path.posix.basename(f).replace(/^\d+_/, "") === `${stem}.sql`)) {
        for (const s of files.get(copy)!.matchAll(/\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) schemas.add(s[1]!.toLowerCase());
        files.delete(copy);
      }
      files.delete(`${TESTS_DIR}/${stem}.test.sql`);
      if (m.test) files.delete(`${TESTS_DIR}/${path.posix.basename(m.test).replace(/^\d{4}_/, "")}`);
    }
    for (const fn of block.functions) {
      const name = fn.dir.split("/").pop()!;
      functions.add(name);
      for (const f of [...files.keys()].filter((p) => p.startsWith(`supabase/functions/${name}/`))) files.delete(f);
    }
  }
  for (const [rel, text] of [...files]) {
    const tags = rel.startsWith("supabase/") ? featTags(text) : [];
    if (tags.length && tags.every((t) => ids.has(t))) files.delete(rel);
  }
  const toml = files.get("supabase/config.toml");
  if (toml !== undefined) {
    // Sections are paragraphs (their comments above them): drop the functions' whole paragraphs.
    const paragraphs = toml.split(/\n{2,}/).filter((p) => ![...functions].some((name) => p.split("\n").includes(`[functions.${name}]`)));
    let out = paragraphs.join("\n\n");
    if (!out.endsWith("\n")) out += "\n";
    const served = /^schemas\s*=\s*\[([^\]]*)\]/m.exec(out)?.[1] ?? "";
    for (const schema of [...schemas].filter((s) => served.includes(`"${s}"`))) {
      out = out.replace(/^(schemas\s*=\s*\[)([^\]]*)\]/m, (_all, head: string, list: string) => `${head}${list.split(",").map((s) => s.trim()).filter((s) => s && s !== `"${schema}"`).join(", ")}]`);
      // The comment that said the API serves it.
      out = out.replace(new RegExp(`^#[^\n]*\\b${schema}\\b[^\n]*\n(?:#[^\n]*\n)*(?=\\[api\\])`, "m"), "");
    }
    files.set("supabase/config.toml", out);
  }
  const config = files.get("genesis.config.json");
  if (config !== undefined && schemas.size) {
    const json = JSON.parse(config) as { doctor?: { supabase?: { exposedSchemas?: string[] } } };
    const exposed = json.doctor?.supabase?.exposedSchemas;
    if (exposed?.some((s) => schemas.has(s))) {
      const kept = exposed.filter((s) => !schemas.has(s));
      files.set("genesis.config.json", config.replace(/("exposedSchemas"\s*:\s*)\[[^\]]*\]/, `$1${JSON.stringify(kept).replace(/","/g, '", "')}`));
    }
  }
}

/** `initNative`, with the blocks it can record read first (from package metadata). */
export async function runInitNative(options: Omit<InitNativeOptions, "blocks">): Promise<InitNativeResult> {
  // The CLI's own catalog: the versions it was released with, not whatever a parent folder has installed.
  return initNative({ ...options, blocks: catalogBlocks() });
}
