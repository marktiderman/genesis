// ---------------------------------------------------------------------------
// Access-rule tests (docs/DATA-ACCESS.md, "Test every function's access rule")
//
// Every database function a resource writes through (`writes`, `actions`) or reads through
// (`source: { rpc }`) holds an access rule: who may call it. `accessRules` turns one function's
// rule into test cases, one per person: each allowed person's call must act, each refused
// person's call must be refused. Runner-neutral: register the cases with vitest, jest or
// node:test. `expectAccessRulesCover` fails for a declared function whose name is missing from the
// specs it is given (a name check: pass it the specs the cases are registered from), and the
// doctor's `data/access-rule-tests` rule checks that some test calls it.
// ---------------------------------------------------------------------------

import { toDataWriteError } from "../provider/postgrest-errors";
import type { SupabaseProviderOptions } from "../provider/supabase-provider";
import { ContractError } from "./index";

/** The part of a Supabase client an access-rule test calls: any real client's `rpc` fits. */
export interface AccessRuleClient {
  rpc(fn: string, args?: Record<string, unknown>): unknown;
}

/** One function's access rule: who may call it, who may not, and the arguments for a call. */
export interface AccessRuleSpec<Who extends string> {
  /** The database function under test, as the resource declares it. */
  readonly fn: string;
  /** A client signed in as `who`: the app's own test people (a local stack's seeded logins, say). */
  readonly as: (who: Who) => AccessRuleClient | Promise<AccessRuleClient>;
  /**
   * The arguments for one call by `who`, made fresh for each case (a row of its own to change, so
   * one allowed call never changes what the next case sees).
   */
  readonly args: (who: Who) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Who may call it. At least one: a rule that admits no one tests nothing. */
  readonly allowed: readonly Who[];
  /** Who may not. At least one: a rule that refuses no one is not a rule. */
  readonly refused: readonly Who[];
  /**
   * Whether a call's answer shows it acted. Default: anything but `null`, `false` or an empty list,
   * the same answers the provider reads as "no row matched".
   */
  readonly acted?: (data: unknown) => boolean;
}

/** One test case: register it as `test(c.name, c.run)`. */
export interface AccessRuleCase<Who extends string = string> {
  readonly name: string;
  readonly who: Who;
  readonly expect: "allowed" | "refused";
  run(): Promise<void>;
}

/**
 * Whether an error is the function refusing: insufficient privilege (42501), a guard's raise
 * (P0001), or another forbidden answer. Not a failed sign-in (an expired or malformed token): that
 * never reached the rule, so it proves nothing about it.
 */
function refusedByRule(error: unknown): boolean {
  const mapped = toDataWriteError(error);
  if (mapped.code === "42501" || mapped.code === "P0001") return true;
  return mapped.outcome === "forbidden";
}

const answeredSomething = (data: unknown): boolean =>
  !(data === null || data === undefined || data === false || (Array.isArray(data) && data.length === 0));

/**
 * The test cases for one function's access rule. An allowed person's call must succeed and act; a
 * refused person's call must be refused (an insufficient-privilege or guard error, 42501 or P0001)
 * or act on nothing. Any other error fails the case, so a wrong name or wrong arguments can't pass
 * as a refusal, and the allowed cases prove the same arguments do work.
 *
 * ```ts
 * for (const c of accessRules({
 *   fn: "save_task",
 *   as: (who) => signedIn(who),
 *   args: async () => ({ p_id: await newTask(), p_values: { title: "Renamed" } }),
 *   allowed: ["owner", "admin"],
 *   refused: ["member", "stranger"],
 * })) test(c.name, c.run);
 * ```
 */
