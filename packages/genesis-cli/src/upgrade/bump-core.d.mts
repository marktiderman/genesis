export declare const UMBRELLA: "@marktiderman/genesis";
export declare const GENESIS: RegExp;
export declare const EXACT: RegExp;
export declare const PLAIN: RegExp;
export declare const SECTIONS: readonly string[];

export interface BumpChange {
  file: string;
  name: string;
  from: string;
  to: string;
}
export interface BumpSkip {
  file: string;
  name: string;
  spec: string;
  why: string;
}

export declare function compareVersions(a: string, b: string): number;
export declare function bumpPackageJson(
  file: string,
  text: string,
  wanted: (name: string) => string | null | undefined,
): { text: string | null; changes: BumpChange[]; skipped: BumpSkip[] };
export declare function bumpSummary(version: string, changes: BumpChange[], skipped: BumpSkip[]): string;

/** The Genesis versions a pnpm lockfile resolves: package name to its versions. */
export declare function lockedGenesisVersions(lockText: string): Map<string, Set<string>>;
/**
 * pnpm-workspace.yaml's text with one `minimumReleaseAgeExclude` entry per Genesis package, listing
 * the exact versions pinned (`'name@1.0.0 || 1.1.0'`); with `locked`, versions it doesn't hold are
 * dropped. Patterns and every other entry are left as they are.
 */
export declare function normaliseReleaseAgeExcludes(text: string, locked?: Map<string, Set<string>> | null): string;
/** The nearest pnpm-workspace.yaml at or above `start` (as pnpm finds it), up to `stop`, else one in `fallback`. */
export declare function pnpmWorkspaceFile(
  start: string,
  fallback: string,
  fs: { exists: (file: string) => boolean; join: (...parts: string[]) => string; dirname: (dir: string) => string },
  stop?: string,
): string;
/** The versions the tidy keeps: the lockfile beside pnpm-workspace.yaml's, or null (drop nothing). */
export declare function tidyLocked(workspaceText: string, lockText: string | null): Map<string, Set<string>> | null;
