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

describe("data-access rules: what isn't theirs", () => {
  it("an actions object outside provider config (labels, i18n) declares no functions", async () => {
    const found = await only("data/access-rule-tests", {
      "src/i18n/en.ts": 'export const en = { actions: { save: "Save", cancel: "Cancel" } };',
      "src/lib/labels.ts": 'export const labels = { actions: { archive: "Archive" }, writes: { create: "Add" } };',
    });
    expect(found).toEqual([]);
  });

  it("reads resources from a file typed as provider config, without the call", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/resources.ts":
        'import type { SupabaseResourceConfig } from "@marktiderman/genesis-core";\nexport const tasks: SupabaseResourceConfig = { writes: { delete: "delete_task" } };',
    });
    expect(found.map((f) => f.subject)).toEqual(["delete_task"]);
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

  it("counts a table-driven test: fn in spec objects the file passes to accessRules", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/access.test.ts": [
        "const specs = [",
        '  { fn: "create_task", allowed: ["owner"], refused: ["stranger"] },',
        '  { fn: "save_task", allowed: ["owner"], refused: ["stranger"] },',
        "];",
        "for (const spec of specs) for (const c of accessRules({ ...spec, as, args })) test(c.name, c.run);",
        '// fn: "archive_task" in a comment does not count',
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["archive_task", "list_reports"]);
  });
});

describe("data-access rules: the options a provider really gets", () => {
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

  it("credits only the fn names an accessRules call is given, not other objects in the test file", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/access.test.ts": [
        'const unrelated = { fn: "archive_task" };',
        'const save = { fn: "save_task", allowed: ["owner"], refused: ["stranger"] };',
        'for (const c of accessRules({ fn: "create_task", as, args, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);',
        "for (const c of accessRules({ ...save, as, args })) test(c.name, c.run);",
        'const rpcs = [{ fn: "list_reports", allowed: ["owner"], refused: ["stranger"] }];',
        "for (const spec of rpcs) for (const c of accessRules({ ...spec, as, args })) test(c.name, c.run);",
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["archive_task"]);
  });
});

describe("data/access-rule-tests: commented-out tests", () => {
  it("a commented-out accessRules call doesn't count, in .ts, .mts or .cts test files", async () => {
    const commented = (fn: string) => `// for (const c of accessRules({ fn: "${fn}", as, args, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);\n/* accessRules({ fn: "${fn}" }) */`;
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/a.test.ts": commented("create_task"),
      "test/b.test.mts": commented("save_task"),
      "test/c.test.cts": commented("archive_task"),
      "test/d.test.mts": 'for (const c of accessRules({ fn: "list_reports", as, args, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);',
    });
    expect(found.map((f) => f.subject)).toEqual(["create_task", "save_task", "archive_task"]);
  });
});

describe("data/access-rule-tests: only resource configuration declares functions", () => {
  it("ignores a labels object in the same file as the provider", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/provider.ts": [
        'export const labels = { actions: { save: "Save", archive: "Archive" }, writes: { create: "Add" } };',
        'export const provider = createSupabaseProvider(supabase, { access: "declared", resources: { tasks: { writes: { delete: "delete_task" } } } });',
        'export const more: Record<string, SupabaseResourceConfig> = { notes: { actions: { pin: "pin_note" } } };',
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["delete_task", "pin_note"]);
  });
});

describe("data-access rules: only the top-level key counts", () => {
  it("a nested fn: \"declared\" doesn't make options declared, and a deleted access keeps the warning", async () => {
    const found = await only("data/declared-access", {
      "src/lib/nested-fn.ts": 'const options = { resources: {}, audit: { fn: "declared" } };\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/deleted.ts": 'const options: SupabaseProviderOptions = { access: "declared" };\ndelete options.access;\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/deleted-index.ts": 'const options = { access: "declared" };\ndelete options["access"];\nexport const p = createSupabaseProvider(supabase, options);',
      "src/lib/ok.ts": 'const options = { access: "declared", resources: {} };\nexport const p = createSupabaseProvider(supabase, options);',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/lib/deleted-index.ts", "src/lib/deleted.ts", "src/lib/nested-fn.ts"]);
  });

  it("an fn in a spec's args is an argument, not the function under test", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/access.test.ts": [
        'for (const c of accessRules({ fn: "create_task", as, args: () => ({ fn: "archive_task" }), allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);',
        'const save = { fn: "save_task", args: () => ({ fn: "list_reports" }), allowed: ["owner"], refused: ["stranger"] };',
        "for (const c of accessRules({ ...save, as })) test(c.name, c.run);",
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["archive_task", "list_reports"]);
  });
});

