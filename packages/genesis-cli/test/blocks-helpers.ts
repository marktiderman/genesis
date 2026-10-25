/**
 * Throwaway apps and packages for the block command tests: an app folder with
 * the files given, and fake Genesis packages "installed" in its node_modules.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";

export const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const NOW = new Date("2026-11-01T12:00:00Z");

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});

export function tempDir(prefix = "genesis-blocks-"): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

export function makeApp(files: Record<string, string> = {}): string {
  const root = tempDir();
  writeTree(root, { "package.json": JSON.stringify({ name: "fixture-app", dependencies: {} }, null, 2) + "\n", ...files });
  return root;
}

/** A package in the app's node_modules: its package.json (with `genesis`) and files. */
export function fakePackage(root: string, name: string, pkg: Record<string, unknown>, files: Record<string, string> = {}): string {
  const dir = path.join(root, "node_modules", ...name.split("/"));
  writeTree(dir, { "package.json": JSON.stringify({ name, version: "1.0.0", ...pkg }, null, 2), ...files });
  return dir;
}

/** The real workspace package, linked into the app's node_modules the way pnpm links it. */
export function linkWorkspacePackage(root: string, name: string, folder: string): void {
  const link = path.join(root, "node_modules", ...name.split("/"));
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(path.join(PACKAGES, folder), link, "dir");
}

export const read = (root: string, rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Every file under the app (not node_modules), with its text, for before/after comparisons. */
export function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const name of readdirSync(path.join(root, rel))) {
      if (name === "node_modules") continue;
      const child = rel ? `${rel}/${name}` : name;
      if (statSync(path.join(root, child)).isDirectory()) walk(child);
      else out[child] = readFileSync(path.join(root, child), "utf8");
    }
  };
  walk("");
  return out;
}

export const SQL_A = "-- fixture notes: table\ncreate table public.fixture_notes (id uuid primary key);\n";
export const SQL_B = "-- fixture notes: a column\nalter table public.fixture_notes add column body text;\n";
export const TEST_A = "begin; select plan(1); select has_table('public', 'fixture_notes', 'table'); select * from finish(); rollback;\n";

/** A fake Genesis package declaring one block with every kind of contribution. */
export function fixturePackage(root: string, overrides: Record<string, unknown> = {}, files: Record<string, string> = {}): string {
  return fakePackage(
    root,
    "@marktiderman/genesis-fixture",
    {
      genesis: {
        blocks: {
          "fixture-notes": {
            feature: { name: "Fixture notes", summary: "Notes, for tests.", keywords: ["notes"] },
            platforms: ["native"],
            migrations: [
              { file: "migrations/0001_fixture_notes.sql", test: "migrations/tests/0001_fixture_notes.test.sql" },
              { file: "migrations/0002_fixture_notes_body.sql" },
            ],
            functions: [{ dir: "functions/fixture-send", verifyJwt: false, secrets: ["FIXTURE_SECRET"] }],
            routes: [{ path: "/notes", description: "The notes list", signedIn: true }],
            skills: ["skills/notes/SKILL.md"],
            agents: "agents/notes.md",
            steps: ["Turn the notes on in your app."],
            ...overrides,
          },
        },
      },
    },
    {
      "migrations/0001_fixture_notes.sql": SQL_A,
      "migrations/0002_fixture_notes_body.sql": SQL_B,
      "migrations/tests/0001_fixture_notes.test.sql": TEST_A,
      "functions/fixture-send/index.ts": "Deno.serve(() => new Response('ok'));\n",
      "functions/fixture-send/handler.ts": "export const handler = 1;\n",
      "skills/notes/SKILL.md": "---\nname: fixture-notes\ndescription: Notes.\n---\n\n# Notes\n",
      "agents/notes.md": "## Notes\n\n- Notes live in public.fixture_notes.\n",
      ...files,
    },
  );
}

/** An app with an Expo Router root, a supabase folder and a feature registry. */
export function expoApp(extra: Record<string, string> = {}): string {
  return makeApp({
    "src/app/_layout.tsx": "export default function Layout() { return null; }\n",
    "src/app/(app)/_layout.tsx": "export default function Layout() { return null; }\n",
    "src/app/(app)/index.tsx": "export default function Home() { return null; }\n",
    "supabase/config.toml": 'project_id = "fixture"\n',
    "supabase/migrations/20261020000000_app_init.sql": "create table public.things (id int);\n",
    "features.ts": [
      'import { defineFeatures } from "@marktiderman/genesis-features";',
      "",
      "export const features = defineFeatures({",
      "  home: {",
      '    name: "Home",',
      '    summary: "The first screen.",',
      '    status: "live",',
      '    owner: "team",',
      '    apps: ["native"],',
      '    audience: ["person"],',
      '    acceptance: ["It opens."],',
      "  },",
      "});",
      "",
    ].join("\n"),
    ...extra,
  });
}
