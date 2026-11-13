// @feat:client-layer
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { validateClient } from "../src/doctor/config.js";
import { planClientInit } from "../src/client/init.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const run = (files: Record<string, string>) => runDoctor({ root: makeApp(null, { "package.json": '{"name":"app"}', ...files }) });
const only = async (rule: string, files: Record<string, string>) => (await run(files)).findings.filter((f) => f.rule === rule);

const SCREEN = [
  'import { ResourceView, RecordView as Page } from "@marktiderman/genesis-ui/data";',
  "export const Tasks = () => <ResourceView view={tasksView} />;",
  "export const Task = () => <Page view={taskPage} row={row} />;",
].join("\n");

describe("client/layer", () => {
  it("warns where a screen renders Genesis's ResourceView or RecordView once the app has a client layer", async () => {
    const found = await only("client/layer", {
      "src/client/resource-view.tsx": 'import { ResourceView as G } from "@marktiderman/genesis-ui/data";\nexport const ResourceView = (p) => <G {...p} />;',
      "src/routes/tasks.tsx": SCREEN,
      "src/routes/own.tsx": 'import { ResourceView } from "../client/resource-view";\nexport const Own = () => <ResourceView view={v} />;',
    });
    expect(found.map((f) => [f.file, f.line, f.subject, f.level])).toEqual([
      ["src/routes/tasks.tsx", 2, "ResourceView", "warn"],
      ["src/routes/tasks.tsx", 3, "RecordView", "warn"],
    ]);
    expect(found[0]!.message).toContain("src/client");
  });

  it("says nothing without a client layer, and reads the folder from genesis.config.json", async () => {
    expect(await only("client/layer", { "src/routes/tasks.tsx": SCREEN })).toEqual([]);
    const moved = await only("client/layer", {
      "genesis.config.json": JSON.stringify({ client: { dir: "app/layer" } }),
      "app/layer/resource-view.tsx": "export const ResourceView = () => null;",
      "src/routes/tasks.tsx": SCREEN,
    });
    expect(moved).toHaveLength(2);
    expect(moved[0]!.message).toContain("app/layer");
  });
});

describe("client/one-view-per-resource", () => {
  it("warns on a second view over the same contract", async () => {
    const found = await only("client/one-view-per-resource", {
      "src/client/tasks/view.ts": 'export const tasksView = defineView(contracts["public.tasks"], { segments: [] });',
      "src/routes/mine.tsx": 'const mine = defineView( contracts["public.tasks"] , {});\nconst notes = defineView(contracts["public.notes"]);',
    });
    expect(found.map((f) => [f.file, f.line, f.subject])).toEqual([["src/routes/mine.tsx", 1, 'contracts["public.tasks"]']]);
    expect(found[0]!.message).toContain("src/client/tasks/view.ts:1");
  });
});

describe("client config and scaffold", () => {
  it("checks the client block", () => {
    expect(validateClient({ dir: "./src/layer/" })).toEqual({ dir: "src/layer" });
    expect(() => validateClient({ dir: "../out" })).toThrow(/client.dir/);
    expect(() => validateClient({ folder: "x" })).toThrow(/unknown setting "folder"/);
  });

  it("plans the layer's files, and a record type's view and appearance", () => {
    const plan = planClientInit({ type: "client-notes" });
    expect(plan.files.map((f) => f.path)).toEqual([
      "src/client/client-layer.tsx",
      "src/client/resource-view.tsx",
      "src/client/cells/index.ts",
      "src/client/components/index.ts",
      "src/client/view-types/index.ts",
      "src/client/client-notes/view.ts",
      "src/client/client-notes/appearance.tsx",
    ]);
    expect(plan.files[5]!.content).toContain("export const clientNotesView = defineView(");
    expect(planClientInit({ dir: "app/layer" }).steps.join("\n")).toContain('"client": { "dir": "app/layer" }');
    expect(() => planClientInit({ type: "Bad Name" })).toThrow(/lowercase/);
  });
});
