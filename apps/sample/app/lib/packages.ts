/**
 * Every Genesis package, read from packages/*\/package.json at build time,
 * so a new package appears on the site with no hand edit. Each package's
 * `genesis` key says its layer and group (docs/PACKAGE-STRATEGY.md, "Layers").
 */
import type { PackageGroup, PackageLayer, PackageMeta } from "@marktiderman/genesis-features";

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  private?: boolean;
  exports?: Record<string, unknown> | string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  genesis?: Partial<PackageMeta>;
}

const files = import.meta.glob<PackageJson>("../../../../packages/*/package.json", { eager: true, import: "default" });

/** A module's card: what it is, what it's built from, what it owns, how to add it. */
export interface GenesisModule {
  name: string;
  summary: string;
  install: string;
  schema?: string;
  /** The Genesis packages it uses (short names), from its dependencies. */
  builtFrom: string[];
}

export interface GenesisPackage {
  /** The folder under packages/. */
  dir: string;
  name: string;
  /** The name without the scope and the `genesis-` prefix: `ui`, `forms-web`. */
  short: string;
  version: string;
  description: string;
  /** Entry points, `.` first. */
  entries: string[];
  layer: PackageLayer;
  group: PackageGroup;
  essential: boolean;
  module?: GenesisModule;
}

const shortName = (name: string) => name.replace(/^@marktiderman\//, "").replace(/^genesis-?/, "") || "genesis";

export const PACKAGES: GenesisPackage[] = Object.entries(files)
  .map(([path, json]) => ({ dir: path.split("/").at(-2)!, json }))
  .filter(({ json }) => !json.private)
  .map(({ dir, json }) => {
    const genesisDeps = Object.keys({ ...json.dependencies, ...json.peerDependencies })
      .filter((d) => d.startsWith("@marktiderman/genesis"))
      .map(shortName)
      .sort();
    const mod = json.genesis?.module;
    return {
      dir,
      name: json.name,
      short: shortName(json.name),
      version: json.version,
      description: json.description ?? "",
      entries:
        typeof json.exports === "object" && json.exports
          ? Object.keys(json.exports).filter((k) => !k.endsWith(".css") && !k.endsWith(".json") && !k.includes("*") && k !== "./package.json")
          : ["."],
      // The layering check (pnpm check:package-layers) makes these present and valid.
      layer: json.genesis?.layer ?? "primitive",
      group: json.genesis?.group ?? "core",
      essential: json.genesis?.essential === true,
      ...(mod
        ? { module: { name: mod.name, summary: mod.summary, install: mod.install, ...(mod.schema ? { schema: mod.schema } : {}), builtFrom: genesisDeps } }
        : {}),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** The umbrella package's version: the one version coordinate for Genesis. */
export const GENESIS_VERSION = PACKAGES.find((p) => p.name === "@marktiderman/genesis")?.version ?? "";

/** The layers as the site shows them, top to bottom: dependencies only point down. */
export const LAYER_BANDS: Array<{ layer: PackageLayer; title: string; level: string; blurb: string }> = [
  { layer: "module", title: "Modules", level: "Level 2", blurb: "Mini apps with their own tables, screens and settings, built from the layers below. Add one with genesis add and switch it on per tenant." },
  { layer: "primitive", title: "Primitives", level: "Level 1", blurb: "Capabilities an app or a module composes: data, AI, forms, collaboration and the app shells." },
  { layer: "foundation", title: "Foundation", level: "Level 1", blurb: "What every app needs: tokens, components, the data contract and the feature registry." },
];

/** Group names, in the order they appear inside a band. */
export const GROUP_LABELS: Record<PackageGroup, string> = {
  core: "Core",
  data: "Data",
  ai: "AI",
  forms: "Forms",
  collaboration: "Collaboration",
  shells: "Shells",
  modules: "Modules",
};

/** A band's packages, grouped by `group` in GROUP_LABELS order. */
export function packagesIn(layer: PackageLayer): Array<{ group: PackageGroup; packages: GenesisPackage[] }> {
  const inLayer = PACKAGES.filter((p) => p.layer === layer);
  return (Object.keys(GROUP_LABELS) as PackageGroup[])
    .map((group) => ({ group, packages: inLayer.filter((p) => p.group === group) }))
    .filter((g) => g.packages.length > 0);
}
