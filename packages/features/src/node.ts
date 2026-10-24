import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BrokenBlockError,
  MARKETING_BLOCK_END,
  MARKETING_BLOCK_START,
  readAgentsBlock,
  readBlock,
  replaceAgentsBlock,
  replaceBlock,
  toAgentsMarkdown,
  toJson,
  toMarketingMarkdown,
  toOpenFeatureManifest,
  toSkillMarkdown,
} from "./generate";
import { expiredFlags, type Features, type Flags } from "./model";

/**
 * Where a repo keeps its registry's outputs and what `check` scans. Every
 * path is relative to `root`; `false` turns an output or a scan off. The CLI
 * reads these from genesis.config.json → `features` (or package.json → `"genesisFeatures"`), and its options win.
 *
 * @stability Beta
 */
export interface FeatureProjectOptions {
  /** The repository root. */
  root: string;
  features: Features;
  flags?: Flags;
  /** The registry file, named in generated output. Default `src/features.ts`. */
  source?: string;
  /** How people run the CLI here, named in generated output. Default `genesis features`. */
  command?: string;
  /** The AGENTS.md that holds the pointer block. Default `AGENTS.md`. */
  agents?: string | false;
  /** The CLAUDE.md that must import AGENTS.md (`@AGENTS.md`). Default `CLAUDE.md`. */
  claude?: string | false;
  /** The JSON copy, which is also the record of every id ever used. Default `features.json`. */
  json?: string | false;
  /** The OpenFeature flag manifest, written when there are flags. Default `flags.json`. */
  openfeature?: string | false;
  /** The agent skill. Default `.claude/skills/features/SKILL.md`. */
  skill?: string | false;
  /** A file to keep the marketing block in (e.g. README.md). Default none. */
  marketing?: string | false;
  /** The marketing block's heading. Default `Features`. */
  marketingHeading?: string;
  /**
   * How code reads a flag: a function name (`useFlag`, read as its first
   * argument) or a JSX attribute (`<Flag name>`). Default `useFlag`, `getFlag`
   * and `<Flag name>`.
   */
  flagAccessors?: readonly string[];
  /** Code scanned for flag reads. Default `src`, `app` and `packages/*\/src`. */
  scan?: readonly string[] | false;
  /**
   * Files the flag scan skips: the flags runtime that defines the accessors and
   * reads by variable, and tests, which build keys on purpose. Default the test
   * globs (`tests`).
   */
  scanIgnore?: readonly string[];
  /** Test files scanned for `@feat:<id>` tags. */
  tests?: readonly string[] | false;
  /** The changesets folder, scanned for `Features: <id>` lines. Default `.changeset`. */
  changesets?: string | false;
  /** The PR's labels, checked for `feature:<id>`. */
  labels?: readonly string[];
  /** Route and server-function files every one of which some `links.code` should cover. */
  coverage?: readonly string[] | false;
  coverageIgnore?: readonly string[];
  /** Warn when `reviewedAt` is older than this many days. Default 90. */
  reviewDays?: number;
  /** `YYYY-MM-DD`. Default today (UTC). */
  today?: string;
  /**
   * Shipped work gathered elsewhere (the CLI's `--prs` reads it with `gh`).
   * A planned feature with any of it gets a warning, as do changesets that
   * name it.
   */
  evidence?: FeatureEvidence;
}

/** A merged PR labelled `feature:<id>`. @stability Beta */
export interface FeaturePrEvidence {
  number: number;
  title: string;
}

/** @stability Beta */
export interface FeatureEvidence {
  /** Merged PRs by the feature id (or alias) on their `feature:<id>` label. */
  prs?: Record<string, readonly FeaturePrEvidence[]>;
}

/** A feature still marked planned that already has shipped work tagged with it. @stability Beta */
export interface PlannedButShipped {
  id: string;
  /** Changeset files with a `Features: <id>` line. */
  changesets: string[];
  prs: FeaturePrEvidence[];
}

/** @stability Beta */
export interface FeatureCheckResult {
  ok: boolean;
  /** Hard failures: stale generated output, missing code paths, flag rules, removed ids, bad tags, no `@AGENTS.md`. */
  errors: string[];
  /** Everything else: reviews due, untested live features, uncovered routes, missing docs. */
  warnings: string[];
  /** Generated files that differ from what the generator makes now. */
  stale: string[];
  expiredFlags: string[];
  /** Building features with someone on them: `[id, claimedBy]`. */
  claims: [string, string][];
  /** Planned features with shipped work; each is also a warning. */
  plannedButShipped: PlannedButShipped[];
}

