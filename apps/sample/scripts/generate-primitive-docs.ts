/**
 * G.12 — react-docgen-typescript primitive reference generator.
 *
 * Walks every component file under packages/ui/src and packages/ui-native/src,
 * extracts the parsed component metadata via react-docgen-typescript, and
 * emits a single JSON artifact at apps/sample/app/data/primitives.json that
 * the /showcase/primitives/:slug route consumes.
 *
 * Each *file* becomes one primitive entry — its slug derived from the file
 * name (so `accordion.tsx` → `accordion`). Multiple exported components per
 * file are kept under `components`, mirroring how the hand-curated
 * portfolio-data.ts groups Accordion / AccordionItem / AccordionTrigger
 * under one detail page. Per-component metadata:
 *
 *   - name           component identifier
 *   - summary        first JSDoc block's free-text description
 *   - props          [{ name, type, required, defaultValue, description }]
 *
 * Per-primitive (file-level) metadata:
 *
 *   - slug           kebab-cased file basename
 *   - filePath       repo-relative source file
 *   - surface        "web" | "native"
 *   - subpath        package subpath export ("@marktiderman/genesis-ui",
 *                    "@marktiderman/genesis-ui/data", "@marktiderman/genesis-ui-native")
 *   - stability      value of @stability tag (any component in the file
 *                    that declares one). Defaults to "stable".
 *   - summary        rolled-up summary from the primary component
 *   - components     list of parsed components
 *
 * Modes:
 *   docs:generate           — write primitives.json
 *   docs:generate --check   — fail if regenerating produces a diff (used in CI
 *                             to enforce docs-in-sync)
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ComponentDoc,
  type PropItem,
  withCustomConfig,
} from "react-docgen-typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const SAMPLE_APP = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(SAMPLE_APP, "app", "data", "primitives.json");

const UI_SRC = resolve(REPO_ROOT, "packages", "ui", "src");
const UI_NATIVE_SRC = resolve(REPO_ROOT, "packages", "ui-native", "src");

interface GeneratedProp {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string;
}

interface GeneratedComponent {
  name: string;
  summary: string;
  props: GeneratedProp[];
}

interface GeneratedPrimitive {
  slug: string;
  aliases: string[];
  surface: "web" | "native";
  subpath: string;
  filePath: string;
  stability: "stable" | "beta" | "planned" | "deprecated" | "experimental";
  summary: string;
  primaryComponent: string;
  components: GeneratedComponent[];
}

interface GeneratorOutput {
  generatedAt: string;
  surfaces: {
    web: { package: string; subpaths: string[]; count: number };
    native: { package: string; subpaths: string[]; count: number };
  };
  primitives: GeneratedPrimitive[];
}

// Directories that hold non-component artefacts (utilities, hooks,
// providers). They still ship from the package but don't belong on the
// primitives reference page.
const NON_COMPONENT_DIRS = new Set(["hooks", "provider", "context"]);

// File names (basename minus extension) that are pure utility modules.
const NON_COMPONENT_FILES = new Set([
  "utils",
  "status-colors",
  "nativewind.d",
  "supabase-provider",
]);

function findComponentFiles(rootDir: string): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir);
    for (const name of entries) {
      const full = join(dir, name);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        if (NON_COMPONENT_DIRS.has(name)) continue;
        walk(full);
        continue;
      }
      if (!stats.isFile()) continue;
      if (!name.endsWith(".tsx") && !name.endsWith(".ts")) continue;
      if (name.endsWith(".d.ts")) continue;
      if (name.endsWith(".test.tsx") || name.endsWith(".test.ts")) continue;
      if (name.endsWith(".spec.tsx") || name.endsWith(".spec.ts")) continue;
      if (name === "index.ts" || name === "index.tsx") continue;
      const stem = name.replace(/\.(tsx|ts)$/, "");
      if (NON_COMPONENT_FILES.has(stem)) continue;
      out.push(full);
    }
  }

  walk(rootDir);
  return out.sort();
}

/**
 * Extract the file-level JSDoc block (the very first /** … *\/ in the file),
 * splitting its summary text from `@tag` lines. The @stability convention
 * documented in F4 expects a single block at the top of each component file
 * — this lets us pick up `@stability Beta` whether it's directly above the
 * exported component or above the import block.
 */
function parseFileHeaderJsDoc(filePath: string): {
  summary: string;
  tags: Record<string, string>;
} {
  const source = readFileSync(filePath, "utf8");
  const match = source.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) return { summary: "", tags: {} };

  const lines = match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
    .filter((line, idx, arr) => !(idx === 0 && line === "") && !(idx === arr.length - 1 && line === ""));

  const summaryLines: string[] = [];
  const tags: Record<string, string> = {};
  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\s*(.*)$/);
    if (tagMatch) {
      tags[tagMatch[1]] = tagMatch[2].trim();
    } else if (Object.keys(tags).length === 0) {
      summaryLines.push(line);
    }
  }
  return {
    summary: summaryLines.join("\n").trim(),
    tags,
  };
}

