/**
 * scripts/check-docs-match-exports.mjs: docs must not describe API the packages don't have. These
 * tests build a small repo (one package with hand-written `.d.ts`, a features.json) and check
 * that a documented prop, value, option or export that doesn't exist is reported, that prose and
 * an app's own names are not, and that a **Planned** marker skips a claim only while its feature
 * is planned or building.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkDocs, docFiles, parseMarkdown, spanChecks } from "../check-docs-match-exports.mjs";

const DTS = `
export interface DemoProps {
  view: unknown;
  mode?: "table" | "grid" | "list";
  layout?: "page" | "embedded";
  header?: "page" | "toolbar";
}
export declare function Demo(props: DemoProps): unknown;
export interface DemoDefinition {
  copy?: { noun?: string };
  fields?: { readonly [name: string]: { label?: string; when?: (row: unknown) => boolean } | undefined };
  groupBy?: string;
  summary?: (row: unknown) => { title: string };
}
export declare function defineDemo(contract: unknown, definition: DemoDefinition): { resource: string };
export declare function demoBreak(id: string, title?: string): unknown;
/** Empty for module augmentation: an app declares its roles. */
export interface DemoRoles {}
export declare function demoViewer(): { roles?: DemoRoles };
`;

const JSX_RUNTIME = `
export namespace JSX {
  interface Element {}
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string }
  interface IntrinsicElements { [name: string]: any }
}
export declare function jsx(type: any, props: any): JSX.Element;
export declare function jsxs(type: any, props: any): JSX.Element;
export declare const Fragment: unique symbol;
`;

function fixture(features = { "demo-sheet": "planned", "demo-live": "live" }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-docs-exports-"));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write("packages/demo/package.json", JSON.stringify({ name: "@marktiderman/genesis-demo", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } } }));
  write("packages/demo/dist/index.d.ts", DTS);
  write("node_modules/react/jsx-runtime.d.ts", JSX_RUNTIME);
  write("features.json", JSON.stringify({ features: Object.entries(features).map(([id, status]) => ({ id, status })) }));
  return root;
}

const check = (root, markdown) => checkDocs({ root, docs: [{ file: "docs/DEMO.md", markdown }] }).map((f) => `${f.line}: ${f.message}`);

describe("parseMarkdown", () => {
  it("reads fenced TS blocks, API sections and planned markers", () => {
    const md = [
      "# Demo", // 1
      "", // 2
      "## Screen", // 3
      "", // 4
      "<!-- api: DemoProps -->", // 5
      "", // 6
      "- `mode`: how rows show;", // 7
      "- `sheet` is **Planned** ([`demo-sheet`](../features.ts)).", // 8
      "", // 9
      "```tsx", // 10
      "<Demo view={v} />", // 11
      "```", // 12
      "", // 13
      "## Other", // 14
      "", // 15
      "- `mode`: not an API section.", // 16
    ].join("\n");
    const { blocks, units, planned } = parseMarkdown(md);
    expect(blocks).toEqual([expect.objectContaining({ lang: "tsx", code: "<Demo view={v} />", line: 11 })]);
    expect(planned).toEqual([{ feature: "demo-sheet", line: 8 }]);
    expect(units.find((u) => u.line === 7).apis).toEqual(["DemoProps"]);
    expect(units.find((u) => u.line === 8).planned).toBe("demo-sheet");
    expect(units.find((u) => u.line === 16).apis).toBeNull();
  });

  it("splits the API list at top-level commas only", () => {
    const { units } = parseMarkdown("<!-- api: Record<string, number>, DemoProps -->\n\n- `a`: b");
    expect(units.at(-1).apis).toEqual(["Record<string, number>", "DemoProps"]);
  });
});

