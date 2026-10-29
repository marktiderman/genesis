/**
 * Writes the site's static files into the client build, after
 * `react-router build`, from the repo itself so they never go stale:
 *
 *   robots.txt, sitemap.xml  every prerendered page (app/lib/site-paths.ts)
 *   llms.txt                 an index for coding agents: docs, packages, demos
 *   llms-full.txt            every doc and package README in one file
 *   docs/*.md                a copy of each doc (docs/, docs/adr/)
 *   packages/<name>.md       each published package's README (and SKILL.md)
 *
 * Host-agnostic: SITE_URL (default https://genesisone.dev) sets the origin.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sitePages } from "../app/lib/site-paths";
import { SITE_BASE, SITE_DESCRIPTION, SITE_PAGES, SITE_TAGLINE, SITE_URL } from "../app/lib/site";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(here, "..");
const ROOT = resolve(SAMPLE, "..", "..");
const OUT = resolve(SAMPLE, "build", "client");
// One origin and base for the page tags (app/lib/site.ts) and these files.
const url = (path: string) => `${SITE_URL}${SITE_BASE}${path}`;

if (!existsSync(OUT)) throw new Error(`No client build at ${OUT}; run react-router build first.`);

// Every static route in app/routes.ts needs a title and description in app/lib/site.ts.
{
  const routes = readFileSync(join(SAMPLE, "app", "routes.ts"), "utf8");
  const listed = new Set(SITE_PAGES.map((p) => p.path));
  const UNLISTED = new Set(["forms-frame", "forms-playground", "projects/*"]); // framed by another page / an older alias
  const missing = [...routes.matchAll(/route\("([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((path) => !path.includes(":") && !UNLISTED.has(path) && !listed.has(`/${path}`));
  if (missing.length) {
    console.error(`[site-files] add these routes to SITE_PAGES in app/lib/site.ts (title and description): ${missing.map((p) => `/${p}`).join(", ")}`);
    process.exit(1);
  }
}

function write(rel: string, body: string) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

// Docs: every markdown file in docs/ and docs/adr/, with its first heading as the title.
interface Doc {
  rel: string;
  title: string;
  summary: string;
  body: string;
}
function readDocs(dir: string, prefix: string): Doc[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f;
      const summary = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("<!--"));
      return { rel: `${prefix}${f}`, title, summary: oneLine(summary ?? ""), body };
    });
}
const docs = [...readDocs(join(ROOT, "docs"), "docs/"), ...readDocs(join(ROOT, "docs", "adr"), "docs/adr/")];

// Packages: every published package (not private), with its README and SKILL.md.
interface Pkg {
  dir: string;
  name: string;
  version: string;
  description: string;
  readme?: string;
  skill?: string;
}
const packages = readdirSync(join(ROOT, "packages"))
  .filter((d) => existsSync(join(ROOT, "packages", d, "package.json")))
  .map((d): Pkg | null => {
    const pkgDir = join(ROOT, "packages", d);
    const json = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    const read = (f: string) => (existsSync(join(pkgDir, f)) ? readFileSync(join(pkgDir, f), "utf8") : undefined);
    return json.private
      ? null
      : { dir: d, name: json.name, version: json.version, description: json.description ?? "", readme: read("README.md"), skill: read("SKILL.md") };
  })
  .filter((p): p is Pkg => p !== null)
  .sort((a, b) => a.name.localeCompare(b.name));

function oneLine(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// 1. Copies of the docs and package READMEs, so every llms.txt link resolves.
for (const d of docs) write(d.rel, d.body);
for (const p of packages) {
  if (p.readme) write(`packages/${p.dir}.md`, p.readme);
  if (p.skill) write(`packages/${p.dir}.SKILL.md`, p.skill);
}

// 2. Sitemap and robots.
const pages = sitePages();
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${url(p.path === "/" ? "/" : p.path)}</loc></url>`)
    .join("\n")}\n</urlset>\n`,
);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${url("/sitemap.xml")}\n`);

// 3. llms.txt (the index) and llms-full.txt (everything).
const demoPages = pages.filter((p) => !p.path.startsWith("/showcase/primitives/") && !p.path.includes("/preview/"));
const llms = [
  "# Genesis",
  "",
  `> ${SITE_TAGLINE} ${SITE_DESCRIPTION}`,
  "",
  "Start an app with `npx @marktiderman/genesis-cli init my-app`, then run `genesis doctor`. Agents should read the ui skill first: it names the primitive for each need.",
  "",
  "## Docs",
  "",
  ...docs.map((d) => `- [${d.title}](${url(`/${d.rel}`)})${d.summary ? `: ${d.summary}` : ""}`),
  "",
  "## Packages",
  "",
  ...packages.flatMap((p) => [
    // The README's copy when there is one, else the package's page.
    `- [${p.name}](${url(p.readme ? `/packages/${p.dir}.md` : `/packages/${p.dir}`)}) ${p.version}: ${oneLine(p.description)}`,
    ...(p.skill ? [`- [${p.name} skill](${url(`/packages/${p.dir}.SKILL.md`)}): what to use for each need, for coding agents`] : []),
  ]),
  "",
  "## Live demos",
  "",
  ...demoPages.map((p) => `- [${p.title}](${url(p.path)}): ${p.description}`),
  "",
  "## Optional",
  "",
  `- [Everything in one file](${url("/llms-full.txt")})`,
  `- [Storybook](${url("/storybook/")})`,
  "- [Source on GitHub](https://github.com/marktiderman/genesis)",
  "",
].join("\n");
write("llms.txt", llms);

const full = [
  `# Genesis\n\n> ${SITE_TAGLINE} ${SITE_DESCRIPTION}\n`,
  ...packages.filter((p) => p.skill).map((p) => `\n\n---\n\n<!-- ${p.name} SKILL.md -->\n\n${p.skill}`),
  // The component reference is a generated table of every export: linked from llms.txt, not inlined.
  ...docs.filter((d) => d.rel !== "docs/component-reference.md").map((d) => `\n\n---\n\n<!-- ${d.rel} -->\n\n${d.body}`),
  ...packages.filter((p) => p.readme).map((p) => `\n\n---\n\n<!-- ${p.name} README.md -->\n\n${p.readme}`),
].join("");
write("llms-full.txt", full);

console.log(
  `[site-files] wrote sitemap (${pages.length} pages), robots.txt, llms.txt, llms-full.txt (${Math.round(full.length / 1024)} KB), ${docs.length} docs and ${packages.length} package pages`,
);
