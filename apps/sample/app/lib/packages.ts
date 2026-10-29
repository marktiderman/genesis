/**
 * Every Genesis package, read from packages/*\/package.json at build time,
 * so a new package appears on the site with no hand edit.
 */
interface PackageJson {
  name: string;
  version: string;
  description?: string;
  private?: boolean;
  exports?: Record<string, unknown> | string;
}

const files = import.meta.glob<PackageJson>("../../../../packages/*/package.json", { eager: true, import: "default" });

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
}

export const PACKAGES: GenesisPackage[] = Object.entries(files)
  .map(([path, json]) => ({ dir: path.split("/").at(-2)!, json }))
  .filter(({ json }) => !json.private)
  .map(({ dir, json }) => ({
    dir,
    name: json.name,
    short: json.name.replace(/^@marktiderman\//, "").replace(/^genesis-?/, "") || "genesis",
    version: json.version,
    description: json.description ?? "",
    entries:
      typeof json.exports === "object" && json.exports
        ? Object.keys(json.exports).filter((k) => !k.endsWith(".css") && !k.endsWith(".json") && !k.includes("*") && k !== "./package.json")
        : ["."],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The umbrella package's version: the one version coordinate for Genesis. */
export const GENESIS_VERSION = PACKAGES.find((p) => p.name === "@marktiderman/genesis")?.version ?? "";
