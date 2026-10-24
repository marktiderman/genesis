/**
 * Everything the builder tells the author about the form as it stands:
 * structural problems (`parseForm`), likely mistakes (its warnings) and path
 * problems found by exploring every branch (`coverage`).
 */
import {
  choiceOptions,
  fingerprint,
  listFieldTypes,
  optionsSource,
  parseForm,
  withHostOptions,
  type FieldTypeManifest,
  type FormDefinition,
  type FormIssue,
  type ParseResult,
} from "@marktiderman/genesis-forms";
import { coverage, type CoverageReport } from "@marktiderman/genesis-forms/testing";
import { sampleHostOptions, type HostOptionList } from "./host-options";

export type FindingLevel = "error" | "warning" | "info";

export interface Finding {
  level: FindingLevel;
  message: string;
  /** The definition path `parseForm` reported, such as `blocks[2].props.options`. */
  path?: string;
  /** The block, rule or ending it is about, when one can be named. */
  ref?: { kind: "block" | "rule" | "ending"; id: string };
  /**
   * A stable name for the builder's own checks, so a host can tell them apart
   * without matching the message: `"no-questions"` (the form asks nothing yet)
   * and `"untitled-question"` (a question has no title). The path checks are
   * `"unreachable-block"`, `"rule-never-fires"`, `"unreachable-ending"` and
   * `"paths-not-checked"` (too many paths to check them all).
   */
  code?: FindingCode;
}

export type FindingCode =
  | "no-questions"
  | "untitled-question"
  | "unreachable-block"
  | "rule-never-fires"
  | "unreachable-ending"
  | "paths-not-checked";

/** The codes of the path checks, the ones the flow map sums up. */
export const PATH_FINDINGS: ReadonlySet<FindingCode> = new Set<FindingCode>(["unreachable-block", "rule-never-fires", "unreachable-ending"]);

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
 * A fingerprint of everything but wording: labels, descriptions, titles,
 * placeholders, option labels and content text. Two definitions with the same
 * structure take the same paths and keep a preview's answers valid.
 */
export function structureFingerprint(def: FormDefinition): string {
  const { title: _t, description: _d, ...rest } = def;
  return fingerprint({
    ...rest,
    blocks: def.blocks.map((b) => {
      if (b.kind === "content") return { kind: b.kind, id: b.id, type: b.type };
      if (b.kind === "page-break") return { kind: b.kind, id: b.id };
      const { label: _l, description: _ds, placeholder: _p, ...field } = b;
      const raw = b.props?.options;
      if (!choiceOptions(b).length || !Array.isArray(raw)) return field;
      // Every option prop but its label: a type's samples() may read others (such as `exclusive`).
      const options = raw.map((o) => {
        if (!o || typeof o !== "object" || Array.isArray(o)) return o;
        const { label: _ol, ...rest } = o;
        return rest;
      });
      return { ...field, props: { ...b.props, options } };
    }),
    endings: (def.endings ?? []).map((e) => e.id),
  });
}

// Coverage reads only structure, so typing a label reuses the last report.
const COVERAGE_CACHE_SIZE = 8;
const coverageCache = new Map<string, CoverageReport>();

// Coverage also reads the field-type registry (samples, operators): a type
// registered or replaced later must not reuse a report made without it.
const manifestIds = new WeakMap<FieldTypeManifest, number>();
let nextManifestId = 0;
/** Changes whenever a field type is registered or replaced. */
export function registryVersion(): string {
  return listFieldTypes()
    .map((m) => {
      let id = manifestIds.get(m);
      if (id === undefined) manifestIds.set(m, (id = nextManifestId++));
      return id;
    })
    .join(",");
}

function cachedCoverage(def: FormDefinition, maxStates: number): CoverageReport {
  const key = `${maxStates}:${registryVersion()}:${structureFingerprint(def)}`;
  const hit = coverageCache.get(key);
  if (hit) {
    coverageCache.delete(key);
    coverageCache.set(key, hit);
    return hit;
  }
  const report = coverage(def, { maxStates });
  coverageCache.set(key, report);
  if (coverageCache.size > COVERAGE_CACHE_SIZE) coverageCache.delete(coverageCache.keys().next().value!);
  return report;
}

