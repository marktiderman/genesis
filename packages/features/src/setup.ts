/**
 * `@marktiderman/genesis-config/setup`: what a guided setup step is (config-layer design §3.2, R5).
 * A step walks a person through an outside service (Supabase, GitHub, Sentry, Resend, an AI
 * provider, EAS): what to do there, the values it needs, the secrets it needs by name, and the
 * links to open. The CLI's runners (`genesis setup --step <id>`, the wizard's Guided steps tab) do
 * the installs and the test call that proves the step done.
 *
 * Data only: no zod, no React, no Node built-ins. A secret is named here, never held: the value
 * is typed into the CLI or the wizard when the step runs, and reaches a tool on stdin only.
 *
 * @stability Beta
 */

/** A setup step id: `github.issues`, `ai.key-budget`. @stability Beta */
export const SETUP_STEP_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;

/** One value a step asks for. Never a secret: those are {@link SetupStepDef.needs}. @stability Beta */
export interface SetupField {
  /** `repo`, `projectRef`. */
  name: string;
  label: string;
  /** What a valid value looks like, as a regular expression source (anchored by the reader). */
  pattern?: string;
  /** Shown under the field: what goes here and where to find it. */
  help?: string;
  placeholder?: string;
  optional?: boolean;
  /**
   * The setting this value is saved to, by its last segment (`githubRepo`): the key in the app's
   * catalogue that names this step (`setup: "<id>"`) and ends in `.<setting>`. Not declared by an
   * installed package, the value is used for this run only.
   */
  setting?: string;
}

/** A page the person opens in the outside service. @stability Beta */
export interface SetupLink {
  label: string;
  url: string;
}

/** A secret the step needs, by name, and where it is kept. @stability Beta */
export interface SetupSecret {
  name: string;
  /** `edge` (Supabase Edge Function secrets) or `ci` (GitHub Actions; EAS by hand). */
  store: "edge" | "ci";
  /** Where the person gets it. */
  help?: string;
}

/** A guided setup step. @stability Beta */
export interface SetupStepDef {
  readonly id: string;
  readonly title: string;
  /** The package it belongs to, when one does (`@marktiderman/genesis-support`). */
  readonly package?: string;
  /** The secrets it sets. */
  readonly needs: readonly SetupSecret[];
  /** The tools the CLI runs for it (`supabase`, `gh`, `eas`). */
  readonly tools: readonly string[];
  readonly fields: readonly SetupField[];
  readonly links: readonly SetupLink[];
  /** What the person does in the outside service, in order. */
  readonly instructions: readonly string[];
  /** Nothing runs: the step is the instructions, and its verify. */
  readonly manual?: boolean;
}

/** What {@link defineSetupStep} takes. @stability Beta */
export interface SetupStepSpec {
  id: string;
  title: string;
  package?: string;
  needs?: readonly SetupSecret[];
  tools?: readonly string[];
  fields?: readonly SetupField[];
  links?: readonly SetupLink[];
  instructions: readonly string[];
  manual?: boolean;
}

/** A step definition that can't be used. @stability Beta */
export class SetupStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupStepError";
  }
}

const FIELD_NAME = /^[a-z][a-zA-Z0-9]*$/;
const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const TOOL = /^[a-z][a-z0-9-]*$/;

/**
 * Declare a guided setup step: checked and frozen. Throws {@link SetupStepError} when it can't be used.
 *
 * ```ts
 * export const githubIssues = defineSetupStep({
 *   id: "github.issues",
 *   title: "Open a GitHub issue for each report",
 *   needs: [{ name: "GITHUB_TOKEN", store: "edge" }],
 *   fields: [{ name: "repo", label: "Repository (owner/name)", pattern: "[A-Za-z0-9-]+/[A-Za-z0-9._-]+", setting: "githubRepo" }],
 *   links: [{ label: "New fine-grained token", url: "https://github.com/settings/personal-access-tokens/new" }],
 *   instructions: ["Make a fine-grained token for that one repository, with Issues: Read and write."],
 * });
 * ```
 *
 * @stability Beta
 */
