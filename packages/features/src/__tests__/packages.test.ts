// @feat:package-layering
import { describe, expect, it } from "vitest";
import { packageLayerProblems, readPackageMeta, type LayerPackage } from "../packages";

const sitesModule = {
  name: "Sites",
  summary: "Sites and landing pages.",
  blocks: ["sites"],
  schema: "genesis_sites",
  install: "genesis add sites",
  docs: "README.md",
  skill: "SKILL.md",
};

function workspace(): LayerPackage[] {
  return [
    { name: "@x/design", genesis: { layer: "foundation", group: "core", essential: true }, uses: [] },
    { name: "@x/ui", genesis: { layer: "foundation", group: "core", essential: true }, uses: ["@x/design", "react"] },
    { name: "@x/forms", genesis: { layer: "primitive", group: "forms" }, uses: ["@x/ui/data"] },
    { name: "@x/chat", genesis: { layer: "primitive", group: "collaboration" }, uses: ["@x/ui", "@x/forms"] },
    { name: "@x/sites", genesis: { layer: "module", group: "modules", module: sitesModule, blocks: { sites: {} } }, uses: ["@x/forms", "@x/ui"] },
    {
      name: "@x/product",
      genesis: { layer: "module", group: "modules", toolingEntries: ["./node"], module: { ...sitesModule, name: "Product", blocks: ["board"], install: "genesis add board", schema: undefined }, blocks: { board: {} } },
      exports: [".", "./node"],
      uses: ["@x/ui"],
    },
    { name: "@x/cli", genesis: { layer: "tooling", group: "core" }, uses: ["@x/sites", "@x/product/node", "@x/chat"] },
  ];
}

/** The workspace with one package replaced by `change(pkg)`. */
function plant(name: string, change: (pkg: LayerPackage) => LayerPackage): LayerPackage[] {
  return workspace().map((p) => (p.name === name ? change(p) : p));
}
const using = (...uses: string[]) => (p: LayerPackage) => ({ ...p, uses: [...p.uses, ...uses] });

