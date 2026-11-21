/**
 * Genesis's branch-protection standard (docs/APP-CI.md, "Branch protection"): the GitHub rulesets
 * and merge settings every Genesis app's repository carries, and the plan that converges a
 * repository on them. Pure: the live state comes in, the changes and the API writes go out
 * (./github.ts reads and writes them through `gh`).
 *
 * - **The default branch** (ruleset `default`, `~DEFAULT_BRANCH`): no deletion, no force push, a
 *   pull request with every review thread resolved (no approval count: the approval is the
 *   adversarial review gate's check), merge or squash only, and the app's required checks.
 * - **Staging batches** (ruleset `staging-branches`, `refs/heads/staging/**` + `/*`), when the app
 *   releases through them: no deletion, no force push, the checks that run on pull requests into
 *   a batch, not enforced when a batch is cut.
 * - **Both** let the repository's admin role bypass ("always"): the one way a merged batch is
 *   deleted with the rules left on, `genesis repo prune-staging`.
 * - **Merge settings**: delete head branches on merge, auto-merge on, rebase merging off.
 *
 * Converging never fights what a repository already has: a rule, a parameter, a bypass actor or a
 * required check Genesis doesn't name is kept. The one exception is a required check that can
 * never report on some pull requests (its workflow is path-filtered), which would hold them forever.
 */

/** GitHub Actions' app id: required checks are pinned to it, so another app can't satisfy one. */
export const GITHUB_ACTIONS_APP_ID = 15368;
/** The repository role id of "admin". */
export const REPOSITORY_ADMIN_ROLE_ID = 5;
export const DEFAULT_RULESET = "default";
export const STAGING_RULESET = "staging-branches";
export const DEFAULT_BRANCH_REF = "~DEFAULT_BRANCH";
export const STAGING_REF = "refs/heads/staging/**/*";

export interface RequiredCheck {
  context: string;
  integration_id?: number;
}

export interface RulesetRule {
  type: string;
  parameters?: Record<string, unknown>;
}

export interface BypassActor {
  actor_id: number | null;
  actor_type: string;
  bypass_mode: string;
}

/** A branch ruleset as the rulesets API reads and writes it (the fields Genesis touches). */
export interface Ruleset {
  id?: number;
  name: string;
  target: string;
  enforcement: string;
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: RulesetRule[];
  bypass_actors: BypassActor[];
  /** Read only: whether the signed-in account can bypass it. */
  current_user_can_bypass?: string;
}

/** The repository settings Genesis sets. */
export interface MergeSettings {
  delete_branch_on_merge: boolean;
  allow_auto_merge: boolean;
  allow_rebase_merge: boolean;
  allow_merge_commit: boolean;
}

export const MERGE_SETTINGS: Readonly<MergeSettings> = Object.freeze({
  delete_branch_on_merge: true,
  allow_auto_merge: true,
  allow_rebase_merge: false,
  allow_merge_commit: true,
});

/** What the plan compares against: the repository as it is. */
export interface LiveRepo {
  slug: string;
  defaultBranch: string;
  settings: Partial<MergeSettings>;
  /** The repository's own rulesets (not an organization's). */
  rulesets: Ruleset[];
}

/** A check that can't report on every pull request, so requiring it would hold some forever. */
export interface ConditionalCheck {
  context: string;
  why: string;
}

/** What {@link protectionSpec} builds from. */
export interface SpecInput {
  /** The default branch's required checks. */
  defaultChecks: readonly string[];
  /** The staging batches' required checks; null when the app doesn't release through batches. */
  stagingChecks: readonly string[] | null;
}

export interface ProtectionSpec {
  rulesets: Ruleset[];
  settings: MergeSettings;
}

const ADMIN_BYPASS: BypassActor = { actor_id: REPOSITORY_ADMIN_ROLE_ID, actor_type: "RepositoryRole", bypass_mode: "always" };

const pinned = (contexts: readonly string[]): RequiredCheck[] => [...new Set(contexts)].map((context) => ({ context, integration_id: GITHUB_ACTIONS_APP_ID }));