describe("data/access-rule-tests: resource configuration in its usual shapes", () => {
  it("reads resources passed by name, as a shorthand, or checked with satisfies", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/shorthand.ts": 'const resources = { b: { writes: { create: "make_b" } } };\nexport const p = createSupabaseProvider(supabase, { access: "declared", resources });',
      "src/lib/named.ts": 'const tables = { c: { actions: { close: "close_c" } } };\nexport const p = createSupabaseProvider(supabase, { access: "declared", resources: tables });',
      "src/lib/satisfies.ts": 'export const all = { a: { writes: { create: "make_a" } } } satisfies Record<string, SupabaseResourceConfig>;',
      "src/lib/labels.ts": 'export const labels = { actions: { save: "Save" } };\nexport const p = createSupabaseProvider(supabase, { access: "declared", resources: {} });',
    });
    expect(found.map((f) => f.subject).sort()).toEqual(["close_c", "make_a", "make_b"]);
  });
});

describe("data/access-rule-tests: resources belong to the provider's options", () => {
  it("a resources key in another object (labels) is not resource configuration", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/provider.ts": [
        'const labels = { resources: { actions: { save: "Save" } } };',
        'export const p = createSupabaseProvider(client, { access: "declared", resources: {} });',
      ].join("\n"),
      "src/lib/typed.ts": [
        'const options: SupabaseProviderOptions = { access: "declared", resources: { t: { writes: { delete: "drop_t" } } } };',
        'const more = { access: "declared", resources: { u: { actions: { pin: "pin_u" } } } } satisfies SupabaseProviderOptions;',
      ].join("\n"),
    });
    expect(found.map((f) => f.subject).sort()).toEqual(["drop_t", "pin_u"]);
  });
});

describe("data/access-rule-tests: a named object in args is not a spec", () => {
  it("credits only the spec passed or spread, not a payload args returns", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/declared.ts": DECLARED,
      "test/access.test.ts": [
        'const payload = { fn: "archive_task" };',
        'for (const c of accessRules({ fn: "create_task", as, args: () => payload, allowed: ["owner"], refused: ["stranger"] })) test(c.name, c.run);',
        'const spec = { fn: "save_task", as, args, allowed: ["owner"], refused: ["stranger"] };',
        "for (const c of accessRules(spec)) test(c.name, c.run);",
        'const rpcs = [{ fn: "list_reports", allowed: ["owner"], refused: ["stranger"] }];',
        "for (const r of rpcs) for (const c of accessRules({ ...r, as, args: () => payload })) test(c.name, c.run);",
      ].join("\n"),
    });
    expect(found.map((f) => f.subject)).toEqual(["archive_task"]);
  });
});

describe("data/access-rule-tests: typed options in every common shape", () => {
  it("reads a satisfies default export and objects returned by typed factories", async () => {
    const found = await only("data/access-rule-tests", {
      "src/lib/default.ts": 'export default { access: "declared", resources: { c: { writes: { create: "make_c" } } } } satisfies SupabaseProviderOptions;',
      "src/lib/arrow.ts": 'export const make = (): SupabaseProviderOptions => ({ access: "declared", resources: { e: { writes: { create: "make_e" } } } });',
      "src/lib/fn.ts": 'export function build(): SupabaseProviderOptions {\n  const x = 1;\n  return { access: "declared", resources: { f: { actions: { close: "close_f" } } } };\n}',
      "src/lib/resource.ts": 'export const one = (): SupabaseResourceConfig => ({ writes: { delete: "drop_g" } });',
      "src/lib/labels.ts": 'export const labels = (): Labels => ({ actions: { save: "Save" } });\nexport const p = createSupabaseProvider(s, { access: "declared", resources: {} });',
    });
    expect(found.map((f) => f.subject).sort()).toEqual(["close_f", "drop_g", "make_c", "make_e"]);
  });
});
