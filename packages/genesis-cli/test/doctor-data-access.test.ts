// @feat:declared-data-access
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const run = (files: Record<string, string>) => runDoctor({ root: makeApp(null, { "package.json": '{"name":"app"}', ...files }) });
const only = async (rule: string, files: Record<string, string>) => (await run(files)).findings.filter((f) => f.rule === rule);

const DECLARED = [
  'import { createSupabaseProvider } from "@marktiderman/genesis-core";',
  "export const provider = createSupabaseProvider(supabase, {",
  '  access: "declared",',
  "  resources: {",
  "    tasks: {",
  '      source: "tasks_with_people",',
  '      writes: { create: "create_task", update: { fn: "save_task", args: (id, v) => ({ p_task: id, p_mode: "full" }) } },',
  '      actions: { archive: "archive_task" },',
  "    },",
  '    reports: { source: { rpc: "list_reports", args: () => ({ p_scope: "mine" }) } },',
  "  },",
  "});",
].join("\n");

const TESTS = (fns: string[]) =>
  fns.map((fn) => `for (const c of accessRules({ fn: "${fn}", as, args, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);`).join("\n");

describe("data/declared-access", () => {
  it("warns on a provider without access: \"declared\", and not on one with it", async () => {
    const found = await only("data/declared-access", {
      "src/lib/open.ts": 'import { createSupabaseProvider } from "@marktiderman/genesis-core";\n\nexport const p = createSupabaseProvider(supabase, { resources: {} });',
      "src/lib/declared.ts": DECLARED,
    });
    expect(found.map((f) => [f.file, f.line, f.subject, f.level])).toEqual([["src/lib/open.ts", 3, "createSupabaseProvider", "warn"]]);
    expect(found[0]!.message).toContain('access: "declared"');
    expect(found[0]!.message).toContain("docs/DATA-ACCESS.md");
  });

  it("warns on a provider whose access is \"open\", and on one with no options", async () => {
    const found = await only("data/declared-access", {
      "src/a.ts": 'export const a = createSupabaseProvider(supabase, { access: "open" });',
      "src/b.ts": "export const b = createSupabaseProvider(supabase);",
    });
    expect(found.map((f) => f.file)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("warns on a table write in app code, naming the table and verb", async () => {
    const found = await only("data/declared-access", {
      "src/routes/task.tsx": [
        "export async function save(id, title) {",
        '  await supabase.from("tasks").update({ title }).eq("id", id);',
        "  await supabase",
        "    .from('notes')",
        "    .insert({ body: title });",
        '  await supabase.schema("work").from(`audit`).delete().eq("id", id);',
        '  await supabase.from("tasks").select("*");',
        "}",
      ].join("\n"),
    });
    expect(found.map((f) => [f.line, f.subject])).toEqual([
      [2, "tasks.update"],
      [4, "notes.insert"],
      [6, "audit.delete"],
    ]);
    expect(found[0]!.message).toContain("named database function");
  });

  it("leaves table writes in tests, supabase/, comments and strings alone", async () => {
    const found = await only("data/declared-access", {
      "src/routes/task.test.ts": 'await supabase.from("tasks").insert({ title: "x" });',
      "supabase/functions/send/index.ts": 'await admin.from("tasks").update({ sent: true });',
      "src/routes/notes.ts": [
        '// supabase.from("tasks").update({ title })',
        'const help = `call .from("tasks").delete() never`;',
        'const s = ".from(\\"tasks\\").upsert(";',
      ].join("\n"),
    });
    expect(found).toEqual([]);
  });

  it("an allow entry with its reason keeps a table write that must stay", async () => {
    const root = makeApp(null, {
      "package.json": '{"name":"app"}',
      "src/routes/task.tsx": 'await supabase.from("tasks").update({ title }).eq("id", id);',
    });
    const { findings } = await runDoctor({
      root,
      config: { allow: [{ rule: "data/declared-access", file: "src/routes/task.tsx", reason: "Seeded by the import job." }] },
    });
    expect(findings.filter((f) => f.rule === "data/declared-access")).toEqual([]);
  });
});

describe("data/access-rule-tests", () => {
  it("warns on each declared function no test names in accessRules({ fn })", async () => {
    const found = await only("data/access-rule-tests", { "src/lib/declared.ts": DECLARED });
    expect(found.map((f) => [f.subject, f.file, f.line, f.level])).toEqual([
      ["create_task", "src/lib/declared.ts", 7, "warn"],
      ["save_task", "src/lib/declared.ts", 7, "warn"],
      ["archive_task", "src/lib/declared.ts", 8, "warn"],
      ["list_reports", "src/lib/declared.ts", 10, "warn"],
    ]);
    expect(found[0]!.message).toContain('accessRules({ fn: "create_task"');
  });

  it("takes args string values as arguments, never as function names", async () => {
    const found = await only("data/access-rule-tests", { "src/lib/declared.ts": DECLARED });
    const subjects = found.map((f) => f.subject);
    expect(subjects).not.toContain("full");
    expect(subjects).not.toContain("mine");
    expect(subjects).not.toContain("tasks_with_people");
  });

  it("is satisfied by an accessRules test for each function, in any test file", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/tasks.access.test.ts": TESTS(["create_task", "save_task"]),
      "src/lib/__tests__/more.ts": TESTS(["archive_task"]),
    });
    expect(found.map((f) => f.subject)).toEqual(["list_reports"]);

    const all = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/all.test.ts": TESTS(["create_task", "save_task", "archive_task", "list_reports"]),
    });
    expect(all).toEqual([]);
  });

  it("an accessRules call in app code (not a test) doesn't count", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "src/lib/rules.ts": TESTS(["create_task", "save_task", "archive_task", "list_reports"]),
    });
    expect(found).toHaveLength(4);
  });

  it("reports each function once, however many resources declare it", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/p.ts": 'createSupabaseProvider(s, { access: "declared", resources: { a: { writes: { delete: "remove_row" } }, b: { writes: { delete: "remove_row" } } } });',
    });
    expect(found.map((f) => f.subject)).toEqual(["remove_row"]);
  });

  it("says nothing when nothing is declared", async () => {
    expect(await only("data/access-rule-tests", { "src/a.ts": "export const x = 1;" })).toEqual([]);
  });
});
