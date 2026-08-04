/**
 * Genesis init scaffolder — pure-function core.
 *
 * `runScaffolder()` takes a plan (consumer name, target dir, options) +
 * a filesystem implementation, and writes the files needed to bootstrap
 * a new Genesis-based app:
 *
 *   - `packages/<consumer>-brand/src/brand.ts`   (canonical schema seed)
 *   - `packages/<consumer>-brand/package.json`
 *   - `tailwind.config.ts`                       (genesis preset import)
 *   - `app/global.css`                            (genesis tokens import)
 *   - `.genesis/cli.yml`                          (design-system rules + version pin)
 *   - `CLAUDE.md`                                 (cross-link + workflow)
 *
 * Idempotent: existing files are NOT overwritten. The scaffolder reads
 * each target path first; if present, it appends a `.genesis-next` sibling
 * with the would-be content + emits a warning so the caller can diff. This
 * keeps the operation safe to re-run after upstream Genesis updates.
 *
 * The CLI wraps this with a real `node:fs` impl + commander argument
 * parsing; the test harness wraps it with an in-memory map for fast,
 * deterministic tests.
 *
 * @stability Beta
 */

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdirp(dir: string): Promise<void>;
}

export interface ScaffoldOptions {
  /** Slug used for `<consumer>-brand` package + tokens namespace. */
  consumerName: string;
  /** Target directory the scaffold writes into. Default `process.cwd()`. */
  targetDir: string;
  /** Pin Genesis package version. Default `"workspace:^"` if monorepo, else `"^1.0.0"`. */
  genesisVersion?: string;
  /** When true, even idempotent skips emit a write at `.genesis-next` for diffing. */
  emitConflicts?: boolean;
  /**
   * Logger. Defaults to a no-op when running in tests; CLI passes
   * `console.log` etc.
   */
  logger?: ScaffoldLogger;
}

export interface ScaffoldLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface ScaffoldResult {
  /** Paths the scaffolder wrote. */
  written: string[];
  /** Paths that already existed and were left alone (idempotent skip). */
  skipped: string[];
  /** Paths emitted as `.genesis-next` for consumer to diff. */
  conflicts: string[];
}

const VALID_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

const NOOP_LOGGER: ScaffoldLogger = {
  info() {},
  warn() {},
  error() {},
};

/**
 * Validate a consumer slug. Throws if invalid.
 *
 * Rules: lowercase alphanumeric + hyphens, 2-31 chars, must start with letter.
 * Matches the npm package-name subset that's also a safe directory name.
 */
