import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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

  it("takes the catalog's detect for an installed package too old to declare one", async () => {
    const { ctx, found } = app({}, { eas: true });
    const old = [{ manifest: block({ id: "push" }), from: "installed" }];
    await missedValueCheck({ blocks: async () => old, catalog: () => [block({ id: "push", detect: { imports: ["createPush"] } })] })(ctx);
    expect(found.map((f) => f.subject)).toEqual(["push"]);
  });

  it("stays quiet about a declined feature, and says when a declined id is stale", async () => {
    const { ctx, found } = app({}, { declined: { push: "the web sends our pushes", "pr-previews": "previews run elsewhere", gone: "old" } });
    await missedValueCheck({ blocks: async () => blocks.slice(1, 2), catalog: () => [] })(ctx);
    expect(found.map((f) => f.subject)).toEqual(["gone"]);
    expect(found[0]!.message).toMatch(/no Genesis package offers/);
  });
});
