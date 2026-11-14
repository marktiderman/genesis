// @feat:client-layer
import { afterAll, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/index.js";
import { validateClient } from "../src/doctor/config.js";
import { clientConfigChange, normalizeClientDir, planClientInit } from "../src/client/init.js";
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
      "src/client/record-view.tsx": 'import { RecordView as G } from "@marktiderman/genesis-ui/data";\nexport const RecordView = (p) => <G {...p} />;',
      "src/routes/tasks.tsx": SCREEN,
      "src/routes/own.tsx": 'import { ResourceView } from "../client/resource-view";\nexport const Own = () => <ResourceView view={v} />;',
    });
    expect(found.map((f) => [f.file, f.line, f.subject, f.level])).toEqual([
      ["src/routes/tasks.tsx", 2, "ResourceView", "warn"],
      ["src/routes/tasks.tsx", 3, "RecordView", "warn"],
    ]);
    expect(found[0]!.message).toContain("src/client");
    expect(found[1]!.message).toContain("record-view.tsx");
  });

  it("leaves RecordView alone until the layer has its record-page wrapper", async () => {
    const found = await only("client/layer", {
      "src/client/resource-view.tsx": "export const ResourceView = () => null;",
      "src/routes/tasks.tsx": SCREEN,
    });
    expect(found.map((f) => f.subject)).toEqual(["ResourceView"]);
  });

  it("says nothing without a client layer, and reads the folder from genesis.config.json", async () => {
    expect(await only("client/layer", { "src/routes/tasks.tsx": SCREEN })).toEqual([]);
    const moved = await only("client/layer", {
      "genesis.config.json": JSON.stringify({ client: { dir: "app/layer" } }),
      "app/layer/resource-view.tsx": "export const ResourceView = () => null;",
      "app/layer/record-view.tsx": "export const RecordView = () => null;",
      "src/routes/tasks.tsx": SCREEN,
    });
    expect(moved).toHaveLength(2);
    expect(moved[0]!.message).toContain("app/layer");
  });
});

describe("client/one-view-per-resource", () => {
  const LAYER = { "src/client/resource-view.tsx": "export const ResourceView = () => null;" };

  it("warns on a second view over the same contract", async () => {
    const found = await only("client/one-view-per-resource", {
      ...LAYER,
      "src/client/tasks/view.ts": 'import { contracts } from "../../lib/resources.genesis";\nexport const tasksView = defineView(contracts["public.tasks"], { segments: [] });',
      "src/routes/mine.tsx":
        'import { contracts as c } from "../lib/resources.genesis.ts";\nconst mine = defineView( c["public.tasks"] , {});\nconst notes = defineView(c["public.notes"]);',
    });
    expect(found.map((f) => [f.file, f.line, f.subject])).toEqual([["src/routes/mine.tsx", 2, 'c["public.tasks"]']]);
    expect(found[0]!.message).toContain("src/client/tasks/view.ts:2");
  });

  it("says nothing without a client layer", async () => {
    const found = await only("client/one-view-per-resource", {
      "src/a/view.ts": 'import { contracts } from "../lib/resources.genesis";\nexport const a = defineView(contracts["public.tasks"]);',
      "src/b/view.ts": 'import { contracts } from "../lib/resources.genesis";\nexport const b = defineView(contracts["public.tasks"]);',
    });
    expect(found).toEqual([]);
  });

  it("tells contracts apart by where they come from, and leaves stories and tests out", async () => {
    const found = await only("client/one-view-per-resource", {
      ...LAYER,
      "src/a/contract.ts": "export const contract = {};",
      "src/b/contract.ts": "export const contract = {};",
      "src/a/view.ts": 'import { contract } from "./contract";\nexport const a = defineView(contract, {});',
      "src/b/view.ts": 'import { contract } from "./contract";\nexport const b = defineView(contract, {});',
      "src/c/view.ts": "const contract = {};\nexport const c = defineView(contract, {});",
      "src/a/view.stories.tsx": 'import { contract } from "./contract";\nconst shown = defineView(contract, {});',
      "src/a/view.test.ts": 'import { contract } from "./contract";\nconst tried = defineView(contract, {});',
      "src/a/__tests__/more.ts": 'import { contract } from "../contract";\nconst tried = defineView(contract, {});',
    });
    expect(found).toEqual([]);
    const twice = await only("client/one-view-per-resource", {
      ...LAYER,
      "src/a/contract.ts": "export const contract = {};",
      "src/a/view.ts": 'import { contract } from "./contract";\nexport const a = defineView(contract, {});',
      "src/a/other.ts": 'import { contract as same } from "./contract.ts";\nexport const b = defineView(same, {});',
    });
    expect(twice.map((f) => [f.file, f.subject])).toEqual([["src/a/view.ts", "contract"]]);
    expect(twice[0]!.message).toContain("src/a/other.ts:2");
  });

  it("doesn't count two functions' parameters of the same name as one contract", async () => {
    const found = await only("client/one-view-per-resource", {
      ...LAYER,
      "src/client/factory.ts": [
        "export function tasksOf(contract) { return defineView(contract, {}); }",
        "export function notesOf(contract) { return defineView(contract, {}); }",
      ].join("\n"),
    });
    expect(found).toEqual([]);
  });
});

