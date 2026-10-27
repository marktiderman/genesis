// @feat:cli-doctor
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const run = (files: Record<string, string>, strict = false) => runDoctor({ root: makeApp(null, { "package.json": '{"name":"app"}', ...files }), strict });
const only = async (rule: string, files: Record<string, string>) => (await run(files)).findings.filter((f) => f.rule === rule);

const TREE_OK = `import { ResourceView, ResourcePage } from "@marktiderman/genesis-ui";
export const Leagues = () => <ResourceView view={leagues} tree={{ getParentId: (l) => l.parent_id }} />;
export const Teams = () => <ResourceView view={teams} pagination="server" />;
export const Mixed = () => <ResourcePage<League> resource="leagues" tree={{ getParentId }} pagination="client" />;
`;

const AUTH_OK = `import { jwtVerifier, switchToUser } from "@marktiderman/genesis-studio-server/auth";
const { supabaseVerifier } = require("@marktiderman/genesis-studio-server/auth");
import { createStudioHandler } from "@marktiderman/genesis-studio-server";
export { jwtVerifier, switchToUser, supabaseVerifier, createStudioHandler };
`;

describe("resource-view-tree", () => {
  it("flags a tree on a server- or cursor-paged ResourceView or ResourcePage", async () => {
    const found = await only("resource-view-tree", {
      "src/leagues.tsx": [
        'import { ResourceView, ResourcePage } from "@marktiderman/genesis-ui";',
        'export const A = () => <ResourceView view={v} tree={{ getParentId }} pagination="server" />;',
        "export const B = () => (",
        "  <ResourcePage<League>",
        '    resource="leagues"',
        "    pagination={'cursor'}",
        "    tree={{ getParentId: (r) => r.parent_id }}",
        "  />",
        ");",
      ].join("\n"),
    });
    expect(found.map((f) => [f.line, f.level, f.subject])).toEqual([
      [2, "error", "ResourceView"],
      [4, "error", "ResourcePage"],
    ]);
    expect(found[0]?.message).toContain('pagination="server"');
  });

  it("leaves a client tree, a paged flat list, and a `tree` inside an expression alone", async () => {
    expect(
      await only("resource-view-tree", {
        "src/views.tsx": TREE_OK,
        "src/other.tsx": 'export const C = () => <ResourceView view={v} slots={{ header: <Hint tree={1} /> }} pagination="server" />;',
        // Its own pagination is client; only a nested element says server.
        "src/nested.tsx":
          'export const D = () => <ResourceView view={v} tree={tree} pagination="client" slots={{ header: <Hint pagination="server" /> }} />;',
        "src/braced.tsx": 'export const E = () => <ResourceView view={v} tree={tree} pagination={"client"} />;',
      }),
    ).toEqual([]);
  });
});

describe("studio-server-auth-import", () => {
  it("flags deep imports of studio-server files and a CommonJS require of its root", async () => {
    const found = await only("studio-server-auth-import", {
      "src/auth.ts": [
        'import { switchToUser } from "@marktiderman/genesis-studio-server/dist/switch.js";',
        'const auth = require("@marktiderman/genesis-studio-server/src/auth");',
        'const server = require("@marktiderman/genesis-studio-server");',
      ].join("\n"),
    });
    expect(found.map((f) => [f.line, f.level])).toEqual([
      [1, "warn"],
      [2, "warn"],
      [3, "warn"],
    ]);
    expect(found.every((f) => f.message.includes("@marktiderman/genesis-studio-server/auth"))).toBe(true);
  });

  it("reads .cjs and .mjs files, which the default scan leaves out", async () => {
    const found = await only("studio-server-auth-import", {
      "src/server.cjs": 'const { switchToUser } = require("@marktiderman/genesis-studio-server");\n',
      "src/worker.mjs": 'import { switchToUser } from "@marktiderman/genesis-studio-server/dist/switch.js";\n',
      "src/fine.cjs": 'const auth = require("@marktiderman/genesis-studio-server/auth");\n',
      "src/server.test.cjs": 'require("@marktiderman/genesis-studio-server");\n',
    });
    expect(found.map((f) => [f.file, f.line])).toEqual([
      ["src/server.cjs", 1],
      ["src/worker.mjs", 1],
    ]);
  });

  it("leaves the ./auth entry (import and require) and an ESM import of the root alone", async () => {
    expect(await only("studio-server-auth-import", { "src/auth.ts": AUTH_OK })).toEqual([]);
  });
});

