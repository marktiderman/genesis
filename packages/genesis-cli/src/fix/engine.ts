/**
 * The fix engine: give every finding its fix, plan a fix, and apply a plan safely.
 *
 * `applyPlan` never trusts the plan it is handed: it plans again and refuses when the hash
 * differs (the app changed since the plan was read), checks each file still has the text the
 * plan expects (`beforeHash`) before writing any, writes, runs the commands, then verifies.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { runTool, isAllowedTool, type ToolRunner } from "../exec/run.js";
import type { Finding } from "../doctor/types.js";
import { manualFixId, type ApplyContext, type Fix, type FixContext, type FixPlan, type FixPlanDraft, type FixRef, type PlannedFile, type VerifyResult } from "./types.js";

/** JSON with object keys sorted at every level: the same data always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The plan's hash: sha256 of the canonical JSON of everything but the hash. */
export function planHash(plan: Omit<FixPlan, "hash">): string {
  return sha256(canonicalJson(plan));
}

/** The sha256 of an app file's text now, or null when there's none. */
export function fileHash(root: string, rel: string): string | null {
  const abs = path.join(root, rel);
  return existsSync(abs) ? sha256(readFileSync(abs, "utf8")) : null;
}

/** A planned file for `rel` whose new text is `content`, hashing what is there now. */
export function plannedFile(root: string, rel: string, content: string, why: string): PlannedFile {
  return { path: rel, beforeHash: fileHash(root, rel), content, why };
}

export class FixError extends Error {
  override name = "FixError";
}
/** The app changed since the plan was made: plan again and read it. */
export class StalePlanError extends FixError {
  override name = "StalePlanError";
}
/** A file isn't what the plan expected (`beforeHash`). Nothing was written. */
export class FileConflictError extends FixError {
  override name = "FileConflictError";
}

/** An app-relative POSIX path that stays inside the app, or a FixError. */
function safePath(root: string, rel: string, fixId: string): string {
  if (typeof rel !== "string" || !rel || rel.includes("\0") || rel.includes("\\") || path.posix.isAbsolute(rel) || path.isAbsolute(rel)) {
    throw new FixError(`${fixId}: plans a write to "${rel}", which isn't an app-relative path`);
  }
  const norm = path.posix.normalize(rel);
  if (norm === ".." || norm.startsWith("../") || norm !== rel) throw new FixError(`${fixId}: plans a write to "${rel}", outside the app or not normalised`);
  return path.join(root, norm);
}

/** Validate a fix's draft and turn it into a hashed plan. */
export function toPlan(fixId: string, root: string, draft: FixPlanDraft): FixPlan {
  const files = (draft.files ?? []).map((f) => {
    safePath(root, f.path, fixId);
    return { path: f.path, beforeHash: f.beforeHash, content: f.content, why: f.why };
  });
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) throw new FixError(`${fixId}: plans two writes to ${f.path}`);
    seen.add(f.path);
  }
  const commands = (draft.commands ?? []).map((c) => {
    if (!Array.isArray(c.args) || c.args.some((a) => typeof a !== "string")) throw new FixError(`${fixId}: a command's args must be a list of strings`);
    if (c.tool !== "genesis" && !isAllowedTool(c.tool)) throw new FixError(`${fixId}: plans "${c.tool}", which isn't a tool a fix may run`);
    return { tool: c.tool, args: [...c.args], ...(c.stdinSecret ? { stdinSecret: c.stdinSecret } : {}), why: c.why };
  });
  const secrets = [...new Set([...(draft.secrets ?? []), ...commands.flatMap((c) => (c.stdinSecret ? [c.stdinSecret] : []))])].sort();
  const body: Omit<FixPlan, "hash"> = { fixId, summary: draft.summary, files, commands, secrets, ...(draft.manual ? { manual: draft.manual } : {}) };
  return { ...body, hash: planHash(body) };
}

/** Plan a fix. Writes nothing. */
export async function planFix(fix: Fix, context: FixContext): Promise<FixPlan> {
  return toPlan(fix.id, context.root, await fix.plan(context));
}

/** The ref a finding gets from a fix. */
export function fixRef(fix: Pick<Fix, "id" | "kind" | "title">): FixRef {
  return { id: fix.id, kind: fix.kind, title: fix.title, ...(fix.kind === "manual" ? {} : { command: `genesis fix ${fix.id}` }) };
}

/**
 * Give every finding its fix: the first registered fix that covers its rule (and whose
 * `appliesTo` accepts it), else `manual:<rule>`. Every finding declares how it is fixed.
 */
export function attachFixes(findings: Finding[], fixes: readonly Fix[], context: { root: string }): Finding[] {
  const byRule = new Map<string, Fix[]>();
  for (const fix of fixes) for (const rule of fix.rules) byRule.set(rule, [...(byRule.get(rule) ?? []), fix]);
  return findings.map((f) => {
    let fix: Fix | undefined;
    for (const candidate of byRule.get(f.rule) ?? []) {
      let applies = true;
      try {
        applies = candidate.appliesTo ? candidate.appliesTo(f, context) : true;
      } catch {
        applies = false;
      }
      if (applies) {
        fix = candidate;
        break;
      }
    }
    return { ...f, fix: fix ? fixRef(fix) : { id: manualFixId(f.rule), kind: "manual", title: "follow the finding's message" } };
  });
}