const CODE = "{ts,tsx,js,jsx,mjs,cjs}";
const DEFAULT_SCAN = [`src/**/*.${CODE}`, `app/**/*.${CODE}`, `packages/*/src/**/*.${CODE}`];
const DEFAULT_TESTS = [`**/*.{test,spec}.${CODE}`, "**/__tests__/**/*", "supabase/tests/**/*.sql"];
const DEFAULT_COVERAGE = [`src/routes/**/*.${CODE}`, `app/routes/**/*.${CODE}`, "**/*.functions.ts"];
const DEFAULT_COVERAGE_IGNORE = ["**/routeTree.gen.ts", "**/__root.tsx", "**/*.d.ts"];
const DEFAULT_ACCESSORS = ["useFlag", "getFlag", "<Flag name>"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", "out", "storybook-static"]);

/** A file's text with CRLF line endings read as LF, so a Windows checkout isn't "stale" forever. */
function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
}

/** A glob (`*`, `**`, `?`, `{a,b}`) as a RegExp over `/`-separated relative paths. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "{") {
      const close = glob.indexOf("}", i);
      out += `(?:${glob.slice(i + 1, close).split(",").map((s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
      i = close;
    } else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** Every file under `root`, skipping dot-folders, node_modules and build output. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile()) out.push(path);
    }
  };
  walk("");
  return out;
}

function matcher(globs: readonly string[]) {
  const res = globs.map(globToRegExp);
  return (path: string) => res.some((re) => re.test(path));
}

/** A position in a file, as `path:line`. */
const at = (path: string, text: string, index: number) => `${path}:${text.slice(0, index).split("\n").length}`;

