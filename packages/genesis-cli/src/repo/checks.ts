/**
 * The required checks a branch's rulesets name, read from the app's own CI: every job of every
 * workflow that runs on a pull request into that branch, by the name GitHub gives its check.
 *
 * - A job's check is its `name` (else its key). A job that calls a reusable workflow reports one
 *   check per called job, `<caller> / <called>` (`app / App checks`); the called workflow is read
 *   from the repository (`./.github/workflows/…`) or, through `remote`, from where `uses:` points.
 * - A called job switched off by the caller (`if: inputs.doctor` with `doctor: false`) is left out.
 * - A workflow with `paths` or `paths-ignore` on its pull request trigger is *conditional*: it never
 *   reports on a pull request outside those paths, so requiring it would hold that pull request
 *   forever. Its checks come back in `conditional`, never in `required`.
 * - A workflow that runs only on other pull request activity (`types: [closed]`) reports nothing
 *   while the pull request is open, so it is left out.
 * - Advisory reviews (Genesis's `claude-review.yml`) aren't required; jobs whose names GitHub
 *   builds at run time (a matrix, named or not: GitHub appends each leg's values; an expression)
 *   aren't required, and are said in `notes`.
 */
import { parse } from "yaml";
import type { ConditionalCheck } from "./spec.js";

export interface WorkflowFile {
  /** From the repository root: `.github/workflows/ci.yml`. */
  path: string;
  text: string;
}

/** Where a remote `uses:` points. */
export interface RemoteRef {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

/** Reads a reusable workflow another repository holds; null when it can't. */
export type RemoteWorkflowReader = (ref: RemoteRef) => Promise<string | null>;

export interface DerivedChecks {
  required: string[];
  conditional: ConditionalCheck[];
  notes: string[];
}

/** Reusable workflows whose jobs advise and never gate a merge. */
const ADVISORY = [/(^|\/)claude-review\.ya?ml$/];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asList = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const escapeRe = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/** A `[…]` class from `pattern[i]` (`[` itself) as regex source, and where it ends; null when unclosed. */
function charClass(pattern: string, i: number, negate: string[]): { source: string; end: number } | null {
  let j = i + 1;
  let body = "";
  if (negate.includes(pattern[j] ?? "")) {
    body += "^";
    j++;
  }
  const start = j;
  for (; j < pattern.length; j++) {
    const ch = pattern[j]!;
    if (ch === "]" && j > start) return { source: `[${body}]`, end: j };
    if (ch === "\\" && j + 1 < pattern.length) {
      body += escapeRe(pattern[++j]!);
      continue;
    }
    body += ch === "-" && j > start && pattern[j + 1] !== "]" ? "-" : escapeRe(ch);
  }
  return null;
}

/**
 * A GitHub Actions branch filter pattern as a regular expression, in the workflow syntax's grammar:
 * `*` within a segment, `**` across them, `?` zero or one and `+` one or more of the character
 * before, `[…]` a class (with ranges), `\\` escapes the next character. (`!` is
 * {@link branchMatches}'s, in order.)
 */
export function branchPattern(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) out += escapeRe(pattern[++i]!);
    else if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else out += "[^/]*";
    } else if ((ch === "?" || ch === "+") && out) out += ch;
    else if (ch === "[") {
      const cls = charClass(pattern, i, []);
      if (cls) {
        out += cls.source;
        i = cls.end;
      } else out += "\\[";
    } else out += escapeRe(ch);
  }
  return new RegExp(`^${out}$`);
}

/**
 * A ruleset ref pattern (fnmatch, as the rulesets API reads `include` / `exclude`) as a regular
 * expression: `*` within a segment, `**` across them, `?` one character, `[…]` / `[!…]` a class.
 */
export function refPattern(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) out += escapeRe(pattern[++i]!);
    else if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else out += "[^/]*";
    } else if (ch === "?") out += "[^/]";
    else if (ch === "[") {
      const cls = charClass(pattern, i, ["!", "^"]);
      if (cls) {
        out += cls.source;
        i = cls.end;
      } else out += "\\[";
    } else out += escapeRe(ch);
  }
  return new RegExp(`^${out}$`);
}

