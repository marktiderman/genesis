/**
 * Declarative app rules: from config `patterns`, or from a markdown rules
 * document so the rules can live next to the prose that explains them.
 *
 * The markdown format: a `### rule-id` heading starts a rule; the `- key: value`
 * lines under it (level, files, exclude, forbid, require, path, message) set
 * it; any `#` or `##` heading ends it. `files`/`exclude` are comma-separated.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { DoctorConfigError } from "./config.js";
import { globMatcher } from "./glob.js";
import { lineAt } from "./scan.js";
import type { DoctorContext, DoctorPlugin, PatternRule } from "./types.js";

export function parseRulesMarkdown(markdown: string): PatternRule[] {
  const rules: PatternRule[] = [];
  let current: PatternRule | null = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^###\s+([A-Za-z0-9_-]+)\s*$/);
    if (heading) {
      current = { id: heading[1] };
      rules.push(current);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      current = null;
      continue;
    }
    const kv = current && line.match(/^-\s+(level|files|exclude|forbid|require|path|message):\s*(.*)$/);
    if (!current || !kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    if (key === "files" || key === "exclude") current[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "level") current.level = value as PatternRule["level"];
    else current[key as "forbid" | "require" | "path" | "message"] = value;
  }
  return rules;
}

/** `(?i)` at the start means case-insensitive, as in the markdown format. */
function toRegExp(source: string, flags = ""): RegExp {
  if (source.startsWith("(?i)")) return new RegExp(source.slice(4), flags + "i");
  return new RegExp(source, flags);
}

interface CompiledRule {
  rule: PatternRule;
  level: "error" | "warn";
  includes: (p: string) => boolean;
  excludes: (p: string) => boolean;
  forbid?: RegExp;
  require?: RegExp;
  path?: RegExp;
}

/** Validate and compile rules up front, so a broken pattern fails the run with its rule id. */
export function compilePatternRules(rules: PatternRule[], source: string): CompiledRule[] {
  const ids = new Set<string>();
  const out: CompiledRule[] = [];
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new DoctorConfigError(`${source}: rule "${rule.id}" is defined twice`);
    ids.add(rule.id);
    const level = rule.level ?? "error";
    if (!["error", "warn", "guide"].includes(level)) {
      throw new DoctorConfigError(`${source}: rule "${rule.id}" has level "${level}" (use error, warn or guide)`);
    }
    if (level === "guide") continue;
    if (!rule.files?.length) throw new DoctorConfigError(`${source}: rule "${rule.id}" needs "files" (or level: guide)`);
    if (!rule.forbid && !rule.require && !rule.path) {
      throw new DoctorConfigError(`${source}: rule "${rule.id}" needs forbid, require or path (or level: guide)`);
    }
    try {
      out.push({
        rule,
        level,
        includes: globMatcher(rule.files),
        excludes: globMatcher(rule.exclude),
        forbid: rule.forbid ? toRegExp(rule.forbid, "m") : undefined,
        require: rule.require ? toRegExp(rule.require, "m") : undefined,
        path: rule.path ? toRegExp(rule.path) : undefined,
      });
    } catch (err) {
      throw new DoctorConfigError(`${source}: rule "${rule.id}" has an invalid pattern: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Pattern rules from config and the rules doc, as one plugin. Returns null when there are none. */
export function loadPatternRules(root: string, patterns: PatternRule[] | undefined, rulesDoc: string | undefined): { plugin: DoctorPlugin; count: number } | null {
  const compiled = compilePatternRules(patterns ?? [], "doctor.patterns");
  let all = compiled;
  if (rulesDoc) {
    const file = path.resolve(root, rulesDoc);
    if (!existsSync(file)) throw new DoctorConfigError(`doctor.rulesDoc: ${rulesDoc} not found`);
    const fromDoc = compilePatternRules(parseRulesMarkdown(readFileSync(file, "utf8")), rulesDoc);
    const clash = fromDoc.find((d) => compiled.some((c) => c.rule.id === d.rule.id));
    if (clash) throw new DoctorConfigError(`rule "${clash.rule.id}" is defined in both doctor.patterns and ${rulesDoc}`);
    all = [...compiled, ...fromDoc];
  }
  if (all.length === 0) return null;
  return {
    count: all.length,
    plugin: {
      name: "patterns",
      check(ctx: DoctorContext) {
        for (const r of all) {
          const message = r.rule.message ?? "breaks a design rule";
          for (const file of ctx.files) {
            if (!r.includes(file.path) || r.excludes(file.path)) continue;
            const report = (line: number) => ctx.report({ rule: r.rule.id, level: r.level, file: file.path, line, message });
            if (r.path && !r.path.test(file.path)) report(0);
            if (r.require && !r.require.test(file.code)) report(0);
            if (r.forbid) {
              const m = r.forbid.exec(file.code);
              if (m) report(lineAt(file.code, m.index));
            }
          }
        }
      },
    },
  };
}
