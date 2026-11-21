import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { missedValueCheck } from "../src/doctor/missed-value.js";
import type { BlockManifest } from "../src/blocks/manifest.js";
import type { DoctorContext, FindingInput, SourceFile } from "../src/doctor/types.js";

function block(over: Partial<BlockManifest> & { id: string }): BlockManifest {
  return {
    package: "@marktiderman/genesis-native",
    requires: [],
    platforms: ["native"],
    packages: ["@marktiderman/genesis-native"],
    install: [],
    migrations: [],
    functions: [],
    routes: [],
    skills: [],
    steps: ["Create it."],
    feature: { name: over.id, summary: "It does a thing." },
    ...over,
  };
}

function app(files: Record<string, string>, opts: { native?: boolean; eas?: boolean; declined?: Record<string, string> } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "missed-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: opts.native === false ? { "react-dom": "19" } : { expo: "58" } }));
  if (opts.eas) {
    mkdirSync(path.join(root, ".eas", "workflows"), { recursive: true });
    writeFileSync(path.join(root, ".eas", "workflows", "pr-preview.yml"), "name: PR preview\n");
  }
  const sources: SourceFile[] = Object.entries(files).map(([p, text]) => ({ path: p, absolutePath: path.join(root, p), ext: path.extname(p), text, code: text }));
  const found: FindingInput[] = [];
  const ctx = { root, files: sources, config: { declined: opts.declined }, report: (f: FindingInput) => found.push(f) } as unknown as DoctorContext;
  return { ctx, found };
}

const blocks = [
  { manifest: block({ id: "app-updates", detect: { imports: ["createUpdates"], off: [{ pattern: "enabled:\\s*__DEV__", message: "on only in development" }] } }), from: "installed" },
  { manifest: block({ id: "push", detect: { imports: ["createPush"] } }), from: "installed" },
  { manifest: block({ id: "mystery" }), from: "installed" },
  { manifest: block({ id: "notifications", package: "@marktiderman/genesis-notifications", packages: ["@marktiderman/genesis-notifications"] }), from: "catalog" },
  { manifest: block({ id: "web-only", platforms: ["web"] }), from: "catalog" },
];