/** Whether a `branches` / `branches-ignore` filter lets a pull request into `branch` through. */
export function branchMatches(filter: { branches?: unknown; "branches-ignore"?: unknown }, branch: string): boolean {
  const include = asList(filter.branches);
  if (include.length) {
    // In order: a later `!pattern` takes back what an earlier pattern matched.
    let hit = false;
    for (const p of include) {
      if (p.startsWith("!")) {
        if (branchPattern(p.slice(1)).test(branch)) hit = false;
      } else if (branchPattern(p).test(branch)) hit = true;
    }
    return hit;
  }
  const ignore = asList(filter["branches-ignore"]);
  return !ignore.some((p) => branchPattern(p).test(branch));
}

/**
 * The pull request activity a required check must run on: a pull request's first commit
 * (`opened`, `reopened`) and every later one (`synchronize`). GitHub's default `types` are these.
 */
const GATING_TYPES = ["opened", "synchronize", "reopened"] as const;

/**
 * The pull request triggers of a workflow that fire for `branch`. Triggers are alternatives: one
 * without a path filter makes the workflow report on every pull request (`paths` empty), whatever
 * another trigger's filter says; only when every firing trigger is filtered is it conditional.
 * A trigger whose `types` leave out one of {@link GATING_TYPES} can't gate (a later commit, or the
 * first, gets no run): `partial` says which.
 */
function prTrigger(on: unknown, branch: string): { fires: boolean; paths: string[]; partial: string[] } {
  const events = typeof on === "string" ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(asList(on).map((e) => [e, null])) : isObj(on) ? on : {};
  let fires = false;
  let unconditional = false;
  const paths: string[] = [];
  const partial: string[] = [];
  for (const event of ["pull_request", "pull_request_target"]) {
    if (!(event in events)) continue;
    const filter = isObj(events[event]) ? (events[event] as Obj) : {};
    if (!branchMatches(filter, branch)) continue;
    const types = asList(filter.types);
    const missing = types.length ? GATING_TYPES.filter((t) => !types.includes(t)) : [];
    if (missing.length) {
      // `types: [closed]` (no gating activity at all) is simply not a pull request check.
      if (missing.length < GATING_TYPES.length) partial.push(`${event} runs on ${types.join(", ")}, not ${missing.join(", ")}`);
      continue;
    }
    fires = true;
    const own = [...asList(filter.paths), ...asList(filter["paths-ignore"]).map((p) => `!${p}`)];
    if (!own.length) unconditional = true;
    else paths.push(...own);
  }
  return { fires, paths: unconditional ? [] : [...new Set(paths)], partial };
}