export function validateConsumerName(name: string): void {
  if (!VALID_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid consumer name "${name}". Must be lowercase letters/digits/hyphens, ` +
        `2-31 chars, starting with a letter (e.g., "acme", "gamify-mobile").`,
    );
  }
}

/**
 * Compute which files the scaffolder would write for a given plan.
 * Pure function — no I/O. Tests use this directly.
 */
export function planScaffold(
  opts: Pick<ScaffoldOptions, "consumerName" | "genesisVersion">,
): { path: string; content: string }[] {
  const consumer = opts.consumerName;
  const genesisVersion = opts.genesisVersion ?? "workspace:^";
  return [
    {
      path: `packages/${consumer}-brand/package.json`,
      content: brandPackageJson(consumer, genesisVersion),
    },
    {
      path: `packages/${consumer}-brand/src/brand.ts`,
      content: brandSchema(consumer),
    },
    {
      path: `packages/${consumer}-brand/src/index.ts`,
      content: `export { brand } from "./brand";\nexport type { Brand } from "./brand";\n`,
    },
    {
      path: `packages/${consumer}-brand/tsconfig.json`,
      content: brandTsconfig(),
    },
    {
      path: `tailwind.config.ts`,
      content: tailwindConfig(consumer),
    },
    {
      path: `app/global.css`,
      content: globalCss(),
    },
    {
      path: `.genesis/cli.yml`,
      content: genesisConfig(consumer),
    },
    {
      path: `CLAUDE.md`,
      content: claudeMd(consumer),
    },
  ];
}

/**
 * Run the scaffolder against a FileSystem implementation. Returns a
 * record of what it did so the CLI / test harness can summarize.
 */
export async function runScaffold(
  opts: ScaffoldOptions,
  fs: FileSystem,
): Promise<ScaffoldResult> {
  validateConsumerName(opts.consumerName);
  const log = opts.logger ?? NOOP_LOGGER;

  const plan = planScaffold(opts);

  const written: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];

  for (const file of plan) {
    const fullPath = joinPath(opts.targetDir, file.path);
    const dir = dirname(fullPath);
    await fs.mkdirp(dir);

    const exists = await fs.exists(fullPath);
    if (!exists) {
      await fs.writeFile(fullPath, file.content);
      written.push(file.path);
      log.info(`✔ wrote ${file.path}`);
      continue;
    }

    // Idempotent skip — file exists. Optionally drop a `.genesis-next`
    // sibling so consumers can diff.
    const existing = await fs.readFile(fullPath);
    if (existing === file.content) {
      skipped.push(file.path);
      log.info(`= skipped ${file.path} (identical)`);
      continue;
    }

    if (opts.emitConflicts) {
      const nextPath = `${fullPath}.genesis-next`;
      await fs.writeFile(nextPath, file.content);
      conflicts.push(`${file.path}.genesis-next`);
      log.warn(
        `! diff ${file.path} — wrote .genesis-next sibling for review`,
      );
    } else {
      skipped.push(file.path);
      log.warn(
        `! skipped ${file.path} (exists; pass --emit-conflicts to diff)`,
      );
    }
  }

  return { written, skipped, conflicts };
}

// ---------------------------------------------------------------------------
// Path helpers — kept inline so the scaffolder has zero non-commander deps
// ---------------------------------------------------------------------------

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx);
}

// ---------------------------------------------------------------------------
// Templates — readable string builders, NOT freeze-dried .tpl files. This
// keeps the scaffolder a single .ts file and avoids __dirname juggling
// when we publish to npm.
// ---------------------------------------------------------------------------

function brandPackageJson(consumer: string, genesisVersion: string): string {
  return JSON.stringify(
    {
      name: `@${consumer}/brand`,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./src/index.ts",
      types: "./src/index.ts",
      description: `Brand tokens + extensions for the ${consumer} app. Consumed by Genesis primitives via canonical schema.`,
      peerDependencies: {
        "@marktiderman/genesis-design-system": genesisVersion,
      },
    },
    null,
    2,
  ) + "\n";
}

function brandTsconfig(): string {
  return JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        outDir: "dist",
        rootDir: "src",
      },
      include: ["src"],
    },
    null,
    2,
  ) + "\n";
}

function brandSchema(consumer: string): string {
  return `/**
 * @${consumer}/brand — canonical brand tokens + extensions.
 *
 * Genesis primitives consume tokens from this file via the design-system
 * provider. Edit colors/spacing/typography here to retheme every screen
 * at once. Domain-specific tokens (e.g., "mood" for Acme, "rarity" for
 * Gamify) go under \`extensions\` — Genesis primitives don't read these,
 * but consumer composites do via \`useGenesisExtension(key)\`.
 *
 * Schema is intentionally narrow at the top level. Add categories under
 * \`extensions\` rather than inventing new top-level slots.
 */

export interface BrandColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface BrandColors {
  primary: BrandColorScale;
  destructive: BrandColorScale;
  /** Neutral / gray scale used for surfaces, text, borders. */
  neutral: BrandColorScale;
}

export interface Brand {
  /** Slug used for namespacing (e.g., extensions key prefix). */
  name: string;
  colors: BrandColors;
  /**
   * Domain-specific token categories. Consumer composites read these
   * via \`useGenesisExtension("<key>")\`. Genesis primitives do NOT read
   * extensions — only canonical \`colors\`.
   */
  extensions?: Record<string, Record<string | number, unknown>>;
}

// ---------------------------------------------------------------------------
// Default brand — replace these placeholder values with your design's
// actual hex values. The canonical schema is the only contract; how you
// reach it is up to you (Figma export, hand-pick, generated from a base).
// ---------------------------------------------------------------------------

export const brand: Brand = {
  name: "${consumer}",
  colors: {
    primary: {
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8",
      800: "#1e40af",
      900: "#1e3a8a",
    },
    destructive: {
      50: "#fef2f2",
      100: "#fee2e2",
      200: "#fecaca",
      300: "#fca5a5",
      400: "#f87171",
      500: "#ef4444",
      600: "#dc2626",
      700: "#b91c1c",
      800: "#991b1b",
      900: "#7f1d1d",
    },
    neutral: {
      50: "#f9fafb",
      100: "#f3f4f6",
      200: "#e5e7eb",
      300: "#d1d5db",
      400: "#9ca3af",
      500: "#6b7280",
      600: "#4b5563",
      700: "#374151",
      800: "#1f2937",
      900: "#111827",
    },
  },
  // extensions: { mood: { ... }, rarity: { ... } },
};
`;
}

function tailwindConfig(consumer: string): string {
  return `import type { Config } from "tailwindcss";
import { brand } from "@${consumer}/brand";

/**
 * Tailwind config — wires Genesis canonical tokens to your brand values.
 *
 * Genesis ships a tailwind preset that maps semantic class names
 * (\`bg-primary\`, \`text-foreground\`, etc.) to CSS variables. This config
 * extends that preset with your consumer's hex values, so Genesis
 * primitives automatically pick up your brand once the global.css import
 * fires.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./node_modules/@marktiderman/genesis-ui-native/**/*.{js,ts,tsx}",
  ],
  presets: [require("@marktiderman/genesis-design-system/tailwind-preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: brand.colors.primary[600],
          ...brand.colors.primary,
        },
        destructive: {
          DEFAULT: brand.colors.destructive[600],
          ...brand.colors.destructive,
        },
      },
    },
  },
};

