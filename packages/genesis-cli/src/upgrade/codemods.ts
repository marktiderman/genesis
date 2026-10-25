/**
 * Codemods for breaking changes. A release that breaks an app's code declares
 * it here, with the package and the first version that needs it; `genesis
 * upgrade` runs a codemod only when that package moves across that version.
 * Nothing breaking has shipped that needs one yet, so the list is empty.
 */
import { compareVersions } from "./bump-core.mjs";
import type { BumpChange } from "./bump-core.mjs";

export interface CodemodContext {
  root: string;
  dryRun: boolean;
  log: (msg: string) => void;
}

export interface Codemod {
  /** Unique, e.g. `genesis-ui-2-button-variant`. */
  id: string;
  /** The package whose release breaks apps. */
  package: string;
  /** The first version with the break: a move from below it to it or above runs this. */
  version: string;
  /** What breaks, and what the codemod changes, in one sentence. */
  description: string;
  /** Change the app; returns the app-relative files it changed. */
  run(context: CodemodContext): Promise<string[]> | string[];
}

export const CODEMODS: readonly Codemod[] = [];

const bare = (spec: string) => spec.replace(/^[\^~=]/, "");

/** The codemods a set of version changes crosses, in registry order. */
export function codemodsFor(changes: readonly BumpChange[], registry: readonly Codemod[] = CODEMODS): Codemod[] {
  return registry.filter((mod) =>
    changes.some((c) => c.name === mod.package && compareVersions(bare(c.from), mod.version) < 0 && compareVersions(bare(c.to), mod.version) >= 0),
  );
}

/** Changes that cross a major version (or a 0.x minor) with no codemod declared: worth reading the changelog. */
export function uncoveredBreaks(changes: readonly BumpChange[], registry: readonly Codemod[] = CODEMODS): BumpChange[] {
  const major = (v: string) => {
    const [a, b] = bare(v).split(".").map(Number);
    return a === 0 ? `0.${b}` : String(a);
  };
  return changes.filter((c) => major(c.from) !== major(c.to) && codemodsFor([c], registry).length === 0);
}
