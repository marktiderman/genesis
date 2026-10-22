// The raw-color lexer shared by check-token-usage.mjs and `genesis doctor`.
import { describe, expect, it } from 'vitest';
import {
  LINE_COMMENT_EXTS,
  findColorFunctions,
  findHexLiterals,
  stripBlockComments,
} from '../lib/color-literals.mjs';

describe('color-literals', () => {
  it('finds hex literals, skipping pure-decimal issue refs and HTML entities', () => {
    expect(findHexLiterals('color: #ff0000; border: #abc;').map((h) => h.literal)).toEqual(['#ff0000', '#abc']);
    expect(findHexLiterals('Merged PR #163, order #1284, &#1234;')).toEqual([]);
    expect(findHexLiterals('x #000000')).toEqual([{ literal: '#000000', column: 3 }]);
  });

  it('finds numeric color functions but spares token-backed ones', () => {
    expect(findColorFunctions('a: rgba(0,0,0,0.08); b: hsl(var(--primary));').map((h) => h.literal)).toEqual(['rgba(0,0,0,0.08)']);
  });

  it('blanks comments, keeps line numbers, and leaves strings and url() alone', () => {
    const src = '/* #fff */\nconst a = "/* #000 */"; // #abc\n';
    const out = stripBlockComments(src, true);
    expect(out.split('\n')).toHaveLength(3);
    expect(findHexLiterals(out.split('\n')[0])).toEqual([]);
    expect(out).toContain('"/* #000 */"');
    expect(out).not.toContain('#abc');
    // Plain CSS has no `//` comment: a url() must not hide a hex after it.
    const css = stripBlockComments('a { background: url(https://x/y.svg); color: #ff0000; }', LINE_COMMENT_EXTS.has('.css'));
    expect(findHexLiterals(css).map((h) => h.literal)).toEqual(['#ff0000']);
  });
});