describe("packageLayerProblems", () => {
  it("passes a workspace whose dependencies point down, tooling using anything", () => {
    expect(packageLayerProblems(workspace())).toEqual([]);
  });

  it("fails a foundation package that uses a primitive", () => {
    expect(packageLayerProblems(plant("@x/ui", using("@x/chat")))).toEqual([
      "@x/ui (foundation) uses @x/chat (primitive): a foundation package depends only on foundation packages",
    ]);
  });

  it("fails a primitive that uses a module (the umbrella may bundle primitives, never modules)", () => {
    expect(packageLayerProblems(plant("@x/chat", using("@x/sites/web")))).toEqual([
      "@x/chat (primitive) uses @x/sites (module): a primitive depends only on foundation packages and other primitives (never a module)",
    ]);
  });

  it("allows a module to use another module only when requiresModules lists it", () => {
    expect(packageLayerProblems(plant("@x/sites", using("@x/product")))).toEqual([
      "@x/sites (module) uses @x/product (module): a module depends on another module only when genesis.module.requiresModules lists it",
    ]);
    const declared = plant("@x/sites", (p) => ({
      ...using("@x/product")(p),
      genesis: { ...(p.genesis as object), module: { ...sitesModule, requiresModules: ["@x/product"] } },
    }));
    expect(packageLayerProblems(declared)).toEqual([]);
  });

  it("refuses requiresModules naming something that isn't a module", () => {
    const wrong = plant("@x/sites", (p) => ({ ...p, genesis: { ...(p.genesis as object), module: { ...sitesModule, requiresModules: ["@x/forms"] } } }));
    expect(packageLayerProblems(wrong)).toEqual(['@x/sites genesis.module.requiresModules: "@x/forms" is not a module']);
  });

  it("fails a runtime package that uses tooling, or a tooling entry point", () => {
    expect(packageLayerProblems(plant("@x/forms", using("@x/cli")))).toEqual([
      "@x/forms (primitive) uses @x/cli, which is tooling: no runtime package depends on tooling",
    ]);
    expect(packageLayerProblems(plant("@x/sites", using("@x/product/node")))).toEqual([
      "@x/sites (module) imports @x/product/node, a tooling entry point of @x/product",
    ]);
  });

  it("fails a cycle among runtime packages", () => {
    const problems = packageLayerProblems(plant("@x/forms", using("@x/chat")));
    expect(problems).toEqual(["dependency cycle: @x/forms → @x/chat → @x/forms"]);
  });

  it("keeps primitives and foundation off optional packages, except as optional peers", () => {
    const media = { name: "@x/media", genesis: { layer: "primitive", group: "data", optional: true }, uses: ["@x/ui"] };
    const forms = (over: Partial<LayerPackage>): LayerPackage => ({ name: "@x/forms", genesis: { layer: "primitive", group: "forms" }, uses: ["@x/ui/data", "@x/media"], ...over });
    const base = workspace().filter((p) => p.name !== "@x/forms");
    expect(packageLayerProblems([...base, media, forms({})])).toEqual([
      "@x/forms (primitive) uses @x/media, which is optional: define a port in @x/forms and let @x/media ship the adapter (or list it as an optional peer dependency)",
    ]);
    expect(packageLayerProblems([...base, media, forms({ optionalPeers: ["@x/media"] })])).toEqual([]);
    // The optional package may use primitives (it ships their adapters), and a module may use it.
    const adapter = { ...media, uses: ["@x/ui", "@x/forms"] };
    const sites = workspace().find((p) => p.name === "@x/sites")!;
    expect(packageLayerProblems([...base, adapter, forms({ uses: ["@x/ui/data"] }), { ...sites, uses: [...sites.uses, "@x/media"] }])).toEqual([]);
  });

  it("leaves an optional peer out of the cycle search, so the adapter may use the primitive", () => {
    const adapter = { name: "@x/media", genesis: { layer: "primitive", group: "data", optional: true }, uses: ["@x/ui", "@x/forms"] };
    const base = workspace().filter((p) => p.name !== "@x/forms");
    const forms: LayerPackage = { name: "@x/forms", genesis: { layer: "primitive", group: "forms" }, uses: ["@x/ui/data", "@x/media"], optionalPeers: ["@x/media"] };
    expect(packageLayerProblems([...base, adapter, forms])).toEqual([]);
  });

  it("allows an optional peer only for types or import(), when valueImports is given", () => {
    const media = { name: "@x/media", genesis: { layer: "primitive", group: "data", optional: true }, uses: ["@x/ui"] };
    const base = workspace().filter((p) => p.name !== "@x/forms");
    const forms = (valueImports: string[]): LayerPackage => ({ name: "@x/forms", genesis: { layer: "primitive", group: "forms" }, uses: ["@x/ui/data", "@x/media"], optionalPeers: ["@x/media"], valueImports });
    expect(packageLayerProblems([...base, media, forms(["@x/ui/data"])])).toEqual([]);
    expect(packageLayerProblems([...base, media, forms(["@x/media/forms"])])).toEqual([
      "@x/forms (primitive) imports @x/media statically, but it is an optional peer: import it for types only or with import(), so @x/forms still loads without it",
    ]);
  });

  it("refuses genesis.overlay on a Genesis package itself", () => {
    const overlay = { upstream: "@x/forms@1.0.0", since: "2026-10-30", owner: "a", reason: "b" };
    const problems = packageLayerProblems(plant("@x/forms", (p) => ({ ...p, genesis: { ...(p.genesis as object), overlay } })));
    expect(problems).toContainEqual("@x/forms genesis.overlay: only an app's local copy of a Genesis package carries one, never the package itself");
  });

  it("ignores packages outside the set and a package's own subpaths", () => {
    expect(packageLayerProblems(plant("@x/forms", using("left-pad", "@x/forms/react")))).toEqual([]);
  });
});