const DYNAMIC = /\$\{\{/;

/** A job's check name: its `name`, else its key; null when GitHub builds it at run time. */
function jobName(key: string, job: Obj): string | null {
  if (typeof job.name === "string") return DYNAMIC.test(job.name) ? null : job.name;
  return key;
}

/** `if: inputs.x` (with or without `${{ }}`): the input that switches the job. */
function switchInput(cond: unknown): string | null {
  if (typeof cond !== "string") return null;
  const m = /^\s*(?:\$\{\{\s*)?inputs\.([A-Za-z0-9_-]+)\s*(?:\}\})?\s*$/.exec(cond);
  return m ? m[1]! : null;
}

function falsy(v: unknown): boolean {
  return v === false || v === "false";
}

const REMOTE_USES = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/(\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml)@([A-Za-z0-9._/-]+)$/;

function parseYaml(text: string): Obj | null {
  try {
    const doc: unknown = parse(text);
    return isObj(doc) ? doc : null;
  } catch {
    return null;
  }
}

/** The checks one called workflow's jobs report, as `<caller> / <job>`. */
function calledChecks(caller: string, called: Obj, inputs: Obj, where: string, notes: string[]): string[] {
  const declared = isObj(called.on) && isObj((called.on as Obj).workflow_call) ? ((called.on as Obj).workflow_call as Obj).inputs : undefined;
  const out: string[] = [];
  for (const [key, raw] of Object.entries(isObj(called.jobs) ? called.jobs : {})) {
    if (!isObj(raw)) continue;
    const input = switchInput(raw.if);
    if (input) {
      const given = inputs[input];
      const fallback = isObj(declared) && isObj(declared[input]) ? (declared[input] as Obj).default : undefined;
      if (falsy(given !== undefined ? given : fallback)) continue;
    }
    if (raw.uses !== undefined || isObj(raw.strategy)) {
      notes.push(`${where}: job ${key} ${raw.uses !== undefined ? "calls another workflow" : "is a matrix"}, so its check names aren't known here (list them in repo.requiredChecks)`);
      continue;
    }
    const name = jobName(key, raw);
    if (!name) {
      notes.push(`${where}: job ${key}'s name is built at run time (list its checks in repo.requiredChecks)`);
      continue;
    }
    out.push(`${caller} / ${name}`);
  }
  return out;
}

/**
 * The checks the app's workflows report on a pull request into `branch`. `remote` reads a
 * reusable workflow from another repository; without it such a job is a note.
 */
export async function checksFromWorkflows(files: readonly WorkflowFile[], branch: string, remote?: RemoteWorkflowReader): Promise<DerivedChecks> {
  const required: string[] = [];
  const conditional: ConditionalCheck[] = [];
  const notes: string[] = [];
  const byPath = new Map(files.map((f) => [f.path.replace(/^\.\//, ""), f.text]));
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const doc = parseYaml(file.text);
    if (!doc) {
      notes.push(`${file.path} isn't valid YAML, so its checks aren't known`);
      continue;
    }
    const trigger = prTrigger(doc.on, branch);
    if (!trigger.fires) {
      if (trigger.partial.length) notes.push(`${file.path} isn't required: ${trigger.partial.join("; ")}, so a pull request can be left without its result`);
      continue;
    }
    const found: string[] = [];
    for (const [key, raw] of Object.entries(isObj(doc.jobs) ? doc.jobs : {})) {
      if (!isObj(raw)) continue;
      const caller = jobName(key, raw);
      if (!caller) {
        notes.push(`${file.path}: job ${key}'s name is built at run time (list its checks in repo.requiredChecks)`);
        continue;
      }
      // GitHub reports one check per matrix leg (`Test (18)`, `Test (20)`), never the bare name:
      // a caller of a reusable workflow too, so this comes first.
      if (isObj(raw.strategy) && raw.strategy.matrix !== undefined) {
        notes.push(`${file.path}: job ${key} is a matrix, which reports one check per leg, so it isn't required (list its checks in repo.requiredChecks)`);
        continue;
      }
      if (typeof raw.uses === "string") {
        const uses = raw.uses.trim();
        if (ADVISORY.some((re) => re.test(uses.split("@")[0]!))) continue;
        const inputs = isObj(raw.with) ? raw.with : {};
        let text: string | null = null;
        if (uses.startsWith("./")) text = byPath.get(uses.slice(2)) ?? null;
        else {
          const m = REMOTE_USES.exec(uses);
          if (m && remote) text = await remote({ owner: m[1]!, repo: m[2]!, path: m[3]!, ref: m[4]! });
        }
        const called = text ? parseYaml(text) : null;
        if (!called) {
          notes.push(`${file.path}: job ${key} calls ${uses}, which couldn't be read, so its checks aren't known (list them in repo.requiredChecks)`);
          continue;
        }
        found.push(...calledChecks(caller, called, inputs, `${file.path} → ${uses.split("@")[0]}`, notes));
        continue;
      }
      found.push(caller);
    }
    if (trigger.paths.length) {
      const why = `${file.path} runs only on changes to ${trigger.paths.join(", ")}: a pull request that doesn't touch them waits for it forever`;
      for (const context of found) conditional.push({ context, why });
    } else required.push(...found);
  }
  return { required: [...new Set(required)], conditional: conditional.filter((c, i) => conditional.findIndex((x) => x.context === c.context) === i && !required.includes(c.context)), notes };
}