export interface ApplyOptions {
  /** The hash the person approved (`--expect`). Without it, the hash of the plan passed in. */
  expect?: string;
  /** Runs allowlisted tools (tests pass a stand-in). */
  run?: ToolRunner;
}

export interface ApplyResult {
  plan: FixPlan;
  written: string[];
  ran: string[];
  notes: string[];
  verify: VerifyResult;
}

/**
 * Apply a plan: plan again and refuse a stale one, check every file's `beforeHash`, write the
 * files, run the commands (the fix's own `apply` for in-process ones), then verify.
 */
export async function applyPlan(fix: Fix, plan: FixPlan, context: ApplyContext, options: ApplyOptions = {}): Promise<ApplyResult> {
  if (fix.kind === "manual") throw new FixError(`${fix.id} is a manual fix: nothing runs. ${plan.manual ?? ""}`.trim());
  if (plan.fixId !== fix.id) throw new FixError(`the plan is ${plan.fixId}'s, not ${fix.id}'s`);
  const { hash: handed, ...body } = plan;
  if (planHash(body) !== handed) throw new StalePlanError(`${fix.id}: the plan's hash doesn't match its content`);
  const expected = options.expect ?? handed;
  const fresh = await planFix(fix, context);
  if (fresh.hash !== expected) {
    throw new StalePlanError(`${fix.id}: the app changed since the plan was made (plan ${expected.slice(0, 12)}, now ${fresh.hash.slice(0, 12)}); nothing was written. Run genesis fix ${fix.id} --plan and read it again.`);
  }
  const missing = fresh.secrets.filter((name) => context.secrets?.[name] === undefined);
  if (missing.length) throw new FixError(`${fix.id} needs ${missing.join(", ")}; nothing was written`);

  // Every file first: one conflict and nothing is written.
  const targets = fresh.files.map((f) => ({ file: f, abs: safePath(context.root, f.path, fix.id) }));
  for (const { file, abs } of targets) {
    const now = existsSync(abs) ? sha256(readFileSync(abs, "utf8")) : null;
    if (now !== file.beforeHash) {
      throw new FileConflictError(`${fix.id}: ${file.path} ${now === null ? "is gone" : file.beforeHash === null ? "now exists" : "changed"} since it was planned; nothing was written. Plan again.`);
    }
  }
  const written: string[] = [];
  for (const { file, abs } of targets) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, file.content);
    written.push(file.path);
  }

  const ran: string[] = [];
  const notes: string[] = [];
  if (fix.apply) {
    const out = await fix.apply(fresh, context);
    if (out) notes.push(...out);
    ran.push(...fresh.commands.map((c) => [c.tool, ...c.args].join(" ")));
  } else {
    const run = options.run ?? runTool;
    for (const c of fresh.commands) {
      if (c.tool === "genesis" || !isAllowedTool(c.tool)) throw new FixError(`${fix.id}: "${c.tool}" runs in-process, but the fix has no apply`);
      const stdin = c.stdinSecret ? context.secrets![c.stdinSecret]! : undefined;
      const result = await run(c.tool, c.args, { cwd: context.root, ...(stdin !== undefined ? { stdin } : {}) });
      ran.push([c.tool, ...c.args].join(" "));
      if (result.code !== 0) throw new FixError(`${fix.id}: ${c.tool} ${c.args[0] ?? ""} failed (exit ${result.code}): ${redact(result.stderr.trim() || result.stdout.trim(), context.secrets).split("\n").slice(-5).join("\n")}`);
    }
  }
  const verify = await verifyFix(fix, fresh, context);
  return { plan: fresh, written, ran, notes, verify };
}

/** The fix's verify, else the doctor's rules again (context.recheck), else that the files hold what was written. */
export async function verifyFix(fix: Fix, plan: FixPlan, context: FixContext): Promise<VerifyResult> {
  if (fix.verify) return fix.verify(context);
  if (context.recheck) {
    const remaining = (await context.recheck(fix.rules)).filter((f) => f.fix?.id === fix.id);
    return { ok: remaining.length === 0, remaining, ...(remaining.length ? { message: `${remaining.length} finding${remaining.length === 1 ? "" : "s"} left` } : {}) };
  }
  const off = plan.files.filter((f) => fileHash(context.root, f.path) !== sha256(f.content));
  return { ok: off.length === 0, ...(off.length ? { message: `${off.map((f) => f.path).join(", ")} changed after the write` } : {}) };
}

/** Text with every held secret value replaced. */
export function redact(text: string, secrets: Readonly<Record<string, string>> | undefined): string {
  let out = text;
  for (const value of Object.values(secrets ?? {})) if (value.length >= 4) out = out.split(value).join("[redacted]");
  return out;
}
