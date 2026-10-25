/**
 * genesisNativewindContent: Tailwind content globs for the Genesis React
 * Native packages an app uses, found the way Node finds them (hoisted,
 * nested or linked), through their dependencies too.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { genesisNativewindContent } from "../nativewind";

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function pkg(dir: string, manifest: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
}

describe("genesisNativewindContent", () => {
  it("lists src and dist of each React Native Genesis package, hoisted or linked, following dependencies", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "nw-content-")));
    dirs.push(root);
    const app = join(root, "apps", "app");
    pkg(app, { dependencies: { "@marktiderman/genesis-native": "1", "@marktiderman/genesis-core": "1", react: "19" } });
    // Hoisted to the workspace root, not in the app's node_modules.
    const hoisted = join(root, "node_modules", "@marktiderman");
    pkg(join(hoisted, "genesis-native"), {
      peerDependencies: { "react-native": "*" },
      dependencies: { "@marktiderman/genesis-ui-native": "1" },
      devDependencies: { "@marktiderman/genesis-forms": "1" },
    });
    pkg(join(hoisted, "genesis-core"), {});
    // A workspace link.
    const linked = join(root, "packages", "ui-native");
    pkg(linked, { peerDependencies: { nativewind: "*" }, exports: { ".": "./dist/index.js" } });
    symlinkSync(linked, join(hoisted, "genesis-ui-native"));
    pkg(join(hoisted, "genesis-forms"), { peerDependencies: { "react-native": "*" } });

    expect(genesisNativewindContent({ root: app })).toEqual([
      `${join(hoisted, "genesis-native")}/src/**/*.{ts,tsx}`,
      `${join(hoisted, "genesis-native")}/dist/**/*.js`,
      `${linked}/src/**/*.{ts,tsx}`,
      `${linked}/dist/**/*.js`,
    ]);
  });

  it("is empty for an app without Genesis packages", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "nw-content-")));
    dirs.push(root);
    pkg(root, { dependencies: { react: "19" } });
    expect(genesisNativewindContent({ root })).toEqual([]);
  });
});
