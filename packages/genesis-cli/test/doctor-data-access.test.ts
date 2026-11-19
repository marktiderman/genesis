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

  it("a Supabase Storage call is not a table write", async () => {
    const found = await only("data/declared-access", {
      "src/routes/avatar.ts": [
        'await supabase.storage.from("avatars").update(path, file);',
        'await supabase.storage\n  .from("avatars")\n  .upload(path, file);',
        'await supabase.storage.from("avatars").remove([path]);',
        'await supabase.from("profiles").update({ avatar: path }).eq("id", id);',
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["profiles.update"]);
  });

  it("a provider whose options are a const in the same file that says access: \"declared\" is declared", async () => {
    const found = await only("data/declared-access", {
      "src/lib/declared.ts":
        'const options: SupabaseProviderOptions = { access: "declared", resources: {} };\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/open.ts": "const options = { resources: {} };\nexport const p = createSupabaseProvider(supabase, options);",
      "src/lib/imported.ts": 'import { options } from "./options";\nexport const p = createSupabaseProvider(supabase, options);',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/lib/imported.ts", "src/lib/open.ts"]);
  });

  it("counts only access said by the options object itself, not one nested in it", async () => {
    const found = await only("data/declared-access", {
      "src/lib/a.ts": 'export const a = createSupabaseProvider(supabase, { resources: { t: { writes: { create: { fn: "f", args: () => ({ access: "declared" }) } } } } });',
      "src/lib/b.ts": 'const options = { resources: { t: { args: () => ({ access: "declared" }) } } };\nexport const b = createSupabaseProvider(supabase, options);',
      "src/lib/c.ts": 'export const c = createSupabaseProvider(supabase, { access: "declared", resources: {} });',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/lib/a.ts", "src/lib/b.ts"]);
  });

  it("doesn't trust an options object set again or changed after it says declared", async () => {
    const found = await only("data/declared-access", {
      "src/lib/let.ts": 'let options = { access: "declared" };\noptions = { access: "open" };\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/mutated.ts": 'const options = { access: "declared" };\noptions.access = "open";\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/assigned.ts": 'const options = { access: "declared" };\nObject.assign(options, { access: "open" });\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/kept.ts": 'let options = { access: "declared" };\nif (options === other) log();\nexport const p = createSupabaseProvider(supabase, options);',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/lib/assigned.ts", "src/lib/let.ts", "src/lib/mutated.ts"]);
  });

  it("a nested fn: \"declared\" doesn't make options declared, and a deleted access keeps the warning", async () => {
    const found = await only("data/declared-access", {
      "src/lib/nested-fn.ts": 'const options = { resources: {}, audit: { fn: "declared" } };\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/deleted.ts": 'const options: SupabaseProviderOptions = { access: "declared" };\ndelete options.access;\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/deleted-index.ts": 'const options = { access: "declared" };\ndelete options["access"];\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/ok.ts": 'const options = { access: "declared", resources: {} };\nexport const p = createSupabaseProvider(supabase, options);',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/lib/deleted-index.ts", "src/lib/deleted.ts", "src/lib/nested-fn.ts"]);
  });
});

describe("data/access-rule-tests", () => {
  const PROVIDER = 'export const provider = createSupabaseProvider(supabase, { access: "declared", resources: {} });';
  const COVER = [
    'import { expectAccessRulesCover } from "@marktiderman/genesis-core/testing";',
    'test("every declared function has an access-rule test", () => expectAccessRulesCover(options, [saveTask]));',
  ].join("\n");

  it("warns once, at the provider, when no test calls expectAccessRulesCover", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/provider.ts": "\n" + PROVIDER,
      "src/lib/other.ts": PROVIDER,
      "test/tasks.access.test.ts": 'for (const c of accessRules({ fn: "save_task", as, args, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);',
    });
    expect(found.map((f) => [f.file, f.line, f.subject, f.level])).toEqual([["src/lib/other.ts", 1, "expectAccessRulesCover", "warn"]]);
    expect(found[0]!.message).toContain("expectAccessRulesCover(providerOptions");
  });

  it("is satisfied by a test that calls expectAccessRulesCover, in any test file shape", async () => {
    for (const name of ["test/access.test.ts", "src/lib/__tests__/access.ts", "test/access.test.mts", "test/access.spec.cts"]) {
      expect(await only("data/access-rule-tests", { "src/lib/provider.ts": PROVIDER, [name]: COVER })).toEqual([]);
    }
  });

  it("a call in a comment, a string or app code doesn't count", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/provider.ts": PROVIDER,
      "src/lib/check.ts": "expectAccessRulesCover(options, []);",
      "test/a.test.ts": '// expectAccessRulesCover(options, [])\n/* expectAccessRulesCover(options, []) */\nconst s = "expectAccessRulesCover(options, [])";',
    });
    expect(found).toHaveLength(1);
  });

  it("says nothing for an app without a Supabase provider", async () => {
    expect(await only("data/access-rule-tests", { "src/a.ts": "export const x = 1;" })).toEqual([]);
  });
});
