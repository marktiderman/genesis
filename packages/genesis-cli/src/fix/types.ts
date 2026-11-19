/**
 * The fix engine's model: every doctor rule declares how its findings are fixed (config-layer
 * design §7.2, "the doctor finds the gaps, the wizard solves them").
 *
 * - A **Fix** covers one or more rules. `plan` reads the app and returns what it would change; it
 *   writes nothing. `apply` runs the in-process part of a plan (a `genesis` command); the engine
 *   writes the plan's files itself. `verify` says whether the findings are gone.
 * - A **FixPlan** is data: the files it writes (each with the hash of what it expects to find),
 *   the commands it runs, the secrets it needs by name, and what is left to a person. Its `hash`
 *   is a canonical sha256 of the rest, so `genesis fix <id> --expect <hash>` applies exactly the
 *   plan someone read, and a plan that went stale is refused. Plans are never written to disk.
 */
import type { Finding, FixKind, FixRef } from "../doctor/types.js";

export type { FixKind, FixRef };

/** One file a plan writes: the whole new text, and the sha256 of the text it replaces (null: the file doesn't exist yet). */
export interface PlannedFile {
  /** App-relative, POSIX separators. Never absolute, never outside the app. */
  path: string;
  beforeHash: string | null;
  content: string;
  why: string;
}

/**
 * One command a plan runs. `tool` is an allowlisted program (src/exec/run.ts), run with an argv
 * array, never a shell; or `genesis`, which the fix runs in-process in its `apply`.
 */
export interface PlannedCommand {
  tool: string;
  args: string[];
  /** The name of a secret written to the command's stdin. Never in argv, never in the plan's text. */
  stdinSecret?: string;
  why: string;
}

/** What a fix's `plan` returns; the engine adds `fixId` and `hash`. */
export interface FixPlanDraft {
  /** One line: what applying it does. */
  summary: string;
  files?: PlannedFile[];
  commands?: PlannedCommand[];
  /** Secrets the commands need, by name only. */
  secrets?: string[];
  /** What a person does: the whole fix for a manual one, the rest of it for a guided one. */
  manual?: string;
}

export interface FixPlan {
  fixId: string;
  summary: string;
  files: PlannedFile[];
  commands: PlannedCommand[];
  secrets: string[];
  manual?: string;
  /** sha256 of the canonical JSON of everything above. */
  hash: string;
}

/** What a fix is given. */
export interface FixContext {
  /** The app root. */
  root: string;
  /** The findings this fix covers in this run (their `fix.id` is this fix's). */
  findings: readonly Finding[];
  /** Whether the fix may reach the network (npm, the registry). Off in tests and `--offline`. */
  network?: boolean;
  log?: (message: string) => void;
  /** Re-run the doctor for these rules (the default verify). The CLI passes it. */
  recheck?: (rules: readonly string[]) => Promise<Finding[]>;
}

/** What `apply` is given on top: the secrets the plan names, by name. Held in memory only. */
export interface ApplyContext extends FixContext {
  secrets?: Readonly<Record<string, string>>;
}

/** What a fix's own `apply` did. */
export interface ApplyOutcome {
  /** The commands it ran, as run (`genesis migrate`). */
  ran: string[];
  notes?: string[];
}

export interface VerifyResult {
  ok: boolean;
  /** The findings still there, when the fix's rules were re-checked. */
  remaining?: Finding[];
  message?: string;
}

export interface Fix {
  /** Unique: `codemod.scope-names`, `upgrade.release`; a package's are namespaced (`ui/…`). */
  id: string;
  kind: FixKind;
  /** The rules whose findings it fixes. */
  rules: string[];
  title: string;
  /** Narrow it to some of a rule's findings (the rest fall to the next fix, or `manual:<rule>`). */
  appliesTo?(finding: Finding, context: { root: string }): boolean;
  /** Read the app and say what applying would change. Writes nothing. */
  plan(context: FixContext): FixPlanDraft | Promise<FixPlanDraft>;
  /**
   * Run the plan's commands, when they run in-process (`genesis upgrade`, `genesis migrate`).
   * Without it the engine runs them through src/exec/run.ts. Files are written before this runs.
   * Returns what it actually ran and notes for the person (a pull request's URL, say).
   *
   * It must never start a child process that inherits stdin or stdout (`stdio: "inherit"`): under
   * `genesis mcp` those are the protocol's, and a child writing to fd 1 corrupts it. Pipe the
   * child's output and pass it on through `context.log`. (`genesis mcp` also guards every
   * child_process call while it serves: src/mcp/stdio.ts.)
   */
  apply?(plan: FixPlan, context: ApplyContext): Promise<ApplyOutcome | void> | ApplyOutcome | void;
  /** Whether it worked. Default: re-check the fix's rules (`context.recheck`), else that the files hold what the plan wrote. */
  verify?(context: FixContext): VerifyResult | Promise<VerifyResult>;
  /** The wizard step that carries a guided fix (`genesis setup --step <id>`), when there is one. */
  step?: string;
}

/** The ref a manual fix gets for a rule nothing fixes. */
export const manualFixId = (rule: string) => `manual:${rule}`;