/**
 * Analyse a definition. Coverage only runs on a definition that parses, and
 * stops after `maxStates` explored states so a large form stays responsive;
 * when it stops early, its path warnings are left out (they would be guesses).
 * Pass `parsed` when `parseForm(def)` already ran. With `hostOptions` (the
 * host's lists, as `FormBuilder` takes them), the path checks try their
 * sample options, and a question taking its options from a list the host
 * doesn't offer is a warning.
 */
export function analyze(
  def: FormDefinition,
  opts: { maxStates?: number; parsed?: ParseResult; hostOptions?: readonly HostOptionList[] | undefined } = {},
): Analysis {
  const parsed = opts.parsed ?? parseForm(def);
  const findings: Finding[] = [];
  if (!parsed.ok) {
    findings.push(...parsed.issues.map((i) => finding(def, "error", i)));
    findings.push(...parsed.warnings.map((i) => finding(def, "warning", i)));
    return { findings, canPublish: false };
  }
  findings.push(...parsed.warnings.map((i) => finding(def, "warning", i)));

  if (!def.blocks.some((b) => b.kind === "field")) {
    findings.push({ level: "error", message: "Add at least one question.", code: "no-questions" });
  }
  // Numbered as the builder's outline numbers them: questions only, not headings or page breaks.
  let number = 0;
  def.blocks.forEach((b) => {
    if (b.kind !== "field") return;
    number += 1;
    // An error: a new question starts without a title, and respondents would see a blank one.
    if (!b.label.trim()) {
      findings.push({ level: "error", message: `Question ${number} needs a title.`, ref: { kind: "block", id: b.id }, code: "untitled-question" });
    }
    const blank = choiceOptions(b).filter((o) => !(o.label ?? o.value).trim()).length;
    if (blank) {
      findings.push({
        level: "warning",
        message: `${blank === 1 ? "An option" : `${blank} options`} of "${b.label || b.key}" ${blank === 1 ? "has" : "have"} no label.`,
        ref: { kind: "block", id: b.id },
      });
    }
    const from = optionsSource(b);
    if (from && !opts.hostOptions?.some((l) => l.key === from.key)) {
      findings.push({
        level: "warning",
        message: `"${b.label || b.key}" takes its options from the app's list "${from.key}", which this app doesn't offer, so it shows only its own options.`,
        ref: { kind: "block", id: b.id },
      });
    }
  });
  for (const e of def.endings ?? []) {
    if (!e.title.trim()) findings.push({ level: "warning", message: `The ending "${e.id}" has no title.`, ref: { kind: "ending", id: e.id } });
  }

  // Questions with options from the app are explored with the host's sample options.
  const report = cachedCoverage(withHostOptions(def, sampleHostOptions(opts.hostOptions)), opts.maxStates ?? 2000);
  if (report.truncated) {
    findings.push({
      level: "info",
      message: "The form has too many paths to check them all, so unreachable questions, endings and rules are not reported.",
      code: "paths-not-checked",
    });
    return { findings, canPublish: !findings.some((f) => f.level === "error"), coverage: report };
  }
  const idByKey = new Map(def.blocks.map((b) => [b.kind === "field" ? b.key : b.id, b.id]));
  for (const key of report.unreachableBlocks) {
    const id = idByKey.get(key) ?? key;
    findings.push({ level: "warning", message: `No respondent can reach "${key}": a jump always skips it or logic always hides it.`, ref: { kind: "block", id }, code: "unreachable-block" });
  }
  for (const id of report.rulesNeverFired) {
    findings.push({ level: "warning", message: "This rule's condition is never true for any respondent, so it has no effect.", ref: { kind: "rule", id }, code: "rule-never-fires" });
  }
  for (const [id, e] of Object.entries(report.endings)) {
    if (!e.reached && !e.needsSamples) {
      findings.push({ level: "warning", message: `No respondent can reach the ending "${def.endings?.find((x) => x.id === id)?.title ?? id}".`, ref: { kind: "ending", id }, code: "unreachable-ending" });
    }
  }
  return { findings, canPublish: !findings.some((f) => f.level === "error"), coverage: report };
}