export default config;
`;
}

function globalCss(): string {
  return `/**
 * Genesis global stylesheet entry. Imports the canonical token sheet
 * + the consumer's tailwind layers. The token sheet wires CSS variables
 * (--color-primary, --color-foreground, etc.) used by every Genesis
 * primitive's tailwind classes.
 */
@import "@marktiderman/genesis-design-system/tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
`;
}

function genesisConfig(consumer: string): string {
  return `# Genesis DESIGN-SYSTEM consumer pin — read by the genesis CLI + .claude/hooks/*
# NOT the harness config: the schema-validated harness/root config lives at
# genesis.config.yml (see genesis.config.example.yml). This file only pins the
# @marktiderman/genesis-* version + design-system rules for this consumer.
#
# version pin: which @marktiderman/genesis-* major are we on. The genesis CLI
# uses this to validate that an upgrade hasn't drifted past breaking-change
# boundaries.
version: "1"
consumer: "${consumer}"

rules:
  # Block raw hex in consumer code — must use brand tokens.
  no-raw-hex: error
  # Block StyleSheet.create() in NativeWind-first projects.
  no-stylesheet-create: error
  # Block fork-and-modify of Genesis primitives.
  no-genesis-fork: error
  # Layouts must compose Genesis primitives, not rebuild them.
  prefer-genesis-layout: warn

# Path map — where consumer composites + brand live. Default values match
# the scaffolder's output; adjust if your layout differs.
paths:
  brand: "packages/${consumer}-brand"
  composites: "components"
  app: "app"
`;
}

function claudeMd(consumer: string): string {
  return `# CLAUDE.md — ${consumer}

This consumer was bootstrapped with \`@marktiderman/genesis-cli init ${consumer}\`.

## Workflow

- **Reuse before extend, extend before create.** See the Genesis usage
  doctrine: \`docs/prds/PRD-07-genesis-consumption-architecture/standards/usage-doctrine.md\`
- **Brand changes live in \`packages/${consumer}-brand\`.** Don't fork Genesis
  primitives — edit your brand schema instead (Layer 1).
- **Layout customization has 4 layers.** Default → named props →
  ScreenContainer → brand schema. Reach for the lowest layer first.

## Critical rules

- \`.genesis/cli.yml\` design-system rules are enforced via Claude Code hooks. Don't
  bypass with \`StyleSheet.create()\` or raw hex; use brand tokens.
- Run \`pnpm test\` before every commit.
- Open RFCs in the genesis repo for missing primitives — don't fork
  locally and forget.

## Quick reference

- \`packages/${consumer}-brand/src/brand.ts\` — your brand tokens + extensions
- \`tailwind.config.ts\` — Genesis preset + brand color overrides
- \`app/global.css\` — Genesis token sheet + tailwind layers
`;
}