function statusChecksRule(contexts: readonly string[], skipOnCreate: boolean): RulesetRule[] {
  if (!contexts.length) return [];
  return [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: false, do_not_enforce_on_create: skipOnCreate, required_status_checks: pinned(contexts) } }];
}

/** The rulesets and settings Genesis wants, for these checks. */
export function protectionSpec(input: SpecInput): ProtectionSpec {
  const rulesets: Ruleset[] = [
    {
      name: DEFAULT_RULESET,
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: [DEFAULT_BRANCH_REF], exclude: [] } },
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "pull_request",
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: true,
            allowed_merge_methods: ["merge", "squash"],
          },
        },
        ...statusChecksRule(input.defaultChecks, false),
      ],
      bypass_actors: [{ ...ADMIN_BYPASS }],
    },
  ];
  if (input.stagingChecks) {
    rulesets.push({
      name: STAGING_RULESET,
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: [STAGING_REF], exclude: [] } },
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }, ...statusChecksRule(input.stagingChecks, true)],
      bypass_actors: [{ ...ADMIN_BYPASS }],
    });
  }
  return { rulesets, settings: { ...MERGE_SETTINGS } };
}

/** One difference between the repository and the standard. */
export interface Change {
  /** `ruleset "default"`, `settings`. */
  scope: string;
  kind: "add" | "remove" | "change";
  what: string;
  why?: string;
}

/** One API call that makes the repository match. */
export interface Write {
  method: "POST" | "PUT" | "PATCH";
  /** `repos/<owner>/<name>/rulesets/<id>`. */
  path: string;
  body: Record<string, unknown>;
}

export interface ProtectionPlan {
  slug: string;
  changes: Change[];
  writes: Write[];
  /** Said, not changed: checks kept that CI doesn't name, CI the plan couldn't read. */
  notes: string[];
}

export interface PlanOptions {
  /** Checks to drop wherever a ruleset requires them. */
  conditional?: readonly ConditionalCheck[];
  /** Rulesets whose check list is exact (`repo.requiredChecks`): drop the checks it doesn't name. Default: keep them. */
  exact?: readonly string[];
}

const sameSet = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && JSON.stringify([...a].map(String).sort()) === JSON.stringify([...b].map(String).sort());

function equalValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => typeof x !== "object") && b.every((x) => typeof x !== "object")) return sameSet(a, b);
  return JSON.stringify(a) === JSON.stringify(b);
}

const show = (v: unknown) => (Array.isArray(v) ? `[${v.join(", ")}]` : JSON.stringify(v));

/** The live ruleset a spec ruleset converges: the one of that name, else one aimed at the same refs. */
export function matchRuleset(spec: Ruleset, live: readonly Ruleset[]): Ruleset | undefined {
  return (
    live.find((r) => r.name === spec.name && r.target === spec.target) ??
    live.find((r) => r.target === spec.target && spec.conditions.ref_name.include.every((i) => r.conditions?.ref_name?.include?.includes(i)))
  );
}

/** The body the rulesets API takes (PUT or POST). */
export function rulesetBody(r: Ruleset): Record<string, unknown> {
  return { name: r.name, target: r.target, enforcement: r.enforcement, conditions: r.conditions, rules: r.rules, bypass_actors: r.bypass_actors };
}