export function accessRules<Who extends string>(spec: AccessRuleSpec<Who>): AccessRuleCase<Who>[] {
  if (!spec.fn.trim()) throw new ContractError("accessRules needs the function's name (fn).");
  if (spec.allowed.length === 0) {
    throw new ContractError(`accessRules(${spec.fn}): name at least one person who may call it (allowed).`);
  }
  if (spec.refused.length === 0) {
    throw new ContractError(`accessRules(${spec.fn}): name at least one person who may not call it (refused).`);
  }
  const both = spec.allowed.filter((who) => spec.refused.includes(who));
  if (both.length > 0) {
    throw new ContractError(`accessRules(${spec.fn}): ${both.join(", ")} is both allowed and refused.`);
  }
  const acted = spec.acted ?? answeredSomething;

  const call = async (who: Who): Promise<{ data: unknown; error: unknown }> => {
    const client = await spec.as(who);
    const args = await spec.args(who);
    try {
      return (await client.rpc(spec.fn, args)) as { data: unknown; error: unknown };
    } catch (error) {
      return { data: null, error };
    }
  };
  const describe = (error: unknown): string => {
    const mapped = toDataWriteError(error);
    return `${mapped.outcome}${mapped.code ? ` (${mapped.code})` : ""}: ${mapped.message}`;
  };

  const allowed = spec.allowed.map(
    (who): AccessRuleCase<Who> => ({
      name: `${spec.fn}: ${who} may call it`,
      who,
      expect: "allowed",
      async run() {
        const { data, error } = await call(who);
        if (error) throw new ContractError(`${spec.fn} refused ${who}, who should be allowed: ${describe(error)}`);
        if (!acted(data)) throw new ContractError(`${spec.fn} acted on nothing for ${who}, who should be allowed.`);
      },
    }),
  );
  const refused = spec.refused.map(
    (who): AccessRuleCase<Who> => ({
      name: `${spec.fn}: ${who} is refused`,
      who,
      expect: "refused",
      async run() {
        const { data, error } = await call(who);
        if (error) {
          if (refusedByRule(error)) return;
          throw new ContractError(`${spec.fn} failed for ${who} with an error that isn't a refusal: ${describe(error)}`);
        }
        if (acted(data)) throw new ContractError(`${spec.fn} acted for ${who}, who should be refused.`);
      },
    }),
  );
  return [...allowed, ...refused];
}

// ---------------------------------------------------------------------------
// Coverage: every function the provider declares has an access-rule test
// ---------------------------------------------------------------------------

/** One database function a Supabase resource declares, read from the provider's options. */
export interface DeclaredFunction {
  /** The resource that declares it, as `resources` names it. */
  readonly resource: string;
  /** Where: a write (`create`, `update`, `delete`), an action (its name), or the read (`source`). */
  readonly use: "create" | "update" | "delete" | "source" | `action:${string}`;
  /** The database function's name. */
  readonly fn: string;
}

/** The name a `FunctionCall` calls: the string itself, or its `fn`. */
const fnOf = (call: string | { readonly fn: string }): string => (typeof call === "string" ? call : call.fn);

/**
 * Every database function the provider's resources declare: their `writes`, their `actions` and a
 * `source: { rpc }`. Read from the options themselves, so nothing a resource declares is missed and
 * nothing else is counted.
 */
export function declaredFunctions(options: Pick<SupabaseProviderOptions, "resources">): DeclaredFunction[] {
  const out: DeclaredFunction[] = [];
  for (const [resource, config] of Object.entries(options.resources ?? {})) {
    for (const use of ["create", "update", "delete"] as const) {
      const call = config.writes?.[use];
      if (call) out.push({ resource, use, fn: fnOf(call) });
    }
    for (const [name, call] of Object.entries(config.actions ?? {})) out.push({ resource, use: `action:${name}`, fn: fnOf(call) });
    if (config.source && typeof config.source === "object") out.push({ resource, use: "source", fn: config.source.rpc });
  }
  return out;
}

/**
 * Fails, naming each one, when a function the provider declares has no spec among `tested`. It
 * compares names only, so pass it the specs the access-rule cases are registered from, with the
 * options the app's provider is made from:
 *
 * ```ts
 * const specs = [saveTask, createTask, archiveTask];
 * for (const spec of specs) for (const c of accessRules(spec)) test(c.name, c.run);
 * test("every declared function has an access-rule test", () => {
 *   expectAccessRulesCover(providerOptions, specs);
 * });
 * ```
 *
 * The doctor's `data/access-rule-tests` rule checks that a test suite calls it.
 */
export function expectAccessRulesCover(
  options: Pick<SupabaseProviderOptions, "resources">,
  tested: readonly (string | { readonly fn: string })[],
): void {
  const covered = new Set(tested.map(fnOf));
  const missing = declaredFunctions(options).filter((d) => !covered.has(d.fn));
  if (missing.length === 0) return;
  const list = missing.map((d) => `${d.fn} (${d.resource} ${d.use})`).join(", ");
  throw new ContractError(
    `No access-rule test for ${missing.length === 1 ? "this declared function" : `these ${missing.length} declared functions`}: ${list}. ` +
      `Give each one accessRules({ fn, allowed, refused, … }) and pass its spec here (docs/DATA-ACCESS.md).`,
  );
}
