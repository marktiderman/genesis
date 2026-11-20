/**
 * The UI source token-usage and design-system-coverage scan when they are given no paths: the
 * apps, every package's `src` and the CLI wizard's. Packages ship UI (support's screens, chat's,
 * the wizard) as much as the apps do, so they are gated too. testid-coverage keeps a bar per scope
 * (`check:testid-coverage` for the apps, `check:testid-coverage:packages`).
 */
import fs from 'node:fs';
import path from 'node:path';

/** As globs, for design-system-coverage's SCAN_PATHS. */
export const UI_SCAN_GLOBS = ['apps', 'packages/*/src', 'packages/genesis-cli/wizard/src'];

/** The same, as the directories that exist under `repoRoot`. */
export function defaultUiScanRoots(repoRoot) {
  const roots = [path.join(repoRoot, 'apps')];
  const packages = path.join(repoRoot, 'packages');
  if (fs.existsSync(packages)) {
    for (const entry of fs.readdirSync(packages, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const src = path.join(packages, entry.name, 'src');
      if (fs.existsSync(src)) roots.push(src);
    }
  }
  const wizard = path.join(repoRoot, 'packages', 'genesis-cli', 'wizard', 'src');
  if (fs.existsSync(wizard)) roots.push(wizard);
  return roots;
}