function convergeChecks(scope: string, ruleset: string, live: RulesetRule, want: RulesetRule, options: PlanOptions, changes: Change[], notes: string[]): RulesetRule {
  const params = { ...(live.parameters ?? {}) };
  const have = ((params.required_status_checks as RequiredCheck[] | undefined) ?? []).map((c) => ({ ...c }));
  const wanted = (want.parameters!.required_status_checks as RequiredCheck[]).map((c) => ({ ...c }));
  const conditional = new Map((options.conditional ?? []).map((c) => [c.context, c.why]));
  const out: RequiredCheck[] = [];
  for (const c of have) {
    const why = conditional.get(c.context);
    if (why) {
      changes.push({ scope, kind: "remove", what: `required check "${c.context}"`, why });
      continue;
    }
    const w = wanted.find((x) => x.context === c.context);
    if (!w) {
      if (options.exact?.includes(ruleset)) {
        changes.push({ scope, kind: "remove", what: `required check "${c.context}"`, why: "repo.requiredChecks doesn't list it" });
        continue;
      }
      notes.push(`${scope}: kept the required check "${c.context}", which the app's CI doesn't name (list it in repo.requiredChecks, or remove it)`);
      out.push(c);
      continue;
    }
    if (c.integration_id !== w.integration_id) {
      changes.push({ scope, kind: "change", what: `required check "${c.context}": pinned to GitHub Actions (app ${w.integration_id})`, why: "unpinned, any app that posts a status of that name satisfies it" });
    }
    out.push(w);
  }
  for (const w of wanted) {
    if (out.some((c) => c.context === w.context) || conditional.has(w.context)) continue;
    changes.push({ scope, kind: "add", what: `required check "${w.context}"` });
    out.push(w);
  }
  for (const key of ["strict_required_status_checks_policy", "do_not_enforce_on_create"]) {
    if (!equalValue(params[key], want.parameters![key])) {
      if (params[key] !== undefined) changes.push({ scope, kind: "change", what: `required_status_checks.${key}: ${show(params[key])} → ${show(want.parameters![key])}` });
      params[key] = want.parameters![key];
    }
  }
  params.required_status_checks = out;
  return { ...live, parameters: params };
}

function copyRuleset(r: Ruleset): Ruleset {
  return {
    ...r,
    conditions: { ref_name: { include: [...(r.conditions?.ref_name?.include ?? [])], exclude: [...(r.conditions?.ref_name?.exclude ?? [])] } },
    rules: (r.rules ?? []).map((x) => ({ ...x, ...(x.parameters ? { parameters: { ...x.parameters } } : {}) })),
    bypass_actors: (r.bypass_actors ?? []).map((b) => ({ ...b })),
  };
}

function convergeRuleset(want: Ruleset, live: Ruleset, options: PlanOptions, changes: Change[], notes: string[]): Ruleset {
  const scope = `ruleset "${live.name}"`;
  const next = copyRuleset(live);
  if (live.enforcement !== want.enforcement) {
    changes.push({ scope, kind: "change", what: `enforcement: ${live.enforcement} → ${want.enforcement}` });
    next.enforcement = want.enforcement;
  }
  for (const inc of want.conditions.ref_name.include) {
    if (next.conditions.ref_name.include.includes(inc)) continue;
    changes.push({ scope, kind: "add", what: `target ${inc}` });
    next.conditions.ref_name.include.push(inc);
  }
  for (const rule of want.rules) {
    const i = next.rules.findIndex((r) => r.type === rule.type);
    if (rule.type === "required_status_checks") {
      if (i < 0) changes.push({ scope, kind: "add", what: "rule required_status_checks" });
      const base = i < 0 ? { type: rule.type, parameters: { required_status_checks: [] } } : next.rules[i]!;
      const merged = convergeChecks(scope, want.name, base, rule, options, changes, notes);
      if (i < 0) next.rules.push(merged);
      else next.rules[i] = merged;
      continue;
    }
    if (i < 0) {
      changes.push({ scope, kind: "add", what: `rule ${rule.type}` });
      next.rules.push({ ...rule, ...(rule.parameters ? { parameters: { ...rule.parameters } } : {}) });
      continue;
    }
    if (!rule.parameters) continue;
    const params = { ...(next.rules[i]!.parameters ?? {}) };
    for (const [key, value] of Object.entries(rule.parameters)) {
      if (equalValue(params[key], value)) continue;
      changes.push({ scope, kind: "change", what: `${rule.type}.${key}: ${params[key] === undefined ? "unset" : show(params[key])} → ${show(value)}` });
      params[key] = value;
    }
    next.rules[i] = { ...next.rules[i]!, parameters: params };
  }
  for (const actor of want.bypass_actors) {
    const j = next.bypass_actors.findIndex((b) => b.actor_type === actor.actor_type && b.actor_id === actor.actor_id);
    if (j < 0) {
      changes.push({ scope, kind: "add", what: `bypass: the repository admin role (${actor.bypass_mode})`, why: "the sanctioned way to delete a merged branch with the rules on: genesis repo prune-staging" });
      next.bypass_actors.push({ ...actor });
    } else if (next.bypass_actors[j]!.bypass_mode !== actor.bypass_mode) {
      changes.push({ scope, kind: "change", what: `bypass mode of the repository admin role: ${next.bypass_actors[j]!.bypass_mode} → ${actor.bypass_mode}` });
      next.bypass_actors[j] = { ...actor };
    }
  }
  return next;
}

