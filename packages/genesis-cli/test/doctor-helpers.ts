/**
 * Builds a throwaway app for doctor tests: a fixture folder from
 * test/fixtures/doctor/rules/<name>, plus fake Genesis packages installed
 * into its node_modules (the fake declarations live unbuilt in
 * test/fixtures/doctor/_genesis because dist/ is gitignored).
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "doctor");
const GENESIS = path.join(FIXTURES, "_genesis");

const created: string[] = [];

export function makeApp(fixture: string | null, extra: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-doctor-"));
  created.push(root);
  const scope = path.join(root, "node_modules", "@marktiderman");
  const put = (from: string, to: string) => {
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
  };
  put(path.join(GENESIS, "genesis-ui", "package.json"), path.join(scope, "genesis-ui", "package.json"));
  put(path.join(GENESIS, "genesis-ui", "index.d.ts"), path.join(scope, "genesis-ui", "dist", "index.d.ts"));
  put(path.join(GENESIS, "genesis-ui", "data.d.ts"), path.join(scope, "genesis-ui", "dist", "components", "data", "index.d.ts"));
  put(path.join(GENESIS, "design-system", "package.json"), path.join(scope, "genesis-design-system", "package.json"));
  for (const css of ["genesis.css", "genesis-tailwind4.css"]) {
    put(path.join(GENESIS, "design-system", css), path.join(scope, "genesis-design-system", "dist", "themes", css));
  }
  put(path.join(GENESIS, "genesis-core", "package.json"), path.join(scope, "genesis-core", "package.json"));
  put(path.join(GENESIS, "genesis-core", "index.d.ts"), path.join(scope, "genesis-core", "dist", "index.d.ts"));
  if (fixture) cpSync(path.join(FIXTURES, "rules", fixture), root, { recursive: true });
  for (const [file, content] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

export function cleanupApps(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}