/** The string literal starting at `text[i]`, or null when the expression there isn't one. */
function literalAt(text: string, i: number): string | null {
  const quote = text[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  const end = text.indexOf(quote, i + 1);
  if (end === -1) return null;
  const value = text.slice(i + 1, end);
  if (quote === "`" && value.includes("${")) return null;
  return value;
}

/**
 * `text` with its comments blanked to spaces (newlines kept), so a flag named
 * in a comment isn't read as a flag read and line numbers stay right. Strings,
 * regex literals and template text are left alone; a template's `${…}` is code.
 * With `strings`, string and template-text contents are blanked too (quotes
 * stay), so prose in a string ("…the release flag (off)") can't look like a call.
 */
export function blankComments(text: string, strings = false): string {
  return blankFrom(text, 0, false, strings).out;
}

// Characters after which a `/` starts a regex literal rather than a division.
const BEFORE_REGEX = new Set("(,=:[!&|?{};+-*%<>~^");
const REGEX_KEYWORDS = /(?:^|[^\w$.])(?:return|typeof|instanceof|in|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * Blanks comments from `i`, keeping strings, regex literals and template text.
 * With `inTemplate`, stops at the `}` that closes a template's `${`, so
 * interpolations are scanned as code.
 */
function blankFrom(text: string, i: number, inTemplate: boolean, strings = false): { out: string; end: number } {
  const keep = (chunk: string) => (strings ? chunk.replace(/[^\n]/g, " ") : chunk);
  let out = "";
  let depth = 0;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (inTemplate && c === "}" && depth === 0) return { out, end: i };
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === "/" && next !== ">" && startsRegex(out)) {
      // A regex literal: `/[/*]/` holds no comment. Classes may contain `/`.
      let j = i + 1;
      let inClass = false;
      while (j < text.length && text[j] !== "\n") {
        const r = text[j]!;
        if (r === "\\") j += 2;
        else {
          if (r === "[") inClass = true;
          else if (r === "]") inClass = false;
          else if (r === "/" && !inClass) break;
          j++;
        }
      }
      if (text[j] !== "/") {
        // No closing `/` on the line: a division after all.
        out += c;
        i++;
        continue;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "`") {
      // Template text is kept; each `${…}` is scanned as code.
      out += c;
      let j = i + 1;
      while (j < text.length && text[j] !== "`") {
        if (text[j] === "\\") {
          out += keep(text.slice(j, j + 2));
          j += 2;
        } else if (text[j] === "$" && text[j + 1] === "{") {
          out += "${";
          const inner = blankFrom(text, j + 2, true, strings);
          out += inner.out;
          j = inner.end;
          if (j < text.length) out += text[j]!;
          j++;
        } else {
          out += keep(text[j]!);
          j++;
        }
      }
      if (j < text.length) out += "`";
      i = j + 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      if (text[j] === c) {
        out += c + keep(text.slice(i + 1, j)) + c;
        i = j + 1;
      } else {
        // No closing quote on this line: JSX text ("Don't"), not a string.
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return { out, end: i };
}

function startsRegex(before: string): boolean {
  const trimmed = before.replace(/\s+$/, "");
  if (trimmed === "") return true;
  // `</p>` closes a JSX tag; a regex right after `<` is vanishingly rare.
  if (before.endsWith("<")) return false;
  return BEFORE_REGEX.has(trimmed[trimmed.length - 1]!) || REGEX_KEYWORDS.test(trimmed);
}

/**
 * Flag reads in `text`: each key read through an accessor with a literal, and
 * each read whose key isn't a literal (`dynamic`), as `path:line`. Comments
 * don't count.
 */
export function scanFlagReads(path: string, source: string, accessors: readonly string[] = DEFAULT_ACCESSORS) {
  const text = blankComments(source);
  // Matches run on code with string contents blanked; literal keys are read from `text`.
  const code = blankComments(source, true);
  const keys: { key: string; where: string }[] = [];
  const dynamic: string[] = [];
  for (const accessor of accessors) {
    const jsx = /^<(\w[\w.]*)\s+(\w+)>$/.exec(accessor);
    if (jsx) {
      const re = new RegExp(`<${jsx[1]!.replace(/\./g, "\\.")}\\b[^>]*?\\b${jsx[2]}\\s*=\\s*`, "g");
      for (const m of code.matchAll(re)) {
        let i = m.index! + m[0].length;
        if (text[i] === "{") i = text.slice(i + 1).search(/\S/) + i + 1;
        const key = literalAt(text, i);
        if (key === null) dynamic.push(at(path, text, m.index!));
        else keys.push({ key, where: at(path, text, m.index!) });
      }
      continue;
    }
    const re = new RegExp(`(?<![\\w$.])(function\\s+)?${accessor.replace(/\$/g, "\\$")}\\s*(?:<[^>()]*>)?\\s*\\(\\s*`, "g");
    for (const m of code.matchAll(re)) {
      if (m[1]) continue; // its own definition
      const i = m.index! + m[0].length;
      if (text[i] === ")") continue;
      const key = literalAt(text, i);
      if (key !== null) keys.push({ key, where: at(path, text, m.index!) });
      // `useFlag(key: K)` in a type or a signature declares the accessor; it doesn't read a flag.
      else if (!/^[\w$]+\??\s*:/.test(text.slice(i))) dynamic.push(at(path, text, m.index!));
    }
  }
  return { keys, dynamic };
}

const ids = (features: Features) => new Set(Object.entries(features).flatMap(([id, f]) => [id, ...(f.aliases ?? [])]));

/** Ids recorded in the committed JSON that the registry no longer has, as an id or an alias. */
function removedIds(options: FeatureProjectOptions): string[] {
  const json = options.json === undefined ? "features.json" : options.json;
  if (!json) return [];
  const doc = read(join(options.root, json));
  if (!doc) return [];
  let previous: string[];
  try {
    previous = (JSON.parse(doc) as { features?: { id: string; aliases?: string[] }[] }).features?.flatMap((f) => [f.id, ...(f.aliases ?? [])]) ?? [];
  } catch {
    return [];
  }
  const now = ids(options.features);
  return previous.filter((id) => !now.has(id));
}

/** Each id and alias, mapped to its feature's id. */
const canonical = (features: Features) =>
  new Map(Object.entries(features).flatMap(([id, f]) => [id, ...(f.aliases ?? [])].map((name) => [name, id] as const)));

/** "a", "a and b", "a, b and c". */
const and = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const removedMessage = (id: string) =>
  `the feature id "${id}" was removed. Ids are permanent: keep the entry with status "retired", or list "${id}" in the new entry's aliases`;

/** Every generated file: its path, and its content given what's on disk now. */
function outputs(options: FeatureProjectOptions): { path: string; next: (current: string | null) => string; same: (current: string | null, next: string) => boolean }[] {
  const { features, flags, source, command } = options;
  const agents = options.agents === undefined ? "AGENTS.md" : options.agents;
  const json = options.json === undefined ? "features.json" : options.json;
  const openfeature = options.openfeature === undefined ? "flags.json" : options.openfeature;
  const skill = options.skill === undefined ? ".claude/skills/features/SKILL.md" : options.skill;
  const whole = (content: string) => ({ next: () => content, same: (current: string | null, next: string) => current === next });
  const list = [];
  if (agents) {
    const block = toAgentsMarkdown(features, flags, { source, command, skill });
    list.push({
      path: agents,
      next: (current: string | null) => replaceAgentsBlock(current ?? "", block),
      same: (current: string | null) => current !== null && readAgentsBlock(current) === block,
    });
  }
  if (json) list.push({ path: json, ...whole(toJson(features, flags, { source })) });
  if (openfeature && flags && Object.keys(flags).length) list.push({ path: openfeature, ...whole(toOpenFeatureManifest(flags, features)) });
  const writesFlags = Boolean(openfeature && flags && Object.keys(flags).length);
  const generated = [
    ...(agents ? [`the ${agents} block`] : []),
    ...(json ? [`\`${json}\``] : []),
    ...(writesFlags ? [`\`${openfeature}\` (the OpenFeature flag manifest)`] : []),
    ...(options.marketing ? [`the ${options.marketing} Features section`] : []),
    ...(skill ? ["this skill"] : []),
  ];
  if (skill) list.push({ path: skill, ...whole(toSkillMarkdown({ source, command, outputs: generated })) });
  if (options.marketing) {
    const block = toMarketingMarkdown(features, { heading: options.marketingHeading, source });
    list.push({
      path: options.marketing,
      next: (current: string | null) => replaceBlock(current ?? "", block, MARKETING_BLOCK_START, MARKETING_BLOCK_END),
      same: (current: string | null) => current !== null && readBlock(current, MARKETING_BLOCK_START, MARKETING_BLOCK_END) === block,
    });
  }
  return list;
}

function claudeImport(options: FeatureProjectOptions): { path: string; line: string } | null {
  const agents = options.agents === undefined ? "AGENTS.md" : options.agents;
  const claude = options.claude === undefined ? "CLAUDE.md" : options.claude;
  return agents && claude ? { path: claude, line: `@${agents}` } : null;
}

const hasImport = (doc: string | null, line: string) =>
  doc !== null && new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(doc);

/**
 * Writes every generated output (the AGENTS.md block, the JSON, the flag
 * manifest, the skill, the marketing block) and adds `@AGENTS.md` to
 * CLAUDE.md when it's missing. Refuses, writing nothing, when an id recorded
 * in the JSON has disappeared. Returns the paths it changed.
 *
 * @stability Beta
 */
export function buildFeatureOutputs(options: FeatureProjectOptions): string[] {
  const removed = removedIds(options);
  if (removed.length) throw new Error(removed.map(removedMessage).join("\n"));
  const changed: string[] = [];
  const write = (rel: string, next: string) => {
    const file = join(options.root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, next);
    changed.push(rel);
  };
  for (const output of outputs(options)) {
    const current = read(join(options.root, output.path));
    let next: string;
    try {
      next = output.next(current);
    } catch (error) {
      if (error instanceof BrokenBlockError) throw new Error(`${output.path}: ${error.message}`);
      throw error;
    }
    if (!output.same(current, next)) write(output.path, next);
  }
  const claude = claudeImport(options);
  if (claude) {
    const current = read(join(options.root, claude.path));
    if (!hasImport(current, claude.line)) {
      const base = current === null || current === "" ? "" : current.endsWith("\n") ? `${current}\n` : `${current}\n\n`;
      write(claude.path, `${base}${claude.line}\n`);
    }
  }
  return changed;
}

/**
 * Checks the registry against the repo. Errors (exit 1): generated output that
 * is stale, `links.code` paths that don't exist, the flag rules (a permission
 * flag, an expired flag, a dynamic key, a key read but not defined or defined
 * but never read, a missing runbook), an id that disappeared, an unknown id in
 * a test, changeset or PR tag, and a CLAUDE.md without `@AGENTS.md`.
 * Warnings: reviews due, live features without tagged tests, planned features
 * with shipped work (changesets, and `evidence.prs`), route and
 * server-function files no feature covers, missing docs.
 *
 * It only ever compares generated output with the generator, never two
 * hand-written files.
 *
 * @stability Beta
 */
export function checkFeatureOutputs(options: FeatureProjectOptions): FeatureCheckResult {
  const { root, features, flags } = options;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  const warnings: string[] = [];
  const stale: string[] = [];
  const known = ids(features);

  for (const output of outputs(options)) {
    const current = read(join(root, output.path));
    let same: boolean;
    try {
      same = output.same(current, output.next(current));
    } catch (error) {
      if (!(error instanceof BrokenBlockError)) throw error;
      errors.push(`${output.path}: ${error.message}`);
      continue;
    }
    if (!same) {
      stale.push(output.path);
      errors.push(`${output.path} is stale. Run \`${options.command ?? "genesis features"} build\` and commit the result.`);
    }
  }
  const claude = claudeImport(options);
  if (claude && !hasImport(read(join(root, claude.path)), claude.line)) {
    errors.push(`${claude.path} must import the agent notes with a line \`${claude.line}\` (\`build\` adds it).`);
  }
  for (const id of removedIds(options)) errors.push(removedMessage(id));

  const reviewCutoff = new Date(Date.parse(today) - (options.reviewDays ?? 90) * 86_400_000).toISOString().slice(0, 10);
  const claims: [string, string][] = [];
  for (const [id, def] of Object.entries(features)) {
    for (const path of def.links?.code ?? []) {
      if (!existsSync(join(root, path))) errors.push(`${id}.links.code: ${path} doesn't exist`);
    }
    for (const path of def.links?.docs ?? []) {
      if (!/^https?:\/\//.test(path) && !existsSync(join(root, path))) warnings.push(`${id}.links.docs: ${path} doesn't exist`);
    }
    if (def.claimedBy) claims.push([id, def.claimedBy]);
    if (def.status !== "planned" && def.status !== "retired") {
      if (!def.reviewedAt) warnings.push(`${id}: never reviewed (set reviewedAt)`);
      else if (def.reviewedAt < reviewCutoff) warnings.push(`${id}: last reviewed ${def.reviewedAt}, over ${options.reviewDays ?? 90} days ago`);
    }
  }

  const files = listFiles(root);
  const expired = expiredFlags(flags, today);
  if (flags) {
    for (const [name, flag] of Object.entries(flags)) {
      if (flag.kind === "permission") errors.push(`${name}: a permission flag. Paid or role access belongs in the feature's \`access\` (entitlements), not a flag`);
      if (flag.runbook && !/^https?:\/\//.test(flag.runbook) && !existsSync(join(root, flag.runbook))) {
        errors.push(`${name}.runbook: ${flag.runbook} doesn't exist`);
      }
    }
    for (const name of expired) errors.push(`${name} expired on ${flags[name]!.expires}: remove its code path, then the flag`);
    if (options.scan !== false) {
      const inScan = matcher(options.scan ?? DEFAULT_SCAN);
      const skipped = matcher(options.scanIgnore ?? (options.tests || DEFAULT_TESTS));
      const used = new Map<string, string>();
      for (const path of files.filter((p) => inScan(p) && !skipped(p) && !p.endsWith(".d.ts"))) {
        const { keys, dynamic } = scanFlagReads(path, readFileSync(join(root, path), "utf8"), options.flagAccessors ?? DEFAULT_ACCESSORS);
        for (const where of dynamic) errors.push(`${where}: a flag read with a computed key. Use a literal key, so the read can be checked`);
        for (const { key, where } of keys) {
          if (!Object.hasOwn(flags, key)) errors.push(`${where}: the flag "${key}" is read but not defined`);
          if (!used.has(key)) used.set(key, where);
        }
      }
      for (const name of Object.keys(flags)) {
        if (!used.has(name)) errors.push(`${name}: defined but never read. Remove it, or read it through the flag accessor`);
      }
    }
  }

  const tagged = new Set<string>();
  if (options.tests !== false) {
    const inTests = matcher(options.tests ?? DEFAULT_TESTS);
    for (const path of files.filter(inTests)) {
      const text = readFileSync(join(root, path), "utf8");
      for (const m of text.matchAll(/@feat:([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*)/g)) {
        if (!known.has(m[1]!)) errors.push(`${at(path, text, m.index!)}: @feat:${m[1]} is not a feature`);
        else tagged.add(m[1]!);
      }
    }
    for (const [id, def] of Object.entries(features)) {
      const names = [id, ...(def.aliases ?? [])];
      if (def.status === "live" && !names.some((n) => tagged.has(n))) warnings.push(`${id}: live, but no test is tagged @feat:${id}`);
    }
  }

  const idOf = canonical(features);
  const shippedIn = new Map<string, { changesets: string[]; prs: FeaturePrEvidence[] }>();
  const shipped = (name: string) => {
    const id = idOf.get(name)!;
    if (!shippedIn.has(id)) shippedIn.set(id, { changesets: [], prs: [] });
    return shippedIn.get(id)!;
  };
  const changesets = options.changesets === undefined ? ".changeset" : options.changesets;
  if (changesets) {
    for (const path of listChangesets(root, changesets)) {
      // The body only, so frontmatter never counts; CRLF read as LF.
      const text = read(join(root, path))!.replace(/^---\n[\s\S]*?\n---\n/, "");
      for (const m of text.matchAll(/^features:[ \t]*\[?([^\]\n]*)\]?[ \t]*$/gim)) {
        for (const id of m[1]!.split(/[\s,]+/).filter(Boolean)) {
          if (!known.has(id)) errors.push(`${path}: Features: ${id} is not a feature`);
          else if (!shipped(id).changesets.includes(path)) shipped(id).changesets.push(path);
        }
      }
    }
  }
  for (const [name, prs] of Object.entries(options.evidence?.prs ?? {})) {
    if (!known.has(name)) continue;
    const list = shipped(name).prs;
    for (const pr of prs) if (!list.some((p) => p.number === pr.number)) list.push(pr);
  }
  const plannedButShipped: PlannedButShipped[] = [];
  for (const [id, def] of Object.entries(features)) {
    const found = shippedIn.get(id);
    if (def.status !== "planned" || !found || (!found.changesets.length && !found.prs.length)) continue;
    const prs = [...found.prs].sort((a, b) => a.number - b.number);
    plannedButShipped.push({ id, changesets: found.changesets, prs });
    warnings.push(`${id} is still planned, but ${and([...found.changesets, ...prs.map((p) => `PR #${p.number}`)])} shipped work for it`);
  }
  for (const label of options.labels ?? []) {
    const id = /^feature:(.+)$/.exec(label.trim())?.[1];
    if (id && !known.has(id)) errors.push(`PR label ${label}: ${id} is not a feature`);
  }

  if (options.coverage !== false) {
    const inCoverage = matcher(options.coverage ?? DEFAULT_COVERAGE);
    const ignored = matcher(options.coverageIgnore ?? DEFAULT_COVERAGE_IGNORE);
    const covered = Object.values(features).flatMap((f) => f.links?.code ?? []).map((p) => p.replace(/\/+$/, ""));
    for (const path of files.filter((p) => inCoverage(p) && !ignored(p))) {
      if (!covered.some((c) => path === c || path.startsWith(`${c}/`))) warnings.push(`${path}: no feature's links.code covers it`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, stale, expiredFlags: expired, claims, plannedButShipped };
}

function listChangesets(root: string, dir: string): string[] {
  try {
    return readdirSync(join(root, dir))
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
      .map((f) => `${dir}/${f}`);
  } catch {
    return [];
  }
}

/**
 * A few lines for a session's start: counts, stale output, expired flags,
 * planned features with shipped work and open claims. Meant for a SessionStart hook (`genesis features check --summary`).
 *
 * @stability Beta
 */
export function summarizeCheck(result: FeatureCheckResult, features: Features): string {
  const total = Object.keys(features).length;
  const lines = [
    `Features: ${total} in the registry; ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}, ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}.`,
  ];
  if (result.stale.length) lines.push(`- Stale generated files: ${result.stale.join(", ")}. Run the features build.`);
  if (result.expiredFlags.length) lines.push(`- Expired flags: ${result.expiredFlags.join(", ")}. Remove the code path, then the flag.`);
  if (result.plannedButShipped.length) {
    const n = result.plannedButShipped.length;
    lines.push(`- ${n} planned feature${n === 1 ? " has" : "s have"} shipped work: ${result.plannedButShipped.map((s) => s.id).join(", ")}. Move ${n === 1 ? "its" : "their"} status on.`);
  }
  if (result.claims.length) lines.push(`- Being built: ${result.claims.map(([id, by]) => `${id} (${by})`).join(", ")}.`);
  const other = result.errors.length - result.stale.length - result.expiredFlags.length;
  if (other > 0) lines.push(`- ${other} other error${other === 1 ? "" : "s"}: run the features check for details.`);
  return lines.join("\n");
}