function fileToSlug(file: string): string {
  // accordion.tsx → accordion
  // DataTable.tsx → data-table
  const stem = basename(file).replace(/\.(tsx|ts)$/, "");
  return stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

// Manual aliases for files whose name doesn't match the canonical primitive
// slug used by portfolio-data.ts. Keep this list small — anything that needs
// an alias is a candidate for renaming the source file or adopting a new
// canonical slug in PRIMITIVE_CARDS.
const SLUG_ALIASES: Record<string, string[]> = {
  // sonner.tsx ships the Toast / toast() API
  sonner: ["toast"],
};

// The `@stability` vocabulary is defined in
// standards/upgrade-process.md: Stable | Beta | Experimental | Deprecated.
// Tags are written Title Case at the source; the values stored here are
// lowercase, and the showcase's badge maps key off these lowercase forms.
//
// `planned` is deliberately NOT part of that vocabulary. It is a
// showcase-card status (see PORTFOLIO_SECTIONS / PRIMITIVE_CARDS in
// app/lib/portfolio-data.ts) for sections not yet built, and it shares this
// union only because both flow into the same badge component. No source file
// emits `@stability Planned` and no entry in primitives.json carries it — so
// do NOT "reconcile" this by adding Planned to the standard, and do not delete
// the branch below as dead code: the card union still needs the value.
function normaliseStability(raw: string | undefined): GeneratedPrimitive["stability"] {
  if (!raw) return "stable";
  const lower = raw.trim().toLowerCase();
  if (lower === "beta") return "beta";
  if (lower === "planned") return "planned";
  // `@stability Deprecated` is one of the four documented values (see
  // standards/upgrade-process.md). Without this bucket a deprecated
  // re-export fell through to "stable" and the showcase advertised it as
  // the supported import.
  if (lower === "deprecated") return "deprecated";
  // `@stability Experimental` — a primitive wrapping an `unstable_*` upstream
  // export whose API the vendor documents as subject to change
  // (docs/FRAMEWORK.md names PasswordToggleField as the case). Same failure
  // mode as `deprecated` above: without a bucket it falls through to "stable"
  // and the showcase advertises a volatile API as the supported one, which is
  // precisely what FRAMEWORK.md says not to do.
  if (lower === "experimental") return "experimental";
  return "stable";
}

function summariseProp(prop: PropItem): GeneratedProp {
  return {
    name: prop.name,
    type: prop.type?.name ?? "unknown",
    required: prop.required,
    defaultValue:
      prop.defaultValue && typeof prop.defaultValue === "object"
        ? String((prop.defaultValue as { value: unknown }).value ?? "")
        : null,
    description: prop.description ?? "",
  };
}

// `ImportCard` renders this value verbatim as the import line the showcase
// tells people to copy, so it has to name a subpath that actually resolves.
// The two layer folders are not optional here: `AppShell`, `PageHeader`,
// `ViewToggle` and `ViewSettings` are NOT re-exported from
// `packages/ui/src/index.ts`, so falling through to the package root would
// print a broken import for every one of them.
function deriveWebSubpath(filePath: string): string {
  const rel = relative(UI_SRC, filePath);
  if (rel.startsWith("components/data/")) return "@marktiderman/genesis-ui/data";
  if (rel.startsWith("components/patterns/"))
    return "@marktiderman/genesis-ui/patterns";
  if (rel.startsWith("components/layout/"))
    return "@marktiderman/genesis-ui/layout";
  if (rel.startsWith("hooks/")) return "@marktiderman/genesis-ui/hooks";
  if (rel.startsWith("provider/")) return "@marktiderman/genesis-ui/provider";
  return "@marktiderman/genesis-ui";
}

function deriveNativeSubpath(filePath: string): string {
  const rel = relative(UI_NATIVE_SRC, filePath);
  if (rel.startsWith("data/")) return "@marktiderman/genesis-ui-native/data";
  return "@marktiderman/genesis-ui-native";
}

function pickPrimaryComponent(components: ComponentDoc[]): ComponentDoc {
  // Heuristic: prefer the component whose name matches the file basename
  // (Card / Button / DataTable). Falls back to the first declared component.
  const stem = basename(components[0].filePath).replace(/\.(tsx|ts)$/, "");
  const match = components.find(
    (c) => c.displayName.toLowerCase() === stem.toLowerCase() ||
      c.displayName.toLowerCase() === `native${stem}`.toLowerCase()
  );
  return match ?? components[0];
}

function processFiles(
  files: string[],
  surface: "web" | "native",
  packageRoot: string
): GeneratedPrimitive[] {
  const tsConfigPath = join(packageRoot, "tsconfig.json");
  const parser = withCustomConfig(tsConfigPath, {
    savePropValueAsString: true,
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    propFilter: (prop) => {
      // Skip props inherited from the DOM/React types so the table stays
      // focused on component-authored API. The component's own Props
      // interface still gets picked up because react-docgen-typescript
      // tracks the declared parent.
      if (prop.parent) {
        const parentName = prop.parent.fileName;
        if (parentName.includes("node_modules")) return false;
      }
      return true;
    },
  });

  const out: GeneratedPrimitive[] = [];

  for (const file of files) {
    let docs: ComponentDoc[];
    try {
      docs = parser.parse(file);
    } catch (err) {
      console.warn(`  warn: failed to parse ${relative(REPO_ROOT, file)}: ${(err as Error).message}`);
      continue;
    }

    if (docs.length === 0) continue;

    const repoRel = relative(REPO_ROOT, file);
    const subpath =
      surface === "web" ? deriveWebSubpath(file) : deriveNativeSubpath(file);

    const primary = pickPrimaryComponent(docs);
    const fileHeader = parseFileHeaderJsDoc(file);
    const stabilityFromComponents = docs
      .map((d) => (d.tags as Record<string, string> | undefined)?.stability)
      .find((value): value is string => Boolean(value));
    // The FILE header wins over any component tag react-docgen found.
    // A file that is nothing but a re-export (the deprecated
    // `@marktiderman/genesis-ui/data` EmptyState alias) has no declaration of
    // its own to tag, so its header is the only place it can state its
    // stability — and react-docgen resolves the re-export and reports the
    // TARGET component's tag, which is about the target, not the alias.
    // Reading components first therefore relabelled the deprecated alias with
    // the canonical component's `Beta`, erasing the only migration signal
    // consumers get from the showcase.
    const stability = normaliseStability(
      fileHeader.tags.stability ?? stabilityFromComponents
    );
    const summary = primary.description?.trim() || fileHeader.summary;

    const components: GeneratedComponent[] = docs.map((doc) => ({
      name: doc.displayName,
      summary: doc.description ?? "",
      props: Object.values(doc.props ?? {})
        .map(summariseProp)
        .sort((a, b) => {
          if (a.required !== b.required) return a.required ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    }));

    const slug = fileToSlug(file);
    out.push({
      slug,
      aliases: SLUG_ALIASES[slug] ?? [],
      surface,
      subpath,
      filePath: repoRel,
      stability,
      summary,
      primaryComponent: primary.displayName,
      components,
    });
  }

  return out;
}

function build(): GeneratorOutput {
  console.log("→ scanning packages/ui/src");
  const webFiles = findComponentFiles(UI_SRC);
  const webPrimitives = processFiles(webFiles, "web", resolve(REPO_ROOT, "packages", "ui"));

  console.log("→ scanning packages/ui-native/src");
  const nativeFiles = findComponentFiles(UI_NATIVE_SRC);
  const nativePrimitives = processFiles(
    nativeFiles,
    "native",
    resolve(REPO_ROOT, "packages", "ui-native")
  );

  const sorted = [...webPrimitives, ...nativePrimitives].sort((a, b) => {
    if (a.surface !== b.surface) return a.surface.localeCompare(b.surface);
    return a.slug.localeCompare(b.slug);
  });

  return {
    generatedAt: new Date().toISOString().slice(0, 10), // date only — keeps diffs deterministic
    surfaces: {
      web: {
        package: "@marktiderman/genesis-ui",
        subpaths: ["@marktiderman/genesis-ui", "@marktiderman/genesis-ui/data"],
        count: webPrimitives.length,
      },
      native: {
        package: "@marktiderman/genesis-ui-native",
        subpaths: ["@marktiderman/genesis-ui-native", "@marktiderman/genesis-ui-native/data"],
        count: nativePrimitives.length,
      },
    },
    primitives: sorted,
  };
}

function main() {
  const checkMode = process.argv.includes("--check");

  console.log("Generating primitive docs from TS source…");
  const output = build();
  const serialised = JSON.stringify(output, null, 2) + "\n";

  if (checkMode) {
    const existing = (() => {
      try {
        return readFileSync(OUTPUT_PATH, "utf8");
      } catch {
        return "";
      }
    })();
    // `generatedAt` is a volatile date stamp — ignore it when diffing so the
    // check verifies content drift only. Comparing it literally made the check
    // fail every day after the file was last committed (today's date !== the
    // committed date), regardless of whether any primitive actually changed.
    const ignoreGeneratedAt = (s: string) =>
      s.replace(/("generatedAt":\s*)"[^"]*"/, '$1"<ignored>"');
    if (ignoreGeneratedAt(existing) !== ignoreGeneratedAt(serialised)) {
      console.error("\n✖ apps/sample/app/data/primitives.json is out of date.");
      console.error("  Run `pnpm --filter sample docs:generate` and commit the result.");
      try {
        execSync(`git --no-pager diff -- ${OUTPUT_PATH}`, { stdio: "inherit" });
      } catch {
        /* git not available — already-printed message is enough */
      }
      process.exit(1);
    }
    console.log("✓ primitives.json is up to date");
    return;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialised, "utf8");
  const totalComponents = output.primitives.reduce((acc, p) => acc + p.components.length, 0);
  console.log(
    `✓ wrote ${relative(REPO_ROOT, OUTPUT_PATH)} — ${output.primitives.length} primitives ` +
      `(${totalComponents} components: web ${output.surfaces.web.count} files, ` +
      `native ${output.surfaces.native.count} files)`
  );
}

main();