/** What it takes to bring `live` to `spec`: the changes, said, and the writes that make them. */
export function planProtection(spec: ProtectionSpec, live: LiveRepo, options: PlanOptions = {}): ProtectionPlan {
  const changes: Change[] = [];
  const writes: Write[] = [];
  const notes: string[] = [];
  const conditional = new Set((options.conditional ?? []).map((c) => c.context));
  for (const want of spec.rulesets) {
    const found = matchRuleset(want, live.rulesets);
    if (!found) {
      const rules = want.rules
        .map((r) => (r.type === "required_status_checks" ? { ...r, parameters: { ...r.parameters, required_status_checks: (r.parameters!.required_status_checks as RequiredCheck[]).filter((c) => !conditional.has(c.context)) } } : r))
        .filter((r) => r.type !== "required_status_checks" || (r.parameters!.required_status_checks as RequiredCheck[]).length > 0);
      const listed = rules.find((r) => r.type === "required_status_checks")?.parameters?.required_status_checks as RequiredCheck[] | undefined;
      changes.push({
        scope: `ruleset "${want.name}"`,
        kind: "add",
        what: `new ruleset on ${want.conditions.ref_name.include.join(", ")}: ${rules.map((r) => r.type).join(", ")}${listed?.length ? ` (checks: ${listed.map((c) => c.context).join(", ")})` : ""}; the admin role bypasses`,
      });
      writes.push({ method: "POST", path: `repos/${live.slug}/rulesets`, body: rulesetBody({ ...want, rules }) });
      continue;
    }
    const before = changes.length;
    const next = convergeRuleset(want, found, options, changes, notes);
    if (changes.length > before && found.id !== undefined) writes.push({ method: "PUT", path: `repos/${live.slug}/rulesets/${found.id}`, body: rulesetBody(next) });
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec.settings)) {
    const have = (live.settings as Record<string, unknown>)[key];
    if (have === value) continue;
    changes.push({ scope: "settings", kind: "change", what: `${key}: ${have === undefined ? "unknown" : show(have)} → ${show(value)}` });
    patch[key] = value;
  }
  if (Object.keys(patch).length) writes.push({ method: "PATCH", path: `repos/${live.slug}`, body: patch });
  return { slug: live.slug, changes, writes, notes };
}

const MARK = { add: "+", remove: "-", change: "~" } as const;

/** The plan as a person reads it, one change a line, grouped by what it changes. */
export function formatPlan(plan: ProtectionPlan, options: { dryRun?: boolean } = {}): string {
  const n = plan.changes.length;
  const lines = [`${plan.slug}: ${n ? `${n} change${n === 1 ? "" : "s"}${options.dryRun ? " (dry run: nothing written)" : ""}` : "matches the Genesis standard"}`];
  for (const scope of [...new Set(plan.changes.map((c) => c.scope))]) {
    lines.push(`  ${scope}`);
    for (const c of plan.changes.filter((x) => x.scope === scope)) lines.push(`    ${MARK[c.kind]} ${c.what}${c.why ? ` (${c.why})` : ""}`);
  }
  for (const note of plan.notes) lines.push(`  note: ${note}`);
  return lines.join("\n");
}
