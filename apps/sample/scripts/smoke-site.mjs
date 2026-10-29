#!/usr/bin/env node
/**
 * Smoke test of the built site: serves build/client the way a static host
 * does (each page's own index.html, 404.html for anything else) and opens
 * every page in headless Chromium. A page fails when it throws, logs an
 * error, shows the error screen, or answers anything but 200.
 *
 *   node scripts/smoke-site.mjs            every page in sitemap.xml
 *   node scripts/smoke-site.mjs --quick    one page per route
 *   SMOKE_SHOTS=dir                        also save a screenshot of each
 *
 * Run after `pnpm build`. CI runs it on every pull request (ci.yml, "Site").
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)), "build", "client");
if (!existsSync(join(ROOT, "index.html"))) {
  console.error("No build at apps/sample/build/client. Run `pnpm --filter sample build` first.");
  process.exit(1);
}
const quick = process.argv.includes("--quick");
const shots = process.env.SMOKE_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".md": "text/markdown", ".woff2": "font/woff2" };

const FALLBACK = existsSync(join(ROOT, "404.html")) ? join(ROOT, "404.html") : join(ROOT, "__spa-fallback.html");

/** A file inside the build for a request path, or null. Never anything outside ROOT. */
function inRoot(...parts) {
  const file = resolve(ROOT, ...parts);
  return file.startsWith(ROOT + sep) && existsSync(file) && statSync(file).isFile() ? file : null;
}

function resolveFile(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(new URL(urlPath, "http://localhost").pathname);
  } catch {
    return { file: FALLBACK, status: 400 };
  }
  if (clean.includes("\0")) return { file: FALLBACK, status: 400 };
  const rel = `.${clean.replace(/\/+$/, "")}`;
  const file = inRoot(rel) ?? inRoot(rel, "index.html");
  return file ? { file, status: 200 } : { file: FALLBACK, status: 404 };
}

const server = createServer((req, res) => {
  const { file, status } = resolveFile(req.url ?? "/");
  res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const origin = `http://127.0.0.1:${server.address().port}`;

const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
let paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (quick) {
  // One page per route: keep the first of each parameterised family.
  const seen = new Set();
  paths = paths.filter((p) => {
    const family = p.replace(/^(\/showcase\/(primitives|tokens|layouts)|\/forms|\/preview|\/projects)\/.*$/, "$1/*");
    return seen.has(family) ? false : (seen.add(family), true);
  });
}

// Pages known to fail, each with the reason. Only shrinks: a listed page
// that now renders fails the run, so it gets removed.
const KNOWN_BROKEN = {
  "/sites-editor": "Crashes on load: the editor has no config for the footer section.",
  "/studio": "Needs the dev server's studio handler; static hosting has none.",
};

// Messages a page may log without failing: third-party noise, not our code.
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /Download the React DevTools/, /net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_REFUSED)/];

// Accessibility rules every page must pass (axe-core), checked on one page per route.
const AXE_RULES = ["button-name", "link-name", "image-alt", "label", "landmark-unique", "aria-allowed-attr", "aria-required-attr"];
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const families = new Set();
const familyOf = (p) => p.replace(/^(\/showcase\/(primitives|tokens|layouts)|\/forms|\/preview|\/projects|\/packages)\/.*$/, "$1/*");

const browser = await chromium.launch();
const failures = [];
let done = 0;

async function check(path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`throws: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text()) && !IGNORE.some((re) => re.test(m.text())))
      errors.push(`logs: ${m.text().split("\n")[0].slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url() !== origin + path && !IGNORE.some((re) => re.test(r.url()))) errors.push(`${r.status()}: ${r.url().replace(origin, "")}`);
  });
  let status = 0;
  try {
    const res = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 30_000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(150);
    const text = await page.locator("body").innerText();
    if (/Oops!|An unexpected error occurred|The requested page could not be found/.test(text)) errors.push("shows the error screen");
    if (text.trim().length < 20) errors.push("renders nothing");
    const family = familyOf(path);
    if (!families.has(family)) {
      families.add(family);
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(
        (rules) => window.axe.run(document, { runOnly: { type: "rule", values: rules } }).then((r) => r.violations),
        AXE_RULES,
      );
      for (const v of violations) errors.push(`a11y ${v.id}: ${v.help} (${v.nodes.length}×, e.g. ${v.nodes[0]?.target?.join(" ")})`);
    }
    if (shots) await page.screenshot({ path: join(shots, `${path.replace(/\//g, "_") || "_home"}.png`) });
  } catch (e) {
    errors.push(`didn't load: ${e.message.split("\n")[0]}`);
  }
  if (status !== 200) errors.push(`answered ${status}`);
  if (path in KNOWN_BROKEN) {
    if (!errors.length) failures.push({ path, errors: ["renders now: remove it from KNOWN_BROKEN in scripts/smoke-site.mjs"] });
  } else if (errors.length) failures.push({ path, errors: [...new Set(errors)] });
  await page.close();
  if (++done % 50 === 0) console.log(`  ${done}/${paths.length}`);
}

// A few pages at a time.
const queue = [...paths];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) await check(queue.shift());
}));
await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} of ${paths.length} pages failed:`);
  for (const f of failures) console.error(`  ${f.path}\n    ${f.errors.join("\n    ")}`);
  console.error("\nOpen the page with `pnpm --filter sample dev` to see the error in full.");
  process.exit(1);
}
console.log(`All ${paths.length} pages render.`);
