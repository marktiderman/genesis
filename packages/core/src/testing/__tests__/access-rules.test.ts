// @feat:declared-data-access
import { describe, expect, it } from "vitest";
import { ContractError } from "../index";
import { accessRules, type AccessRuleClient } from "../access-rules";

type Who = "owner" | "editor" | "viewer" | "stranger";

/** A client whose rpc answers per person from `answers`, recording each call. */
function clients(answers: Record<Who, { data?: unknown; error?: unknown } | (() => never)>) {
  const seen: { who: Who; fn: string; args: unknown }[] = [];
  const as = (who: Who): AccessRuleClient => ({
    rpc(fn, args) {
      seen.push({ who, fn, args });
      const a = answers[who];
      if (typeof a === "function") return Promise.resolve().then(a);
      return Promise.resolve({ data: a.data ?? null, error: a.error ?? null });
    },
  });
  return { as, seen };
}

const refusal = { message: "not allowed", code: "42501" };
const guard = { message: "only editors", code: "P0001" };

const run = async (cases: { name: string; run(): Promise<void> }[]) =>
  Promise.all(cases.map((c) => c.run().then(() => [c.name, "pass"], (e: Error) => [c.name, e.message])));

describe("accessRules", () => {
  it("makes one case per person, allowed then refused, and passes when the rule holds", async () => {
    const { as, seen } = clients({
      owner: { data: "t1" },
      editor: { data: true },
      viewer: { error: refusal },
      stranger: { data: null },
    });
    const cases = accessRules<Who>({
      fn: "save_task",
      as,
      args: (who) => ({ p_id: `row-${who}`, p_values: { title: "x" } }),
      allowed: ["owner", "editor"],
      refused: ["viewer", "stranger"],
    });
    expect(cases.map((c) => [c.name, c.who, c.expect])).toEqual([
      ["save_task: owner may call it", "owner", "allowed"],
      ["save_task: editor may call it", "editor", "allowed"],
      ["save_task: viewer is refused", "viewer", "refused"],
      ["save_task: stranger is refused", "stranger", "refused"],
    ]);
    expect((await run(cases)).map(([, r]) => r)).toEqual(["pass", "pass", "pass", "pass"]);
    // Each case makes its own arguments.
    expect(seen.map((s) => [s.who, s.fn, (s.args as { p_id: string }).p_id])).toEqual([
      ["owner", "save_task", "row-owner"],
      ["editor", "save_task", "row-editor"],
      ["viewer", "save_task", "row-viewer"],
      ["stranger", "save_task", "row-stranger"],
    ]);
  });

  it("a guard error (P0001), a thrown refusal and an empty list count as refused", async () => {
    const { as } = clients({
      owner: { data: [{ id: "t1" }] },
      editor: { error: guard },
      viewer: () => {
        throw refusal;
      },
      stranger: { data: [] },
    });
    const cases = accessRules<Who>({ fn: "f", as, args: () => ({}), allowed: ["owner"], refused: ["editor", "viewer", "stranger"] });
    expect((await run(cases)).map(([, r]) => r)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("fails an allowed person who is refused, or whose call acts on nothing", async () => {
    const { as } = clients({ owner: { error: refusal }, editor: { data: null }, viewer: { error: refusal }, stranger: { error: refusal } });
    const results = await run(
      accessRules<Who>({ fn: "save_task", as, args: () => ({}), allowed: ["owner", "editor"], refused: ["viewer"] }),
    );
    expect(results[0]![1]).toMatch(/save_task refused owner, who should be allowed: forbidden \(42501\)/);
    expect(results[1]![1]).toBe("save_task acted on nothing for editor, who should be allowed.");
  });

  it("fails a refused person whose call acts", async () => {
    const { as } = clients({ owner: { data: "t1" }, editor: { data: "t1" }, viewer: { data: "t1" }, stranger: { data: null } });
    const results = await run(accessRules<Who>({ fn: "save_task", as, args: () => ({}), allowed: ["owner"], refused: ["viewer"] }));
    expect(results[1]![1]).toBe("save_task acted for viewer, who should be refused.");
  });

  it("an error that isn't a refusal fails a refused case: a misspelt function can't pass as a refusal", async () => {
    const missing = { message: "Could not find the function public.sav_task", code: "PGRST202" };
    const { as } = clients({ owner: { error: missing }, editor: { error: missing }, viewer: { error: missing }, stranger: { error: missing } });
    const results = await run(accessRules<Who>({ fn: "sav_task", as, args: () => ({}), allowed: ["owner"], refused: ["viewer"] }));
    expect(results[0]![1]).toMatch(/refused owner/);
    expect(results[1]![1]).toMatch(/sav_task failed for viewer with an error that isn't a refusal/);
  });

  it("acted overrides what counts as acting", async () => {
    const { as } = clients({ owner: { data: { changed: 1 } }, editor: { data: null }, viewer: { data: { changed: 0 } }, stranger: { data: null } });
    const cases = accessRules<Who>({
      fn: "f",
      as,
      args: () => ({}),
      allowed: ["owner"],
      refused: ["viewer"],
      acted: (data) => (data as { changed: number }).changed > 0,
    });
    expect((await run(cases)).map(([, r]) => r)).toEqual(["pass", "pass"]);
  });

  it("validates the spec", () => {
    const { as } = clients({ owner: { data: 1 }, editor: { data: 1 }, viewer: { data: 1 }, stranger: { data: 1 } });
    const base = { fn: "f", as, args: () => ({}) };
    expect(() => accessRules<Who>({ ...base, fn: " ", allowed: ["owner"], refused: ["viewer"] })).toThrow(ContractError);
    expect(() => accessRules<Who>({ ...base, allowed: [], refused: ["viewer"] })).toThrow(/at least one person who may call it/);
    expect(() => accessRules<Who>({ ...base, allowed: ["owner"], refused: [] })).toThrow(/at least one person who may not/);
    expect(() => accessRules<Who>({ ...base, allowed: ["owner", "viewer"], refused: ["viewer"] })).toThrow(/viewer is both allowed and refused/);
  });

  it("is exported from the testing entry point", async () => {
    const testing = await import("../index");
    expect(testing.accessRules).toBe(accessRules);
  });
});
