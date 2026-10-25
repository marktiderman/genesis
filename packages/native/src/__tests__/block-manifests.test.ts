// @feat:cli-add @feat:push @feat:app-updates
// `genesis add` reads this package's blocks from package.json (genesis.blocks), because the
// blocks themselves are made at run time (createPush, createUpdates) in React Native code. This
// keeps the two in step: what the manifest says is what the block declares.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPush } from "../push";
import { createUpdates } from "../updates";
import { fakeBackend } from "./push/fakes";

const manifests = (JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { genesis: { blocks: Record<string, Record<string, unknown>> } }).genesis.blocks;

describe("package.json genesis.blocks", () => {
  it.each([
    ["push", createPush({ platform: "ios", backend: fakeBackend().backend })],
    ["app-updates", createUpdates({ platform: "ios" })],
  ])("%s says what the block declares", (id, block) => {
    const manifest = manifests[id]!;
    expect(block.id).toBe(id);
    expect(manifest["migrations"]).toEqual(block.contributes?.migrations ?? []);
    expect(manifest["routes"] ?? []).toEqual(block.contributes?.routes ?? []);
    expect(manifest["platforms"]).toEqual(block.platforms);
    expect(manifest["requires"] ?? []).toEqual(block.requires ?? []);
  });
});