describe("spanChecks", () => {
  const unit = (text, extra = {}) => ({ kind: "item", text, apis: ["DemoProps"], planned: null, sectionPlanned: null, ...extra });

  it("checks an option bullet's lead span, attributes and definitions, but not prose spans", () => {
    expect(spanChecks(unit("- `layout`: `page` or `embedded`, see `useThing`"))).toEqual([{ path: ["layout"], strict: true, text: "layout" }]);
    expect(spanChecks(unit("- **`summary(row)`** gives a line"))).toEqual([{ path: ["summary"], strict: true, text: "summary(row)" }]);
    expect(spanChecks(unit('- Use `mode="sheet"` here', { kind: "paragraph" }))).toEqual([{ path: ["mode"], value: "sheet", strict: true, text: 'mode="sheet"' }]);
    expect(spanChecks(unit("- rows: `native.row: { title }`"))).toEqual([{ path: ["native", "row"], strict: true, text: "native.row: { title }" }]);
    expect(spanChecks(unit("- the `bin.restorable` flag"))).toEqual([{ path: ["bin", "restorable"], strict: false, text: "bin.restorable" }]);
    expect(spanChecks(unit('- a `role="grid"` with one tab stop'))).toEqual([]);
  });

  it("checks nothing outside an API section or inside a planned unit", () => {
    expect(spanChecks(unit("- `layout`: x", { apis: null }))).toEqual([]);
    expect(spanChecks(unit("- `layout`: x", { planned: "demo-sheet" }))).toEqual([]);
    expect(spanChecks(unit("- `layout`: x", { sectionPlanned: "demo-sheet" }))).toEqual([]);
  });
});

