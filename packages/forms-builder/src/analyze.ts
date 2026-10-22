/**
 * Everything the builder tells the author about the form as it stands:
 * structural problems (`parseForm`), likely mistakes (its warnings) and path
 * problems found by exploring every branch (`coverage`).
 */
import { parseForm, type FormDefinition, type FormIssue } from "@marktiderman/genesis-forms";
import { coverage, type CoverageReport } from "@marktiderman/genesis-forms/testing";

export type FindingLevel = "error" | "warning" | "info";

export interface Finding {
  level: FindingLevel;
  message: string;
  /** The definition path `parseForm` reported, such as `blocks[2].props.options`. */
  path?: string;
  /** The block, rule or ending it is about, when one can be named. */
  ref?: { kind: "block" | "rule" | "ending"; id: string };
}

export interface Analysis {
  /** Errors block publishing; warnings and infos do not. */
  findings: Finding[];
  canPublish: boolean;
  coverage?: CoverageReport;
}

const BLOCK_PATH = /^blocks\[(\d+)\]/;
const RULE_PATH = /^logic\[(\d+)\]/;
const ENDING_PATH = /^endings\[(\d+)\]/;

function refFor(def: FormDefinition, issue: FormIssue): Finding["ref"] {
  const block = BLOCK_PATH.exec(issue.path);
  if (block) {
    const b = def.blocks[Number(block[1])];
    return b ? { kind: "block", id: b.id } : undefined;
  }
  const rule = RULE_PATH.exec(issue.path);
  if (rule) {
    const r = def.logic?.[Number(rule[1])];
    return r ? { kind: "rule", id: r.id } : undefined;
  }
  const ending = ENDING_PATH.exec(issue.path);
  if (ending) {
    const e = def.endings?.[Number(ending[1])];
    return e ? { kind: "ending", id: e.id } : undefined;
  }
  return undefined;
}

const finding = (def: FormDefinition, level: FindingLevel, issue: FormIssue): Finding => {
  const ref = refFor(def, issue);
  const out: Finding = { level, message: issue.message, path: issue.path };
  if (ref) out.ref = ref;
  return out;
};

/**
 * Analyse a definition. Coverage only runs on a definition that parses, and
 * stops after `maxStates` explored states so a large form stays responsive.
 */
export function analyze(def: FormDefinition, opts: { maxStates?: number } = {}): Analysis {
  const parsed = parseForm(def);
  const findings: Finding[] = [];
  if (!parsed.ok) {
    findings.push(...parsed.issues.map((i) => finding(def, "error", i)));
    findings.push(...parsed.warnings.map((i) => finding(def, "warning", i)));
    return { findings, canPublish: false };
  }
  findings.push(...parsed.warnings.map((i) => finding(def, "warning", i)));

  if (!def.blocks.some((b) => b.kind === "field")) {
    findings.push({ level: "error", message: "Add at least one question." });
  }

  const report = coverage(def, { maxStates: opts.maxStates ?? 2000 });
  const idByKey = new Map(def.blocks.map((b) => [b.kind === "field" ? b.key : b.id, b.id]));
  for (const key of report.unreachableBlocks) {
    const id = idByKey.get(key) ?? key;
    findings.push({ level: "warning", message: `No respondent can reach "${key}": a jump always skips it or logic always hides it.`, ref: { kind: "block", id } });
  }
  for (const id of report.rulesNeverFired) {
    findings.push({ level: "warning", message: "This rule's condition is never true for any respondent, so it has no effect.", ref: { kind: "rule", id } });
  }
  for (const [id, e] of Object.entries(report.endings)) {
    if (!e.reached && !e.needsSamples) {
      findings.push({ level: "warning", message: `No respondent can reach the ending "${def.endings?.find((x) => x.id === id)?.title ?? id}".`, ref: { kind: "ending", id } });
    }
  }
  if (report.truncated) {
    findings.push({ level: "info", message: "The form has too many paths to check them all; the path warnings above may be incomplete." });
  }
  return { findings, canPublish: !findings.some((f) => f.level === "error"), coverage: report };
}