export function defineSetupStep(spec: SetupStepSpec): SetupStepDef {
  const fail = (msg: string): never => {
    throw new SetupStepError(`defineSetupStep(${JSON.stringify(spec?.id)}): ${msg}`);
  };
  if (!spec || typeof spec !== "object") fail("takes an object");
  if (typeof spec.id !== "string" || !SETUP_STEP_ID_PATTERN.test(spec.id)) fail(`id must look like "github.issues"`);
  if (typeof spec.title !== "string" || !spec.title.trim()) fail("needs a title");
  if (!Array.isArray(spec.instructions) || !spec.instructions.length || spec.instructions.some((i) => typeof i !== "string" || !i.trim())) fail("needs at least one instruction");
  const names = new Set<string>();
  for (const f of spec.fields ?? []) {
    if (!f || typeof f.name !== "string" || !FIELD_NAME.test(f.name)) fail(`a field's name must be camelCase (got ${JSON.stringify(f?.name)})`);
    if (names.has(f.name)) fail(`two fields are named ${f.name}`);
    names.add(f.name);
    if (typeof f.label !== "string" || !f.label.trim()) fail(`field ${f.name} needs a label`);
    if (f.pattern !== undefined) {
      try {
        new RegExp(f.pattern);
      } catch {
        fail(`field ${f.name}'s pattern isn't a regular expression`);
      }
    }
    if (f.setting !== undefined && !FIELD_NAME.test(f.setting)) fail(`field ${f.name}'s setting must be a key's last segment (camelCase)`);
  }
  for (const s of spec.needs ?? []) {
    if (!s || typeof s.name !== "string" || !SECRET_NAME.test(s.name)) fail(`a secret's name must be UPPER_CASE (got ${JSON.stringify(s?.name)})`);
    if (s.store !== "edge" && s.store !== "ci") fail(`secret ${s.name}'s store must be edge or ci`);
  }
  for (const t of spec.tools ?? []) if (typeof t !== "string" || !TOOL.test(t)) fail(`a tool must be a program name (got ${JSON.stringify(t)})`);
  for (const l of spec.links ?? []) if (!l || typeof l.label !== "string" || typeof l.url !== "string" || !/^https:\/\//.test(l.url)) fail("a link needs a label and an https URL");
  const def: SetupStepDef = {
    id: spec.id,
    title: spec.title,
    ...(spec.package ? { package: spec.package } : {}),
    needs: Object.freeze((spec.needs ?? []).map((s) => Object.freeze({ ...s }))),
    tools: Object.freeze([...(spec.tools ?? [])]),
    fields: Object.freeze((spec.fields ?? []).map((f) => Object.freeze({ ...f }))),
    links: Object.freeze((spec.links ?? []).map((l) => Object.freeze({ ...l }))),
    instructions: Object.freeze([...spec.instructions]),
    ...(spec.manual ? { manual: true } : {}),
  };
  return Object.freeze(def);
}

/**
 * Check the values a person typed for a step's fields: each known, each matching its pattern
 * (whole value), each required one present. Returns the trimmed values; throws {@link SetupStepError}.
 *
 * @stability Beta
 */
export function checkSetupFields(step: SetupStepDef, input: unknown): Record<string, string> {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) throw new SetupStepError(`${step.id}: the fields must be an object`);
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const name of Object.keys(raw)) if (!step.fields.some((f) => f.name === name)) throw new SetupStepError(`${step.id} has no field ${JSON.stringify(name).slice(0, 60)}`);
  for (const f of step.fields) {
    const v = raw[f.name];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      if (!f.optional) throw new SetupStepError(`${step.id}: ${f.label} is required`);
      continue;
    }
    if (typeof v !== "string" || v.length > 500) throw new SetupStepError(`${step.id}: ${f.label} must be text`);
    const value = v.trim();
    if (f.pattern !== undefined && !new RegExp(`^(?:${f.pattern})$`).test(value)) throw new SetupStepError(`${step.id}: ${f.label} doesn't look right${f.placeholder ? ` (like ${f.placeholder})` : ""}`);
    out[f.name] = value;
  }
  return out;
}
