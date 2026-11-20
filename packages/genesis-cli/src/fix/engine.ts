/**
 * The fix engine: give every finding its fix, plan a fix, and apply a plan safely.
 *
 * `applyPlan` never trusts the plan it is handed: it plans again and refuses when the hash
 * differs (the app changed since the plan was read), checks each file still has the text the
 * plan expects (`beforeHash`) before writing any, writes, runs the commands, then verifies.
 */
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, lstatSync, statSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync, openSync } from "node:fs";
import * as path from "node:path";
import { runTool, isAllowedTool, TOOL_AUTH_ENV, type ToolRunner } from "../exec/run.js";
import { safeErrorMessage, SecretVault } from "../exec/secret-vault.js";
import { stdinFor } from "../exec/secret-stores.js";
import type { Finding } from "../doctor/types.js";
import { manualFixId, type ApplyContext, type ApplyOutcome, type Fix, type FixContext, type FixPlan, type FixPlanDraft, type FixRef, type PlannedFile, type VerifyResult } from "./types.js";

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

/** An app-relative POSIX path that stays inside the app, or a FixError. Checks the string only; `checkTarget` checks the disk. */
function safePath(root: string, rel: string, fixId: string): string {
  if (typeof rel !== "string" || !rel || rel.includes("\0") || rel.includes("\\") || path.posix.isAbsolute(rel) || path.isAbsolute(rel)) {
    throw new FixError(`${fixId}: plans a write to "${rel}", which isn't an app-relative path`);
  }
  const norm = path.posix.normalize(rel);
  if (norm === ".." || norm.startsWith("../") || norm !== rel) throw new FixError(`${fixId}: plans a write to "${rel}", outside the app or not normalised`);
  return path.join(root, norm);
}

