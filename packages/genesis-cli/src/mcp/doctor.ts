/**
 * The doctor side of `genesis mcp`: findings, what a rule means, the catalog, and which fix a
 * request names. Pure helpers over what the doctor and the fix registry already return.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../doctor/config.js";
import { BUILTIN_RULES } from "../doctor/rules.js";
import { preferRules } from "../doctor/package-rules.js";
import { primitivesCatalog } from "../doctor/primitives.js";
import type { DeclaringPackage, Finding } from "../doctor/types.js";
import type { Fix, FixPlan } from "../fix/types.js";
import { clip, MAX_FILE_CHARS, MAX_FINDINGS, MAX_PLAN_CHARS } from "./bounds.js";
import { sha256 } from "../fix/engine.js";

/** A request the tools refuse, with a message for the agent (an MCP InvalidParams error). */
export class ToolInputError extends Error {
  override name = "ToolInputError";
}

/** A finding as the tools show it: the message clipped. */
export function slimFinding(f: Finding) {
  return {
    rule: f.rule,
    level: f.level,
    file: f.file,
    ...(f.line ? { line: f.line } : {}),
    message: clip(f.message, 600),
    ...(f.subject ? { subject: clip(f.subject, 200) } : {}),
    ...(f.rules ? { rules: f.rules } : {}),
    ...(f.fix ? { fix: f.fix } : {}),
  };
}

/** The doctor's findings, filtered to `rules` and bounded. */
export function findingsReport(findings: readonly Finding[], rules?: readonly string[]) {
  const picked = rules?.length ? findings.filter((f) => rules.includes(f.rule) || f.rules?.some((r) => rules.includes(r))) : findings;
  const shown = picked.slice(0, MAX_FINDINGS);
  const byFix = new Map<string, number>();
  for (const f of picked) if (f.fix && f.fix.kind !== "manual") byFix.set(f.fix.id, (byFix.get(f.fix.id) ?? 0) + 1);
  return {
    total: picked.length,
    findings: shown.map(slimFinding),
    ...(picked.length > shown.length ? { truncated: `${picked.length - shown.length} more findings not listed; pass rules to narrow` } : {}),
    fixes: [...byFix].map(([id, count]) => ({ id, findings: count })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** The genesis-cli package folder (README.md beside package.json), from wherever this module runs (src/ in tests, dist/ when built). */
export function cliPackageDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name === "@marktiderman/genesis-cli") return dir;
      } catch {
        /* keep looking */
      }
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

let readmeRows: Map<string, string[]> | null = null;

/** The README's table rows keyed by their first cell's id (`| \`raw-tag\` | error | … |`): the rule docs the package ships. */
function ruleRows(): Map<string, string[]> {
  if (readmeRows) return readmeRows;
  readmeRows = new Map();
  const dir = cliPackageDir();
  const file = dir ? path.join(dir, "README.md") : null;
  if (!file || !existsSync(file)) return readmeRows;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!m || readmeRows.has(m[1]!)) continue;
    readmeRows.set(m[1]!, m[2]!.split(" | ").map((c) => c.trim()));
  }
  return readmeRows;
}

/** What a rule checks, where it comes from, and the fixes that cover it. */
export function explainRule(rule: string, ctx: { root: string; configPath?: string; packages: readonly DeclaringPackage[]; fixes: readonly Fix[] }) {
  const fixes = ctx.fixes.filter((f) => f.rules.includes(rule)).map((f) => ({ id: f.id, kind: f.kind, title: f.title, ...(f.kind === "manual" ? {} : { command: `genesis fix ${f.id}` }), ...(f.step ? { step: f.step } : {}) }));
  const fixPart = { fixes: fixes.length ? fixes : [{ id: `manual:${rule}`, kind: "manual", title: "follow the finding's message" }] };
  const prefer = preferRules(ctx.packages).find((r) => r.ruleId === rule);
  if (prefer) {
    return {
      rule,
      source: "package",
      package: prefer.package,
      level: prefer.level ?? "warn",
      why: clip(prefer.why),
      use: clip(prefer.use),
      ...(prefer.import ? { import: prefer.import } : {}),
      ...(prefer.docs ? { docs: prefer.docs } : {}),
      ...(prefer.files ? { files: prefer.files } : {}),
      flags: prefer.forbid,
      ...(prefer.extensible ? { extensible: prefer.extensible } : {}),
      ...fixPart,
    };
  }
  // Rule ids are lower-case words, dashes and a namespace slash: an option (`--strict`) or a fix id (`migrate.copy`) in another table isn't one.
  const row = /^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)?$/.test(rule) ? ruleRows().get(rule) : undefined;
  if (row || (BUILTIN_RULES as readonly string[]).includes(rule)) {
    return {
      rule,
      source: "builtin",
      ...(row && row.length >= 2 ? { level: clip(row[0]!, 100), description: clip(row.slice(1).join(" | ")) } : row ? { description: clip(row[0]!) } : { description: "A built-in rule; its finding's message says what to do." }),
      docs: "https://github.com/marktiderman/genesis/tree/main/packages/genesis-cli#rules",
      ...fixPart,
    };
  }
  let pattern: { id: string; message?: string; level?: string; files?: string[] } | undefined;
  try {
    pattern = loadConfig(ctx.root, ctx.configPath).config.patterns?.find((p) => p.id === rule);
  } catch {
    pattern = undefined;
  }
  if (pattern) {
    return { rule, source: "app", level: pattern.level ?? "error", ...(pattern.message ? { description: clip(pattern.message) } : {}), ...(pattern.files ? { files: pattern.files } : {}), ...fixPart };
  }
  throw new ToolInputError(`no rule "${rule}": not a built-in rule, one an installed package declares, or one in the app's doctor patterns`);
}

