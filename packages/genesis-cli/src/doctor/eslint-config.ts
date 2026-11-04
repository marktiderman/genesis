/**
 * `genesis-eslint-config` (warn): a native app whose ESLint flat config doesn't load Genesis's
 * lint rules from `@marktiderman/genesis-cli/eslint`, so `genesis upgrade` can't deliver them
 * (React Native Testing Library 14's await rules today), or loads them without
 * `eslint-plugin-testing-library` in its package.json, so the config fails to load.
 *
 * Web apps aren't checked: Genesis has no web lint rules yet. An app with no flat config (no lint,
 * or a legacy `.eslintrc`) isn't checked either. Ratcheted by default (index.ts), so under `--base`
 * an eslint config nobody touched reports `info`.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { detectPackageManager, installCommand, shellLine } from "../blocks/pm.js";
import { appPlatform, findEslintConfig, hasTestingLibrary, readPackageJson, TESTING_LIBRARY, usesGenesisLint } from "../upgrade/eslint-config.js";
import { findPackageDir } from "./genesis.js";
import type { DoctorContext } from "./types.js";

export function checkEslintConfig(ctx: DoctorContext): void {
  const pkg = readPackageJson(ctx.root);
  const native = appPlatform(pkg) === "native" || (ctx.config.packs?.includes("native") ?? false);
  if (!native) return;
  const file = findEslintConfig(ctx.root);
  if (!file) return;
  let text: string;
  try {
    text = readFileSync(path.join(ctx.root, file), "utf8");
  } catch {
    return;
  }
  if (!usesGenesisLint(text)) {
    ctx.report({
      rule: "genesis-eslint-config",
      level: "warn",
      file,
      subject: "@marktiderman/genesis-cli/eslint",
      message: `doesn't load Genesis's lint rules, so genesis upgrade can't bring new ones (React Native Testing Library 14's await rules today). Run genesis codemod genesis-cli-eslint-config, or add const { genesis } = require("@marktiderman/genesis-cli/eslint") (import { genesis } from … in an ES module) and ...genesis("native") last in the array the config exports, with ${TESTING_LIBRARY} in devDependencies`,
    });
  } else if (!hasTestingLibrary(pkg)) {
    ctx.report({
      rule: "genesis-eslint-config",
      level: "warn",
      file: "package.json",
      subject: TESTING_LIBRARY,
      message: `${file} loads Genesis's native lint rules, which need ${TESTING_LIBRARY}: add it to devDependencies (pnpm add -D ${TESTING_LIBRARY}), or the lint can't load its config`,
    });
  } else if (!findPackageDir(ctx.root, TESTING_LIBRARY)) {
    ctx.report({
      rule: "genesis-eslint-config",
      level: "warn",
      file: "package.json",
      subject: TESTING_LIBRARY,
      message: `lists ${TESTING_LIBRARY}, which ${file} needs, but it isn't installed, so the lint can't load its config: run ${shellLine(installCommand(detectPackageManager(ctx.root)))}`,
    });
  }
}