const FORMS_VIEW = [
  'import { defineView } from "@marktiderman/genesis-core/resource-view";',
  "export const formsView = defineView(contracts.forms, {",
  "  fields: {",
  '    opens_at: { timeZone: "practice" },',
  '    closes_at: { timeZone: "practice" },',
  "  },",
  "});",
].join("\n");

describe("removed-scope-name", () => {
  it("fails strict on a missed codemod: timeZone \"practice\" in a view definition, at each field", async () => {
    const result = await run({ "src/shared/views/forms.view.ts": FORMS_VIEW }, true);
    const found = result.findings.filter((f) => f.rule === "removed-scope-name");
    expect(found.map((f) => [f.line, f.level, f.subject])).toEqual([
      [4, "error", 'timeZone "practice"'],
      [5, "error", 'timeZone "practice"'],
    ]);
    expect(found[0]?.message).toContain("genesis codemod genesis-core-2-scope-names");
    expect(result.ok).toBe(false);
  });

  it("flags practiceTimeZone, resolveZone(\"practice\") and DisplayTimeZones' practice", async () => {
    const found = await only("removed-scope-name", {
      "src/screen.tsx": [
        'import { NativeResourceView, resolveZone, useDisplayTimeZones, type DisplayTimeZones } from "@marktiderman/genesis-ui-native";',
        "export const A = () => <NativeResourceView view={v} practiceTimeZone={zone} />;",
        'export const b = resolveZone("practice", zones);',
        'export const c: DisplayTimeZones = { viewer: "UTC", practice: "Europe/Berlin" };',
        "export function D() { const zones = useDisplayTimeZones(); return zones.practice; }",
      ].join("\n"),
    });
    expect(found.map((f) => [f.line, f.subject])).toEqual([
      [2, "practiceTimeZone"],
      [3, 'resolveZone("practice")'],
      [4, "DisplayTimeZones.practice"],
      [5, "DisplayTimeZones.practice"],
    ]);
  });

  it("leaves the new names, an app's own practice, a file without Genesis and comments alone", async () => {
    expect(
      await only("removed-scope-name", {
        "src/ok.ts": [
          'import { defineView } from "@marktiderman/genesis-core/resource-view";',
          'export const v = defineView(c, { fields: { opens_at: { timeZone: "scope" } } });',
          'export const team = { practice: "Tuesday" };',
          '// was timeZone: "practice" before genesis-core 2',
        ].join("\n"),
        "src/own.ts": 'export const field = { timeZone: "practice" };',
      }),
    ).toEqual([]);
  });
});

describe("scope-practice-id", () => {
  const reads = 'import { useViewerScope } from "@marktiderman/genesis-core";\nexport const id = () => useViewerScope().scope.practiceId;\n';
  it("notes an untyped scope.practiceId read, as info that never fails strict", async () => {
    const result = await run({ "src/id.ts": reads }, true);
    const found = result.findings.filter((f) => f.rule === "scope-practice-id");
    expect(found.map((f) => [f.line, f.level])).toEqual([[2, "info"]]);
    expect(found[0]?.message).toContain("interface ResourceScope { practiceId?: string }");
    expect(result.ok).toBe(true);
  });

  it("is quiet once the app augments ResourceScope, in a declaration file too", async () => {
    expect(
      await only("scope-practice-id", {
        "src/id.ts": reads,
        "src/genesis.d.ts": 'declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }',
      }),
    ).toEqual([]);
  });
});

describe("rule ids", () => {
  it("are reserved: an app pattern can't take one", async () => {
    for (const id of ["resource-view-tree", "studio-server-auth-import", "removed-scope-name", "scope-practice-id"]) {
      const config = JSON.stringify({ doctor: { patterns: [{ id, files: ["src/**"], forbid: "x" }] } });
      await expect(run({ "genesis.config.json": config })).rejects.toThrow(`"${id}" is a built-in rule id`);
    }
  });
});

describe("doctor --strict on an app using them correctly", () => {
  it("passes", async () => {
    const migrated = FORMS_VIEW.replaceAll('"practice"', '"scope"');
    const result = await run({ "src/views.tsx": TREE_OK, "src/auth.ts": AUTH_OK, "src/shared/views/forms.view.ts": migrated }, true);
    const ours = result.findings.filter((f) => ["resource-view-tree", "studio-server-auth-import", "removed-scope-name", "scope-practice-id"].includes(f.rule));
    expect(ours).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