describe("missed-value", () => {
  it("names what's unused, what's switched off and the missing preview lane; skips what it can't tell and other platforms", async () => {
    const { ctx, found } = app({
      "src/lib/updates.ts": 'import { createUpdates } from "@marktiderman/genesis-native/updates";\nexport const u = createUpdates({ channels: { enabled: __DEV__ } });\n',
    });
    await missedValueCheck({ blocks: async () => blocks, catalog: () => [] })(ctx);
    const by = Object.fromEntries(found.map((f) => [f.subject, f]));
    expect(Object.keys(by).sort()).toEqual(["app-updates", "notifications", "pr-previews", "push"]);
    expect(by["app-updates"]).toMatchObject({ file: "src/lib/updates.ts", line: 2, level: "info" });
    expect(by["app-updates"]!.message).toMatch(/switched off here: on only in development/);
    expect(by["push"]!.message).toMatch(/available and unused/);
    expect(by["notifications"]!.file).toBe("package.json");
  });

  // genesis-native's own declaration, so a change to its pattern is tested here.
  const nativeDetect = (JSON.parse(readFileSync(path.join(__dirname, "../../native/package.json"), "utf8")) as { genesis: { blocks: Record<string, { detect: BlockManifest["detect"] }> } }).genesis.blocks["app-updates"]!.detect!;

  it.each([
    ["no trailing comma", "createUpdates({ channels: { enabled: __DEV__ } })", true],
    ["a trailing comma", "createUpdates({ channels: { enabled: __DEV__, } })", true],
    ["switching on", "createUpdates({ channels: { enabled: true } })", false],
    ["__DEV__ === false (on in release builds)", "createUpdates({ channels: { enabled: __DEV__ === false } })", false],
    ["__DEV__ || true (always on)", "createUpdates({ channels: { enabled: __DEV__ || true } })", false],
    ["!__DEV__", "createUpdates({ channels: { enabled: !__DEV__ } })", false],
    ["__DEV__ || a test flag", "createUpdates({ channels: { enabled: __DEV__ || process.env.EXPO_PUBLIC_TEST === \"1\" } })", true],
  ])("genesis-native's switched-off pattern, with %s", async (_label, call, reported) => {
    const { ctx, found } = app({ "src/lib/updates.ts": `import { createUpdates } from "@marktiderman/genesis-native/updates";\nexport const u = ${call};\nconst diagnostics = { channels: { enabled: __DEV__ } };\n` }, { eas: true });
    await missedValueCheck({ blocks: async () => [{ manifest: block({ id: "app-updates", detect: nativeDetect }), from: "installed" }], catalog: () => [] })(ctx);
    expect(found.some((f) => f.subject === "app-updates")).toBe(reported);
  });

  it("follows an import alias, and ignores a call written inside a string or a comment", async () => {
    const run = async (code: string) => {
      const { ctx, found } = app({ "src/lib/updates.ts": code }, { eas: true });
      await missedValueCheck({ blocks: async () => [{ manifest: block({ id: "app-updates", detect: nativeDetect }), from: "installed" }], catalog: () => [] })(ctx);
      return found.some((f) => f.subject === "app-updates");
    };
    const imp = 'import { createUpdates as makeUpdates } from "@marktiderman/genesis-native/updates";\n';
    expect(await run(`${imp}export const u = makeUpdates({ channels: { enabled: __DEV__ } });\n`)).toBe(true);
    const plain = 'import { createUpdates } from "@marktiderman/genesis-native/updates";\n';
    expect(await run(`${plain}export const u = createUpdates({ channels: { enabled: true } });\nconst doc = "createUpdates({ channels: { enabled: __DEV__ } })";\n// createUpdates({ channels: { enabled: __DEV__ } })\n`)).toBe(false);
    // An import written inside a string (an example) isn't an import.
    const pushBlock = { manifest: block({ id: "push", detect: { imports: ["createPush"] } }), from: "installed" };
    const quoted = app({ "src/docs.ts": `const example = 'import { createPush } from "@marktiderman/genesis-native/push"';\n` }, { eas: true });
    await missedValueCheck({ blocks: async () => [pushBlock], catalog: () => [] })(quoted.ctx);
    expect(quoted.found.map((f) => f.subject)).toEqual(["push"]);
    // A quote inside a regex literal opens no string: the import and call after it are still read.
    expect(await run(`const quote = /"/;\nconst ratio = a / b;\n${plain}export const u = createUpdates({ channels: { enabled: __DEV__ } });\n`)).toBe(true);
    // A template literal's \${…} hole is code; its text isn't.
    expect(await run(`${plain}const label = \`v\${1}\`;\nexport const u = createUpdates({ channels: { enabled: __DEV__ } });\n`)).toBe(true);
    // A postfix ++ then a division isn't a regex.
    expect(await run(`${plain}let attempts = 0, total = 1;\nexport const u = createUpdates({ onError: () => attempts++ / total, channels: { enabled: __DEV__ } });\n`)).toBe(true);
    // Two holes side by side: the second still reads a regex as a regex.
    expect(await run(`${plain}const value = "}";\nexport const label = \`\${1}\${/[}]/.test(value) ? createUpdates({ channels: { enabled: __DEV__ } }) : ""}\`;\n`)).toBe(true);
    // The older documented forms keep previews off in release builds too.
    expect(await run(`${plain}export const u = createUpdates({ channels: { enabled: __DEV__ || isPreview } });\n`)).toBe(true);
    expect(await run(`${plain}export const u = createUpdates({ channels: { enabled: __DEV__ || TEST_BUILD === "1" } });\n`)).toBe(true);
    // A namespace import is used (never "missed"), and read for switched-off like a named one.
    const ns = 'import * as U from "@marktiderman/genesis-native/updates";\n';
    expect(await run(`${ns}export const u = U.createUpdates({ channels: { enabled: true } });\n`)).toBe(false);
    expect(await run(`${ns}export const u = U.createUpdates({ channels: { enabled: __DEV__ } });\n`)).toBe(true);
    // A namespace use written only in a comment or a string isn't a use: the block is unused (reported).
    const nsOnly = async (code: string) => {
      const { ctx, found } = app({ "src/lib/updates.ts": code }, { eas: true });
      await missedValueCheck({ blocks: async () => [{ manifest: block({ id: "app-updates", detect: nativeDetect }), from: "installed" }], catalog: () => [] })(ctx);
      return found.find((f) => f.subject === "app-updates")?.message ?? "";
    };
    expect(await nsOnly(`${ns}// U.createUpdates({})\nconst doc = "U.createUpdates({})";\nexport const v = U;\n`)).toMatch(/available and unused/);
    // A string inside the call quoting the old config isn't the config.
    expect(await run(`${plain}export const u = createUpdates({\n  platform: "ios",\n  channels: { enabled: true },\n  onError: () => console.warn("channels: { enabled: __DEV__ }"),\n});\n`)).toBe(false);
  });

  it("counts a detector only when it's imported from the block's package, and reads switched-off only there", async () => {
    const off = { manifest: block({ id: "app-updates", detect: nativeDetect }), from: "installed" };
    const push = { manifest: block({ id: "push", detect: { imports: ["createPush"] } }), from: "installed" };
    const { ctx, found } = app(
      {
        "src/lib/updates.ts": 'import { createUpdates } from "@marktiderman/genesis-native/updates";\nimport { createPush } from "./my-push";\nexport const u = createUpdates({ channels: { enabled: __DEV__, } });\n',
        "src/lib/diagnostics.ts": "export const d = { channels: { enabled: __DEV__ } };\n",
      },
      { eas: true },
    );
    await missedValueCheck({ blocks: async () => [off, push], catalog: () => [] })(ctx);
    expect(found.map((f) => [f.subject, f.file])).toEqual([["app-updates", "src/lib/updates.ts"], ["push", "genesis.config.json"]]);
  });

  it("takes the catalog's detect for an installed package too old to declare one", async () => {
    const { ctx, found } = app({}, { eas: true });
    const old = [{ manifest: block({ id: "push" }), from: "installed" }];
    await missedValueCheck({ blocks: async () => old, catalog: () => [block({ id: "push", detect: { imports: ["createPush"] } })] })(ctx);
    expect(found.map((f) => f.subject)).toEqual(["push"]);
  });

  it("stays quiet about a declined feature, and says when a declined id is stale", async () => {
    const { ctx, found } = app({}, { declined: { push: "the web sends our pushes", "pr-previews": "previews run elsewhere", gone: "old" } });
    await missedValueCheck({ blocks: async () => blocks.slice(1, 2), catalog: () => [] })(ctx);
    // Its own subject, which the summary's count leaves out.
    expect(found.map((f) => f.subject)).toEqual(["doctor.declined.gone"]);
    expect(found[0]!.message).toMatch(/no Genesis package offers/);
  });
});
