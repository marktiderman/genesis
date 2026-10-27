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

  it("leaves the ./auth entry (import and require) and an ESM import of the root alone", async () => {
    expect(await only("studio-server-auth-import", { "src/auth.ts": AUTH_OK })).toEqual([]);
  });
});

describe("doctor --strict on an app using them correctly", () => {
  it("passes", async () => {
    const result = await run({ "src/views.tsx": TREE_OK, "src/auth.ts": AUTH_OK }, true);
    const ours = result.findings.filter((f) => f.rule === "resource-view-tree" || f.rule === "studio-server-auth-import");
    expect(ours).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
