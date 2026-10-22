// Types for color-literals.mjs, so TypeScript callers (genesis-cli's doctor)
// can import the shared lexer without allowJs.

/** A raw color literal found in a line, with its 1-based column. */
export interface ColorLiteral {
  literal: string;
  column: number;
}

/** Extensions where `//` opens a real line comment. */
export declare const LINE_COMMENT_EXTS: ReadonlySet<string>;

/** Blank out comments while preserving line numbers and leaving string/template literals intact. */
export declare function stripBlockComments(content: string, hasLineComments?: boolean): string;

/** Raw hex color literals in a line (pure-decimal 3/4-digit runs are skipped as issue refs). */
export declare function findHexLiterals(line: string): ColorLiteral[];

/** Raw rgb()/rgba()/hsl()/hsla() literals with numeric arguments in a line. */
export declare function findColorFunctions(line: string): ColorLiteral[];
