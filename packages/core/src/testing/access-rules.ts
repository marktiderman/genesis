// ---------------------------------------------------------------------------
// Access-rule tests (docs/DATA-ACCESS.md, "Test every function's access rule")
//
// Every database function a resource writes through (`writes`, `actions`) or reads through
// (`source: { rpc }`) holds an access rule: who may call it. `accessRules` turns one function's
// rule into test cases, one per person: each allowed person's call must act, each refused
// person's call must be refused. Runner-neutral: register the cases with vitest, jest or
// node:test. The doctor's `data/access-rule-tests` rule finds a declared function without one.
// ---------------------------------------------------------------------------

import { toDataWriteError } from "../provider/postgrest-errors";
import { ContractError, isRefusal } from "./index";

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
          if (isRefusal(toDataWriteError(error))) return;
          throw new ContractError(`${spec.fn} failed for ${who} with an error that isn't a refusal: ${describe(error)}`);
        }
        if (acted(data)) throw new ContractError(`${spec.fn} acted for ${who}, who should be refused.`);
      },
    }),
  );
  return [...allowed, ...refused];
}