describe("readPackageMeta", () => {
  const meta = (genesis: unknown, exportsKeys?: string[]) => {
    const problems: string[] = [];
    readPackageMeta("@x/p", genesis, problems, exportsKeys);
    return problems;
  };

  it("takes an owner that is a GitHub handle or team", () => {
    expect(meta({ layer: "primitive", group: "data", owner: "@octocat" })).toEqual([]);
    expect(meta({ layer: "primitive", group: "data", owner: "@acme/web" })).toEqual([]);
    expect(meta({ layer: "primitive", group: "data", owner: "octocat" })).toEqual(['@x/p genesis.owner: must be a GitHub handle or team, like "@octocat" or "@acme/web"']);
  });

  it("needs a layer and a group from the lists", () => {
    expect(meta(undefined)).toEqual(['@x/p genesis: missing; every package declares "genesis": { "layer", "group" }']);
    expect(meta({ layer: "block", group: "start-here" })).toEqual([
      '@x/p genesis.layer: must be one of foundation, primitive, module, tooling, not "block"',
      '@x/p genesis.group: must be one of core, data, ai, forms, collaboration, shells, modules, not "start-here"',
    ]);
  });

  it("keeps essential to foundation and tooling, and the modules group to modules", () => {
    expect(meta({ layer: "primitive", group: "data", essential: true })).toEqual(["@x/p genesis.essential: only a foundation or tooling package is essential, not a primitive"]);
    expect(meta({ layer: "primitive", group: "modules" })).toEqual(['@x/p genesis.group: a module is in the "modules" group, and only a module is']);
  });

  it("needs a module block on a module, pointing at its own blocks, and none elsewhere", () => {
    expect(meta({ layer: "module", group: "modules" })).toEqual(["@x/p genesis.module: a module declares its card and install (name, summary, blocks, install, docs, skill)"]);
    expect(meta({ layer: "primitive", group: "data", module: sitesModule })[0]).toBe('@x/p genesis.module: only a package with layer "module" has one');
    expect(meta({ layer: "module", group: "modules", module: { ...sitesModule, install: "genesis add blog", plan: "pro" }, blocks: { sites: {} } })).toEqual([
      "@x/p genesis.module.plan: unknown key (one of name, summary, blocks, requiresModules, schema, install, docs, skill)",
      '@x/p genesis.module.install: "blog" is not one of the module\'s blocks',
    ]);
    expect(meta({ layer: "module", group: "modules", module: sitesModule })).toEqual(['@x/p genesis.module.blocks: "sites" is not in genesis.blocks']);
    expect(meta({ layer: "module", group: "modules", module: { ...sitesModule, skill: "../SKILL.md", docs: "http://x", schema: "Bad-Name" }, blocks: { sites: {} } })).toEqual([
      "@x/p genesis.module.schema: must be a Postgres schema name",
      '@x/p genesis.module.docs: a path in the package or an https URL, not "http://x"',
      '@x/p genesis.module.skill: a SKILL.md path in the package, not "../SKILL.md"',
    ]);
  });

  it("keeps optional to primitives and modules", () => {
    const problems: string[] = [];
    readPackageMeta("@x/a", { layer: "foundation", group: "core", optional: true }, problems);
    readPackageMeta("@x/b", { layer: "primitive", group: "data", optional: "yes" }, problems);
    expect(problems).toEqual([
      "@x/a genesis.optional: a foundation package can't be optional; only a primitive or module is an upgrade apps opt into",
      "@x/b genesis.optional: must be true or false",
    ]);
    expect(readPackageMeta("@x/c", { layer: "primitive", group: "data", optional: true })).not.toBeNull();
  });

  it("needs tooling entries to be exports of the package", () => {
    expect(meta({ layer: "module", group: "modules", module: sitesModule, blocks: { sites: {} }, toolingEntries: ["./cli"] }, [".", "./node"])).toEqual([
      '@x/p genesis.toolingEntries: "./cli" is not in the package\'s exports',
    ]);
  });
});

describe("the deprecated feature layer", () => {
  it("finds an element by either name", async () => {
    const { defineFeatures, findFeatures } = await import("../model");
    const features = defineFeatures({
      button: { name: "Button", summary: "A button.", status: "live", owner: "x", apps: ["web"], audience: ["developer"], layer: "primitive", acceptance: ["It clicks."] },
      card: { name: "Card", summary: "A card.", status: "live", owner: "x", apps: ["web"], audience: ["developer"], layer: "element", acceptance: ["It holds."] },
    });
    const ids = (layer: "element" | "primitive") => findFeatures(features, "", undefined, { layer }).map((r) => r.id).sort();
    expect(ids("element")).toEqual(["button", "card"]);
    expect(ids("primitive")).toEqual(["button", "card"]);
  });
});
