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
 * - Adds the templates (eas, maestro, ci), and records every Genesis-owned
 *   file, the blocks the starter carries and the renames in genesis.lock.json,
 *   so `genesis upgrade` can refresh them and `genesis migrate` knows the blocks.
 * - Keeps the copied migrations byte for byte (genesis migrate knows them by name and text).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { catalogBlocks, CLI_PACKAGE } from "./discover.js";
import { sha256 } from "./files.js";
import { emptyLock, migrationKey, substitute, writeLock, type GenesisLock } from "./lock.js";
import type { BlockManifest } from "./manifest.js";
import { stemOf, MIGRATIONS_DIR, TESTS_DIR } from "./migrations.js";
import { pinnedVersion } from "./pm.js";
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
  /** Blocks it may find in the starter (their migrations all copied) and record. */
  blocks: BlockManifest[];
}

export interface InitNativeResult {
  target: string;
  files: string[];
  dependencies: Record<string, string>;
  unpinned: string[];
  blocks: string[];
  steps: string[];
}

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

function readme(display: string, slug: string): string {
  return `# ${display}

An Expo app made with \`genesis init ${slug} --template native\` from the Genesis RN starter.

1. \`cp .env.example .env\` and fill in your Supabase project's URL and publishable key.
2. Install: \`pnpm install\` (or your package manager).
3. Apply \`supabase/migrations\` (\`supabase db push\`, or \`supabase start\` for a local stack).
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

  const source = starterDir();
  const read = (rel: string) => readFileSync(path.join(source, rel), "utf8");
  const was = starterIdentity(read("starter.config.ts"));
  const substitutions: Record<string, string> = { [was.bundleId]: bundleId, [was.slug]: slug, [was.scheme]: scheme, [was.name]: display };
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
  files.set("README.md", readme(display, slug));

  // The lock: renames, owned files and blocks.
  const lock: GenesisLock = { ...emptyLock(), substitutions };
  const cliVersion = pinnedVersion(target, CLI_PACKAGE)?.version;
  const templates = templatesDir();
  for (const rel of walk(templates)) {
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
      "Set links.hosts in genesis.config.json to your web domain, or delete the links block.",
    );
    return { target, files: [...files.keys(), "genesis.lock.json"].sort(), dependencies, unpinned, blocks, steps };
  }
}

/** `initNative`, with the blocks it can record read first (from package metadata). */
export async function runInitNative(options: Omit<InitNativeOptions, "blocks">): Promise<InitNativeResult> {
  // The CLI's own catalog: the versions it was released with, not whatever a parent folder has installed.
  return initNative({ ...options, blocks: catalogBlocks() });
}
