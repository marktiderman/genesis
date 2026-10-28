// The component reference's declaration lookup: re-export chains and async functions.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDeclaration } from '../gen-component-reference.mjs';

function files(map) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-ref-'));
  for (const [path, body] of Object.entries(map)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

describe('resolveDeclaration', () => {
  it('reads an async function as a function', () => {
    const dir = files({ 'a.ts': '/** Switches. */\nexport async function switchTo() {}\n' });
    expect(resolveDeclaration(join(dir, 'a.ts'), 'switchTo')).toMatchObject({ kind: 'function', summary: 'Switches.' });
  });

  it('follows a local re-export chain to the declaration', () => {
    const dir = files({
      'viewer.ts': '/** Nobody. */\nexport const NOBODY = {};\n',
      'scope.ts': 'import { NOBODY } from "./viewer";\nexport { NOBODY };\n',
      'index.ts': 'export { NOBODY as NO_ONE } from "./scope";\n',
    });
    expect(resolveDeclaration(join(dir, 'index.ts'), 'NO_ONE')).toMatchObject({ kind: 'const', file: join(dir, 'viewer.ts') });
  });

  it('follows a package-qualified re-export into the workspace package', () => {
    const dir = files({ 'doc.ts': 'export { isSafeUrl } from "@marktiderman/genesis-core/urls";\n' });
    const found = resolveDeclaration(join(dir, 'doc.ts'), 'isSafeUrl');
    expect(found).toMatchObject({ kind: 'function' });
    expect(found.file).toMatch(/packages\/core\/src\/urls\.ts$/);
  });

  it('returns null for a name it cannot find', () => {
    const dir = files({ 'a.ts': 'export const x = 1;\n' });
    expect(resolveDeclaration(join(dir, 'a.ts'), 'y')).toBeNull();
  });
});
