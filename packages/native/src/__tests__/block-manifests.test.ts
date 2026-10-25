// @feat:cli-add @feat:push @feat:app-updates
// `genesis add` reads this package's blocks from package.json (genesis.blocks), because the
// blocks themselves are made at run time (createPush, createUpdates) in React Native code. This
// keeps the two in step: what the manifest says is what the block declares.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPush } from "../push";
import { createDevtools } from "../devtools";
import { createObservability } from "../observability";
import { createUpdates } from "../updates";
import { fakeBackend } from "./push/fakes";

const manifests = (JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { genesis: { blocks: Record<string, Record<string, unknown>> } }).genesis.blocks;

describe("package.json genesis.blocks", () => {
  it.each([
    ["push", createPush({ platform: "ios", backend: fakeBackend().backend })],
    ["app-updates", createUpdates({ platform: "ios" })],
    ["observability", createObservability({ sinks: [] })],
    ["devtools-overlay", createDevtools({ enabled: false })],
  ])("%s says what the block declares", (id, block) => {
    const manifest = manifests[id]!;
    expect(block.id).toBe(id);
    expect(manifest["migrations"] ?? []).toEqual(block.contributes?.migrations ?? []);
    expect(manifest["routes"] ?? []).toEqual(block.contributes?.routes ?? []);
    expect(manifest["platforms"]).toEqual(block.platforms);
    expect(manifest["requires"] ?? []).toEqual(block.requires ?? []);
    // What it collects (for the stores' privacy forms) is what the block says it collects.
    const types = (p: unknown) => ((p as { collects?: { type: string }[] } | undefined)?.collects ?? []).map((c) => c.type);
    expect(types(manifest["privacy"])).toEqual(types(block.contributes?.privacy));
  });

  it("lists every block this package makes", () => {
    expect(Object.keys(manifests).sort()).toEqual(["app-updates", "devtools-overlay", "observability", "push"]);
  });
});
