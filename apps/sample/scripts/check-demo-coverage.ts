/**
 * Every Genesis component has somewhere to see it running: a story in
 * stories/, or a page of this app that uses it. Reads the component list
 * from app/data/primitives.json (generated from the packages' source, so a
 * new component is in it the next time docs:generate runs).
 *
 * A component with neither fails, unless demo-coverage.allow.json names it
 * with a reason. The allow-list only shrinks: an entry whose component now
 * has a demo fails too, so it gets removed.
 *
 *   pnpm --filter sample coverage:check            check (CI: genesis-lint.yml, with docs:check)
 *   pnpm --filter sample coverage:check --list     print each component's demo
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW_FILE = join(SAMPLE, "demo-coverage.allow.json");

interface Primitive {
  slug: string;
  surface: "web" | "native";
  subpath: string;
  filePath: string;
  primaryComponent?: string;
  components?: Array<{ name: string } | string>;
}
const { primitives } = JSON.parse(readFileSync(join(SAMPLE, "app", "data", "primitives.json"), "utf8")) as { primitives: Primitive[] };

// Where demos live: stories, routes and components. Not the generated data or the catalog pages,
// which list every component by name without showing it.
const SKIP = [/app\/data\//, /app\/lib\/(site|site-paths|portfolio-data|primitive-docs)\.ts$/, /routes\/(showcase|packages)\./];
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mdx)$/.test(f) ? [p] : [];
  });
}
const sources = [...walk(join(SAMPLE, "stories")), ...walk(join(SAMPLE, "app"))]
  .map((file) => ({ file: relative(SAMPLE, file), text: readFileSync(file, "utf8") }))
  .filter((s) => !SKIP.some((re) => re.test(s.file)));

function names(p: Primitive): string[] {
  const list = (p.components ?? []).map((c) => (typeof c === "string" ? c : c.name));
  return [...new Set([p.primaryComponent, ...list].filter((n): n is string => !!n && /^[A-Za-z]/.test(n)))];
}

function demoOf(p: Primitive): string | undefined {
  for (const name of names(p)) {
    const used = new RegExp(`(<${name}[\\s/>.]|\\b${name}\\(|import[^;]*\\b${name}\\b)`);
    const hit = sources.find((s) => used.test(s.text));
    if (hit) return hit.file;
  }
  return undefined;
}

const key = (p: Primitive) => `${p.surface}/${p.slug}`;
const allow: Record<string, string> = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, "utf8")) : {};
const allowed = (k: string) => k in allow || `${k.split("/")[0]}/*` in allow;

const missing: string[] = [];
const stale: string[] = [];
const rows: string[] = [];
for (const p of primitives) {
  const k = key(p);
  const demo = demoOf(p);
  rows.push(`${k.padEnd(40)} ${demo ?? (allowed(k) ? "(allowed)" : "MISSING")}`);
  if (!demo && !allowed(k)) missing.push(`${k} (${names(p).join(", ") || p.slug}, ${p.filePath})`);
  if (demo && k in allow) stale.push(`${k}: shown in ${demo}`);
}
for (const k of Object.keys(allow)) {
  if (k.endsWith("/*")) continue;
  if (!primitives.some((p) => key(p) === k)) stale.push(`${k}: no such component any more`);
  if (!allow[k]?.trim()) missing.push(`${k}: the allow-list entry needs a reason`);
}

if (process.argv.includes("--list")) console.log(rows.join("\n"));
if (missing.length || stale.length) {
  if (missing.length) {
    console.error(`\n${missing.length} component(s) have no story or demo page:\n  ${missing.join("\n  ")}`);
    console.error(
      "\nAdd a story (apps/sample/stories/<Name>.stories.tsx) or use it on a page of the sample app.\n" +
        "If it can't be shown, add it to apps/sample/demo-coverage.allow.json with a reason.",
    );
  }
  if (stale.length) console.error(`\nRemove from apps/sample/demo-coverage.allow.json (it only shrinks):\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
const shown = primitives.filter((p) => demoOf(p)).length;
console.log(`demo coverage: ${shown} of ${primitives.length} components shown; ${primitives.length - shown} allowed with a reason.`);
