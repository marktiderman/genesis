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