/** Catalog rows that answer a need, best first. */
export function catalogSearch(need: string, packages: readonly DeclaringPackage[]) {
  const words = [...new Set(need.toLowerCase().split(/[^a-z0-9@/-]+/).filter((w) => w.length >= 2))];
  if (!words.length) throw new ToolInputError("need: say what you need in a few words (\"a list screen\", \"dates\")");
  const scored = primitivesCatalog(packages)
    .map((row) => {
      const hay = `${row.need} ${row.use} ${row.import ?? ""} ${row.rule ?? ""}`.toLowerCase();
      const needText = row.need.toLowerCase();
      const score = words.reduce((s, w) => s + (needText.includes(w) ? 2 : hay.includes(w) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    results: scored.slice(0, 20).map(({ row }) => ({ need: row.need, use: clip(row.use, 800), ...(row.import ? { import: row.import } : {}), ...(row.docs ? { docs: row.docs } : {}), ...(row.rule ? { rule: row.rule } : {}), from: row.from })),
    ...(scored.length > 20 ? { more: scored.length - 20 } : {}),
    ...(scored.length ? {} : { note: "Nothing in the catalog matches. Check `genesis features find <term>` and the doctor's unused components before building it; if nothing does the job, build it in the app." }),
  };
}

/** Which fix a request names, and the findings it covers. */
export interface FixTarget {
  fix: Fix | null;
  id: string;
  findings: Finding[];
}

/**
 * The fix a `fixId` or `rule` names, narrowed to the findings in `file` or about `subject`. A rule
 * whose findings name more than one fix is refused with the ids, so the agent picks one.
 */
export function resolveFixTarget(request: { fixId?: string; rule?: string; file?: string; subject?: string }, findings: readonly Finding[], fixes: readonly Fix[]): FixTarget {
  const byId = new Map(fixes.map((f) => [f.id, f]));
  const narrow = findings.filter((f) => (request.file === undefined || f.file === request.file) && (request.subject === undefined || f.subject === request.subject));
  if (request.fixId) {
    const id = request.fixId;
    const covered = narrow.filter((f) => (f.fix?.id ?? `manual:${f.rule}`) === id);
    if (id.startsWith("manual:")) return { fix: null, id, findings: covered };
    const fix = byId.get(id);
    if (!fix) throw new ToolInputError(`no fix "${id}" (doctor_run lists each finding's fix; a settings change goes through settings_propose)`);
    return { fix, id, findings: covered };
  }
  const rule = request.rule!;
  const ofRule = narrow.filter((f) => f.rule === rule || f.rules?.includes(rule));
  const ids = [...new Set(ofRule.map((f) => f.fix?.id ?? `manual:${f.rule}`))];
  if (ids.length > 1) throw new ToolInputError(`the findings of ${rule} name more than one fix (${ids.join(", ")}): pass fixId, or file/subject to narrow`);
  if (ids.length === 1) {
    const id = ids[0]!;
    return { fix: byId.get(id) ?? null, id, findings: ofRule };
  }
  // No finding now: the one non-manual fix that covers the rule, planned anyway.
  const covering = fixes.filter((f) => f.rules.includes(rule) && f.kind !== "manual");
  if (covering.length === 1) return { fix: covering[0]!, id: covering[0]!.id, findings: [] };
  throw new ToolInputError(covering.length ? `no finding of ${rule} now, and ${covering.map((f) => f.id).join(", ")} cover it: pass fixId` : `no finding of ${rule}${request.file || request.subject ? " there" : ""}, and no fix covers it`);
}

/** A plan as the tools show it: each file's content up to a limit (its hash covers all of it). */
export function boundedPlan(plan: FixPlan) {
  let budget = MAX_PLAN_CHARS;
  return {
    fixId: plan.fixId,
    summary: plan.summary,
    files: plan.files.map((f) => {
      const room = Math.max(0, Math.min(MAX_FILE_CHARS, budget));
      const shown = f.content.length <= room ? f.content : null;
      budget -= shown?.length ?? 0;
      return {
        path: f.path,
        action: f.beforeHash === null ? "create" : "write",
        why: f.why,
        beforeHash: f.beforeHash,
        contentSha256: sha256(f.content),
        ...(shown !== null ? { content: shown } : { contentOmitted: `${f.content.length} characters; genesis fix ${plan.fixId} --plan --json prints it whole` }),
      };
    }),
    commands: plan.commands.map((c) => ({ run: [c.tool, ...c.args].join(" "), ...(c.stdinSecret ? { stdinSecret: c.stdinSecret } : {}), why: c.why })),
    secrets: plan.secrets,
    ...(plan.manual ? { manual: clip(plan.manual, 4_000) } : {}),
    hash: plan.hash,
  };
}
