/**
 * Every block Genesis ships, as `genesis add` would copy it into an app: the
 * files it ships must pass the app's own checks straight away.
 *
 * - `features check`: a `@feat:<id>` tag in a shipped file names a feature the
 *   app's registry has once the block is added, which is the block's own id
 *   (the entry `genesis add` writes) or a block it requires.
 * - Secret scanning: no shipped file matches gitleaks' private-key rule.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { blocksOfInstalled } from "../src/blocks/discover.js";
import type { BlockManifest } from "../src/blocks/manifest.js";
import { PACKAGES } from "./blocks-helpers.js";

/** The tag `features check` reads (genesis-features, node.ts). */
const FEAT_TAG = /@feat:([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)/g;

/** gitleaks' `private-key` rule (config/gitleaks.toml, v8), with its `(?i)` as a flag. */
const GITLEAKS_PRIVATE_KEY = /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S-]{64,}?KEY(?: BLOCK)?-----/i;

/** Every workspace Genesis package, by name: its folder. */
function packageFolders(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of readdirSync(PACKAGES)) {
    const file = path.join(PACKAGES, dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; private?: boolean };
    if (pkg.name?.startsWith("@marktiderman/genesis") && !pkg.private) out.set(pkg.name, path.join(PACKAGES, dir));
  }
  return out;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** What `genesis add` copies into the app for one block: migrations, their tests, functions, skills, the AGENTS.md fragment. */
function shippedFiles(manifest: BlockManifest, folders: Map<string, string>): string[] {
  const at = (pkg: string, rel: string) => {
    const dir = folders.get(pkg);
    if (!dir) throw new Error(`${manifest.id}: ships from ${pkg}, which isn't in this workspace`);
    return path.join(dir, ...rel.split("/"));
  };
  return [
    ...manifest.migrations.flatMap((m) => [at(m.package, m.file), ...(m.test ? [at(m.package, m.test)] : [])]),
    ...manifest.functions.flatMap((f) => filesUnder(at(f.package, f.dir))),
    ...manifest.skills.map((s) => at(s.package, s.path)),
    ...(manifest.agents ? [at(manifest.agents.package, manifest.agents.path)] : []),
  ];
}

async function everyBlock(): Promise<{ manifest: BlockManifest; files: string[] }[]> {
  const folders = packageFolders();
  const warnings: string[] = [];
  const out: { manifest: BlockManifest; files: string[] }[] = [];
  for (const dir of folders.values()) {
    for (const manifest of await blocksOfInstalled(dir, warnings)) out.push({ manifest, files: shippedFiles(manifest, folders) });
  }
  expect(warnings).toEqual([]);
  return out;
}

const rel = (file: string) => path.relative(PACKAGES, file);

describe("blocks pass the app's own checks", () => {
  it("finds the blocks and what they ship", async () => {
    const blocks = await everyBlock();
    expect(blocks.map((b) => b.manifest.id)).toEqual(expect.arrayContaining(["account", "sites", "events", "support-feedback"]));
    for (const { manifest, files } of blocks) for (const file of files) expect(existsSync(file), `${manifest.id}: ${rel(file)}`).toBe(true);
  });

  it("tags shipped files only with features the app registers when it adds the block", async () => {
    const problems: string[] = [];
    for (const { manifest, files } of await everyBlock()) {
      const registered = new Set([manifest.id, ...manifest.requires]);
      for (const file of files) {
        for (const m of readFileSync(file, "utf8").matchAll(FEAT_TAG)) {
          if (!registered.has(m[1]!)) problems.push(`${manifest.id}: ${rel(file)} is tagged @feat:${m[1]}, which the app doesn't register (tag it @feat:${manifest.id})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("ships nothing gitleaks reads as a private key", async () => {
    const problems: string[] = [];
    for (const { manifest, files } of await everyBlock()) {
      for (const file of files) if (GITLEAKS_PRIVATE_KEY.test(readFileSync(file, "utf8"))) problems.push(`${manifest.id}: ${rel(file)}`);
    }
    expect(problems).toEqual([]);
  });

  it("reads gitleaks' rule the way gitleaks does", () => {
    // The shape that tripped it: a PEM-header regex in code, and a later `KEY-----` over 64 characters on.
    const dashes = "-".repeat(5);
    const flagged = [
      `if (!/${dashes}BEGIN PRIVATE KEY${dashes}[\\s\\S]+${dashes}END PRIVATE KEY${dashes}/.test(pem)) problems.push("APPLE_PRIVATE_KEY (the .p8 file's PEM text)");`,
      `const body = pem.replace(/${dashes}(BEGIN|END) PRIVATE KEY${dashes}/g, "");`,
    ].join("\n");
    expect(GITLEAKS_PRIVATE_KEY.test(flagged)).toBe(true);
    expect(GITLEAKS_PRIVATE_KEY.test(flagged.replaceAll(dashes, "-{5}"))).toBe(false);
  });
});