const within = (dir: string, file: string) => {
  const r = path.relative(dir, file);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

/**
 * The write target on disk stays inside the app: the target itself is not a link (a dangling one
 * included), and its deepest existing folder, links resolved, is inside the app's real folder. Run
 * when the plan is checked and again just before each write.
 */
export function checkTarget(root: string, abs: string, fixId: string): void {
  const realRoot = realpathSync(root);
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) throw new FixError(`${fixId}: ${path.relative(root, abs)} is a symbolic link; a fix never writes through one`);
    if (!st.isFile()) throw new FixError(`${fixId}: ${path.relative(root, abs)} isn't a file`);
  } catch (err) {
    if (err instanceof FixError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw new FixError(`${fixId}: can't check ${path.relative(root, abs)} (${code ?? (err as Error).message}); nothing was written there`, { cause: err });
  }
  let dir = path.dirname(abs);
  while (!existsSync(dir)) {
    // A dangling link as a folder on the way: existsSync follows it and says no.
    try {
      if (lstatSync(dir).isSymbolicLink()) throw new FixError(`${fixId}: ${path.relative(root, dir)} is a dangling symbolic link`);
    } catch (err) {
      if (err instanceof FixError) throw err;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (!within(realRoot, realpathSync(dir))) throw new FixError(`${fixId}: ${path.relative(root, abs)} resolves outside the app (through a symbolic link)`);
}

/** Validate a fix's draft and turn it into a hashed plan. */
export function toPlan(fixId: string, root: string, draft: FixPlanDraft): FixPlan {
  const files = (draft.files ?? []).map((f) => {
    checkTarget(root, safePath(root, f.path, fixId), fixId);
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
    if (c.stdinSecret !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(c.stdinSecret)) throw new FixError(`${fixId}: stdinSecret must be a secret's NAME, never a value`);
    if (c.stdinFormat !== undefined && !["value", "dotenv"].includes(c.stdinFormat)) throw new FixError(`${fixId}: unknown stdinFormat ${JSON.stringify(c.stdinFormat)}`);
    if (c.stdinFormat !== undefined && !c.stdinSecret) throw new FixError(`${fixId}: stdinFormat without a stdinSecret`);
    return { tool: c.tool, args: [...c.args], ...(c.stdinSecret ? { stdinSecret: c.stdinSecret } : {}), ...(c.stdinFormat && c.stdinFormat !== "value" ? { stdinFormat: c.stdinFormat } : {}), why: c.why };
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
  /**
   * Keep the plan's secrets in the vault after verifying: the caller still prints the result
   * redacted against them, then clears the vault itself (`genesis fix` does). Default: dropped here.
   */
  keepSecrets?: boolean;
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
  const vault = SecretVault.from(context.secrets);
  try {
    return await applyWithVault(fix, plan, { ...context, secrets: vault }, vault, options);
  } finally {
    // Held for one fix only: dropped once it has verified (or failed), unless the caller clears them after printing.
    if (!options.keepSecrets) for (const name of plan.secrets) vault.drop(name);
  }
}

async function applyWithVault(fix: Fix, plan: FixPlan, context: ApplyContext, vault: SecretVault, options: ApplyOptions): Promise<ApplyResult> {
  // Never the raw text: if redaction itself failed, a generic line stands in.
  const redact = (text: string) => safeErrorMessage(vault, text, "(the error isn't shown: it may hold a secret)");
  if (fix.kind === "manual") throw new FixError(`${fix.id} is a manual fix: nothing runs. ${plan.manual ?? ""}`.trim());
  if (plan.fixId !== fix.id) throw new FixError(`the plan is ${plan.fixId}'s, not ${fix.id}'s`);
  const { hash: handed, ...body } = plan;
  if (planHash(body) !== handed) throw new StalePlanError(`${fix.id}: the plan's hash doesn't match its content`);
  const expected = options.expect ?? handed;
  let fresh: FixPlan;
  try {
    fresh = await planFix(fix, context);
  } catch (err) {
    if (err instanceof FixError) throw err;
    throw new FixError(`${fix.id}: couldn't plan again: ${redact((err as Error).message ?? String(err))}; nothing was written`);
  }
  if (fresh.hash !== expected) {
    throw new StalePlanError(`${fix.id}: the app changed since the plan was made (plan ${expected.slice(0, 12)}, now ${fresh.hash.slice(0, 12)}); nothing was written. Run genesis fix ${fix.id} --plan and read it again.`);
  }
  const missing = fresh.secrets.filter((name) => !vault.has(name));
  if (missing.length) throw new FixError(`${fix.id} needs ${missing.join(", ")}; nothing was written`);
  // Every stdin is formed before anything is written: a value its format can't carry stops the fix here.
  for (const c of fresh.commands) {
    if (!c.stdinSecret) continue;
    try {
      await vault.use(c.stdinSecret, (value) => stdinFor(c.stdinFormat ?? "value", c.stdinSecret!, value));
    } catch (err) {
      throw new FixError(`${fix.id}: ${redact((err as Error).message)}; nothing was written`);
    }
  }

  // Every file first: one conflict and nothing is written.
  const targets = fresh.files.map((f) => ({ file: f, abs: safePath(context.root, f.path, fix.id) }));
  for (const { file, abs } of targets) {
    checkTarget(context.root, abs, fix.id);
    const now = existsSync(abs) ? sha256(readFileSync(abs, "utf8")) : null;
    if (now !== file.beforeHash) {
      throw new FileConflictError(`${fix.id}: ${file.path} ${now === null ? "is gone" : file.beforeHash === null ? "now exists" : "changed"} since it was planned; nothing was written. Plan again.`);
    }
  }

  const journal = new Journal(context.root);
  const ran: string[] = [];
  const notes: string[] = [];
  let inProcess = false;
  try {
    for (const { file, abs } of targets) journal.write(abs, file, fix.id);
    if (fix.apply) {
      inProcess = true;
      const out: ApplyOutcome | void = await fix.apply(fresh, context);
      inProcess = false;
      if (out) {
        ran.push(...out.ran);
        notes.push(...(out.notes ?? []).map(redact));
      }
    } else {
      // Output streams to the log a line at a time, every held value redacted.
      const run = vault.redactingRunner(options.run ?? runTool);
      const log = context.log;
      for (const c of fresh.commands) {
        if (c.tool === "genesis" || !isAllowedTool(c.tool)) throw new FixError(`${fix.id}: "${c.tool}" runs in-process, but the fix has no apply`);
        const base = { cwd: context.root, passEnv: TOOL_AUTH_ENV[c.tool] ?? [], ...(log ? { onOutput: (text: string) => log(text.replace(/\n$/, "")) } : {}) };
        const result = c.stdinSecret
          ? await vault.use(c.stdinSecret, (value) => run(c.tool as Parameters<ToolRunner>[0], c.args, { ...base, stdin: stdinFor(c.stdinFormat ?? "value", c.stdinSecret!, value) }))
          : await run(c.tool, c.args, base);
        ran.push([c.tool, ...c.args].join(" ") + (c.stdinSecret ? ` < ${c.stdinSecret}` : ""));
        if (result.code !== 0) throw new FixError(`${c.tool} ${c.args[0] ?? ""} failed (exit ${result.code}): ${(result.stderr.trim() || result.stdout.trim()).split("\n").slice(-5).join("\n")}`);
      }
    }
    const checked = await verifyFix(fix, fresh, context);
    const verify = checked.message ? { ...checked, message: redact(checked.message) } : checked;
    return { plan: fresh, written: journal.written(), ran, notes, verify };
  } catch (err) {
    const written = journal.written();
    const { restored, failed } = journal.rollback();
    const what = [
      written.length ? `wrote ${written.join(", ")}` : "wrote no file",
      ran.length ? `ran ${ran.join("; ")} (not undone)` : "",
      inProcess && fresh.commands.length ? `may have partly run ${fresh.commands.map((c) => [c.tool, ...c.args].join(" ")).join("; ")} (not undone: check git status)` : "",
      restored.length ? `rolled back ${restored.join(", ")}` : "",
      failed.length ? `couldn't roll back ${failed.join(", ")}: restore them from git` : "",
    ].filter(Boolean);
    const raw = err instanceof Error ? err.message : String(err);
    const message = redact(raw.startsWith(`${fix.id}: `) ? raw.slice(fix.id.length + 2) : raw);
    // No `cause`: the original error's text may hold a value; this message is the redacted account.
    throw new FixError(`${fix.id}: ${message}. It ${what.join("; ")}.`);
  }
}

/** What applyPlan wrote, so a later failure can put every file back. */
class Journal {
  private entries: Array<{ abs: string; rel: string; before: string | null; mode?: number; dirs: string | undefined }> = [];
  constructor(private root: string) {}

  /** Write one planned file: a new one with `wx` (never over one that appeared), an existing one through a temp file and a rename, after re-reading it. */
  write(abs: string, file: PlannedFile, fixId: string): void {
    checkTarget(this.root, abs, fixId);
    const dirs = mkdirSync(path.dirname(abs), { recursive: true });
    checkTarget(this.root, abs, fixId);
    if (file.beforeHash === null) {
      this.entries.push({ abs, rel: file.path, before: null, dirs });
      // Created with `wx` first, written second: only a file this write created is ever removed. An
      // open that fails (EEXIST, or EMFILE with nothing created) leaves whatever is there alone.
      let fd: number;
      try {
        fd = openSync(abs, "wx");
      } catch (err) {
        this.entries.pop();
        if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new FileConflictError(`${file.path} appeared while the fix was writing`);
        throw err;
      }
      try {
        writeFileSync(fd, file.content);
      } catch (err) {
        // This write created the file, so the partial file (ENOSPC) is its own to remove.
        this.entries.pop();
        try {
          closeSync(fd);
        } catch {
          /* already closed */
        }
        try {
          unlinkSync(abs);
        } catch {
          /* gone already */
        }
        throw err;
      }
      closeSync(fd);
      return;
    }
    const before = readFileSync(abs, "utf8");
    const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.genesis-fix-${process.pid}-${Date.now()}`);
    // The rewrite keeps the file's mode (an executable script stays executable).
    const mode = statSync(abs).mode & 0o7777;
    try {
      // Inside the try: a staging file a failed write left half-written is removed too.
      writeFileSync(tmp, file.content, { flag: "wx" });
      chmodSync(tmp, mode);
      // The last look: the file is still what the plan read.
      if (sha256(readFileSync(abs, "utf8")) !== file.beforeHash || sha256(before) !== file.beforeHash) throw new FileConflictError(`${file.path} changed while the fix was writing`);
      checkTarget(this.root, abs, fixId);
      this.entries.push({ abs, rel: file.path, before, mode, dirs });
      renameSync(tmp, abs);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        /* already renamed or gone */
      }
      throw err;
    }
  }

  written(): string[] {
    return this.entries.map((e) => e.rel);
  }

  /** Put every written file back as it was (newest first); delete the ones it created, and the folders it made for them when empty. */
  rollback(): { restored: string[]; failed: string[] } {
    const restored: string[] = [];
    const failed: string[] = [];
    for (const e of [...this.entries].reverse()) {
      try {
        if (e.before === null) {
          unlinkSync(e.abs);
          if (e.dirs) {
            for (let d = path.dirname(e.abs); within(e.dirs, d); d = path.dirname(d)) {
              try {
                rmdirSync(d);
              } catch {
                break;
              }
              if (d === e.dirs) break;
            }
          }
        } else {
          const tmp = `${e.abs}.genesis-rollback-${process.pid}`;
          writeFileSync(tmp, e.before);
          if (e.mode !== undefined) chmodSync(tmp, e.mode);
          renameSync(tmp, e.abs);
        }
        restored.push(e.rel);
      } catch {
        failed.push(e.rel);
      }
    }
    this.entries = [];
    return { restored, failed };
  }
}

/** The fix's verify, else the doctor's rules again (context.recheck), else that the files hold what was written. */
export async function verifyFix(fix: Fix, plan: FixPlan, context: FixContext): Promise<VerifyResult> {
  if (fix.verify) return fix.verify(context);
  if (context.recheck) {
    // A finding this fix was run for is left whatever fix it names now (one that moved to another
    // fix isn't fixed); otherwise those that still name this fix.
    const key = (f: { rule: string; file: string; subject?: string }) => `${f.rule}\u0000${f.file}\u0000${f.subject ?? ""}`;
    const ranFor = new Set(context.findings.map(key));
    const remaining = (await context.recheck(fix.rules)).filter((f) => f.fix?.id === fix.id || ranFor.has(key(f)));
    return { ok: remaining.length === 0, remaining, ...(remaining.length ? { message: `${remaining.length} finding${remaining.length === 1 ? "" : "s"} left` } : {}) };
  }
  const off = plan.files.filter((f) => fileHash(context.root, f.path) !== sha256(f.content));
  return { ok: off.length === 0, ...(off.length ? { message: `${off.map((f) => f.path).join(", ")} changed after the write` } : {}) };
}