describe("checkDocs", () => {
  const root = fixture();

  it("passes docs that match the exports, and ignores an app's own names", () => {
    const md = [
      "```tsx",
      'import { contracts } from "../../resources.genesis";',
      "export const v = defineDemo(contracts.goals, { copy: { noun: \"goal\" }, groupBy: \"owner_id\", fields: { owner_id: { label: \"Owner\" } } });",
      "",
      '<Demo view={v} mode="grid" layout="embedded" />',
      "```",
    ].join("\n");
    expect(check(root, md)).toEqual([]);
  }, 60_000);

  it("reports a prop, a value, an option and an import the package doesn't have", () => {
    const md = [
      "```tsx", // 1
      'import { Demo, useDemo } from "@marktiderman/genesis-demo";', // 2
      "", // 3
      'const v = defineDemo(c, { validate: (s) => s, groupBy: "x" });', // 4
      '<Demo view={v} sectionBy="team" />', // 5
      '<Demo view={v} mode="sheet" />', // 6
      "```", // 7
    ].join("\n");
    const found = check(root, md);
    expect(found).toHaveLength(4);
    expect(found[0]).toMatch(/^2: example: .*no exported member .*useDemo/);
    expect(found[1]).toMatch(/^4: example: .*'validate' does not exist/);
    expect(found[2]).toMatch(/^5: example: .*'sectionBy' does not exist/);
    expect(found[3]).toMatch(/^6: example: Type '"sheet"' is not assignable/);
  }, 60_000);

  it("reports a Genesis call with the wrong number of arguments", () => {
    const md = ["```ts", 'import { demoBreak } from "@marktiderman/genesis-demo";', "demoBreak();", 'demoBreak("a", "b", "c");', "```"].join("\n");
    const found = check(root, md);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/^3: example: Expected 1-2 arguments, but got 0/);
    expect(found[1]).toMatch(/^4: example: Expected 1-2 arguments, but got 3/);
    // A name the block doesn't import may be the app's own function: not checked.
    expect(check(root, "```ts\ndemoBreak();\n```")).toEqual([]);
  }, 60_000);

  it("skips keys of an interface left empty for module augmentation", () => {
    const md = ["```ts", 'import { demoViewer } from "@marktiderman/genesis-demo";', 'const owner = demoViewer().roles?.orgRole === "owner";', "```"].join("\n");
    expect(check(root, md)).toEqual([]);
  }, 60_000);

  it("reports a missing entry point", () => {
    expect(check(root, '```ts\nimport { x } from "@marktiderman/genesis-demo/nope";\n```')).toEqual([
      expect.stringMatching(/^2: example: Cannot find module '@marktiderman\/genesis-demo\/nope'/),
    ]);
  }, 60_000);

  it("checks prose in an API section against the listed types", () => {
    const md = [
      "## Screen", // 1
      "", // 2
      "<!-- api: DemoProps, DemoDefinition -->", // 3
      "", // 4
      "- `layout`: page or embedded;", // 5
      "- `onTotal`: for a parent tab's badge;", // 6
      '- `mode="sheet"` for a spreadsheet;', // 7
      "- **Rows:** `native.row: { title, subtitle }`.", // 8
      "- Its `fields.owner.when` hides a cell; `bin.restorable` is the provider's.", // 9
      "", // 10
      "## Prose", // 11
      "", // 12
      '- `onTotal`: and `mode="sheet"` are not checked here.', // 13
    ].join("\n");
    expect(check(root, md)).toEqual([
      "6: `onTotal`: DemoProps, DemoDefinition has no `onTotal`",
      '7: `mode="sheet"`: DemoProps, DemoDefinition doesn\'t accept "sheet" for `mode`',
      "8: `native.row: { title, subtitle }`: DemoProps, DemoDefinition has no `native.row`",
    ]);
  }, 60_000);

  it("reports an API marker that doesn't resolve", () => {
    expect(check(root, "## A\n\n<!-- api: NoSuchProps -->\n\n- `x`: y")).toEqual([expect.stringMatching(/^3: <!-- api: NoSuchProps --> doesn't resolve/)]);
  }, 60_000);

  it("skips a planned unit, section or block, while its feature is planned", () => {
    const md = [
      "## Screen", // 1
      "", // 2
      "<!-- api: DemoProps -->", // 3
      "", // 4
      '- `mode="sheet"`: **Planned** ([`demo-sheet`](../features.ts)).', // 5
      "", // 6
      "## Sheet", // 7
      "", // 8
      "**Planned** ([`demo-sheet`](../features.ts)): none of this is built.", // 9
      "", // 10
      "```tsx", // 11
      '<Demo view={v} mode="sheet" />', // 12
      "```", // 13
      "", // 14
      "## Later", // 15
      "", // 16
      "Paste comes later. **Planned** (`demo-sheet`).", // 17
      "", // 18
      "```tsx", // 19
      "<Demo view={v} paste />", // 20
      "```", // 21
      "", // 22
      "<!-- docs-check: skip -->", // 23
      "```ts", // 24
      "defineDemo(c, { anything: true });", // 25
      "```", // 26
    ].join("\n");
    expect(check(root, md)).toEqual([]);
  }, 60_000);

  it("reports a planned marker whose feature is unknown or already shipped", () => {
    const md = "- a: **Planned** (`demo-nope`)\n- b: **Planned** (`demo-live`)";
    expect(check(root, md)).toEqual([
      "1: **Planned** names `demo-nope`, which isn't in features.ts",
      "2: **Planned** names `demo-live`, which is live: drop the marker (or the doc's claim)",
    ]);
  }, 60_000);
});

describe("docFiles", () => {
  it("scans the root README, docs and every package doc, never the generated reference, changelogs or builds", () => {
    const root = fixture();
    for (const f of ["README.md", "docs/A.md", "docs/adr/0001.md", "docs/component-reference.md", "packages/demo/README.md", "packages/demo/CHANGELOG.md", "packages/demo/docs/GUIDE.md", "packages/demo/dist/X.md", "packages/demo/node_modules/y/README.md"]) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), "# x\n");
    }
    expect(docFiles(root)).toEqual(["README.md", "docs/A.md", path.join("docs", "adr", "0001.md"), path.join("packages", "demo", "README.md"), path.join("packages", "demo", "docs", "GUIDE.md")]);
  });
});