describe("shadowed-export and the app's wrappers", () => {
  it("lets a file wrap the Genesis component it names through an aliased import it uses", async () => {
    const found = await only("shadowed-export", {
      "src/client/button.tsx": 'import { Button as GenesisButton } from "@marktiderman/genesis-ui";\nexport function Button(p) { return <GenesisButton {...p} />; }',
      "src/own/button.tsx": "export const Button = () => <span />;",
      "src/unused/button.tsx": 'import { Button as Unused } from "@marktiderman/genesis-ui";\nexport const Button = () => <span />;',
    });
    expect(found.map((f) => f.file).sort()).toEqual(["src/own/button.tsx", "src/unused/button.tsx"]);
  });

  it("finds nothing in a freshly scaffolded client layer", async () => {
    const files = Object.fromEntries(planClientInit({ type: "tasks" }).files.map((f) => [f.path, f.content]));
    expect(await only("shadowed-export", files)).toEqual([]);
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
      "src/client/record-view.tsx",
      "src/client/cells/index.ts",
      "src/client/components/index.ts",
      "src/client/view-types/index.ts",
      "src/client/client-notes/contract.ts",
      "src/client/client-notes/view.ts",
      "src/client/client-notes/appearance.tsx",
    ]);
    const view = plan.files.find((f) => f.path.endsWith("/view.ts"))!.content;
    expect(view).toContain("export const clientNotesView = defineView(clientNotesContract, {");
    expect(view).not.toContain("undefined as never");
    expect(plan.files.find((f) => f.path.endsWith("/contract.ts"))!.content).toContain('name: "public.client_notes"');
    expect(plan.files.find((f) => f.path.endsWith("record-view.tsx"))!.content).toContain("export function RecordView");
    expect(planClientInit({ dir: "app/layer" }).steps.join("\n")).toContain('"client": { "dir": "app/layer" }');
    expect(() => planClientInit({ type: "Bad Name" })).toThrow(/lowercase/);
    // Every name the templates make from the type has to be an identifier.
    for (const bad of ["tasks-", "client--notes", "-tasks", "a".repeat(41)]) expect(() => planClientInit({ type: bad }), bad).toThrow(/lowercase/);
    expect(planClientInit({ type: "a2-b3" }).files.some((f) => f.content.includes("a2B3View"))).toBe(true);
  });

  it("takes only a plain folder inside the app, written normalized", () => {
    expect(planClientInit({ dir: "./src/client/" }).dir).toBe("src/client");
    expect(planClientInit({ dir: "app//layer" }).dir).toBe("app/layer");
    expect(normalizeClientDir("./src/layer")).toBe("src/layer");
    for (const bad of ["src/my client", "src\\..\\..\\x", "src\\layer", "src/./x", "../out", "src/../../x", "/abs/layer", "", "."]) {
      expect(() => planClientInit({ dir: bad }), bad).toThrow(/plain folder inside the app/);
    }
  });

  it("writes client.dir only when it changes, and moves a configured folder only when forced", () => {
    expect(clientConfigChange("src/client", undefined)).toBe("none");
    expect(clientConfigChange(planClientInit({ dir: "./src/client" }).dir, undefined)).toBe("none");
    expect(clientConfigChange("app/layer", undefined)).toBe("write");
    expect(clientConfigChange("app/layer", "app/layer")).toBe("none");
    expect(() => clientConfigChange("src/client", "app/layer")).toThrow(/--force/);
    expect(clientConfigChange("src/client", "app/layer", true)).toBe("write");
  });
});
