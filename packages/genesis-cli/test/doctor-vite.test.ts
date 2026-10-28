import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it, vi } from "vitest";
import { checkContracts } from "../src/doctor/contracts.js";
import { genesisDoctor } from "../src/vite.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

// The contract check reads a database; here it only records that it ran.
vi.mock("../src/doctor/contracts.js", async (original) => ({ ...(await original<typeof import("../src/doctor/contracts.js")>()), checkContracts: vi.fn(async () => {}) }));

afterAll(cleanupApps);

async function viteBuild(root: string) {
  writeFileSync(path.join(root, "entry.js"), "export const x = 1;\n");
  return build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [genesisDoctor()],
    build: { write: false, lib: { entry: path.join(root, "entry.js"), formats: ["es"], fileName: "out" } },
  });
}

describe("genesisDoctor() for Vite", () => {
  it("passes a production build of a clean app", async () => {
    await expect(viteBuild(makeApp("clean"))).resolves.toBeDefined();
  });

  it("never runs the contract check, which reads a live database, in a build", async () => {
    const root = makeApp("clean", {
      "genesis.config.json": JSON.stringify({ doctor: { packs: ["supabase"], contracts: { databaseEnv: "GENESIS_TEST_VITE_DB" } } }),
      "supabase/migrations/.keep": "",
    });
    await viteBuild(root);
    expect(checkContracts).not.toHaveBeenCalled();
    const { runDoctor } = await import("../src/doctor/index.js");
    await runDoctor({ root });
    expect(checkContracts).toHaveBeenCalledTimes(1);
  });

  it("fails a production build that breaks a rule, naming the file and rule", async () => {
    await expect(viteBuild(makeApp("raw-tag"))).rejects.toThrow(/src\/form\.tsx:6 {2}\[raw-tag\] renders a raw <button>/);
  });

  it("shows the dev overlay, re-sends it to late browsers, and clears it once fixed", async () => {
    const root = makeApp("raw-tag");
    const sent: unknown[] = [];
    const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
    const server = {
      config: { logger: { error: vi.fn(), info: vi.fn() } },
      ws: {
        send: (payload: unknown) => sent.push(payload),
        on: (event: string, fn: () => void) => (handlers[`ws:${event}`] ??= []).push(fn),
      },
      watcher: {
        add: vi.fn(),
        on: (event: string, fn: (file: string) => void) => (handlers[event] ??= []).push(fn as (...a: unknown[]) => void),
      },
      httpServer: null,
    };
    const serve = genesisDoctor({ root, debounceMs: 10 }).find((p) => p.apply === "serve")!;
    (serve.configureServer as (s: unknown) => void)(server);

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ type: "error", err: { plugin: "genesis-doctor" } });
    expect((sent[0] as { err: { message: string } }).err.message).toContain("[raw-tag]");

    handlers["ws:connection"][0]();
    expect(sent).toHaveLength(2);

    writeFileSync(path.join(root, "src/form.tsx"), "export const Form = () => null;\n");
    handlers.change[0](path.join(root, "src/form.tsx"));
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ type: "full-reload" }));
  });

  it("re-checks when a config outside root changes", async () => {
    const root = makeApp("raw-tag");
    const outside = path.join(path.dirname(root), `${path.basename(root)}-genesis.config.json`);
    writeFileSync(outside, "{}\n");
    const sent: unknown[] = [];
    const handlers: Record<string, Array<(file: string) => void>> = {};
    const server = {
      config: { logger: { error: vi.fn(), info: vi.fn() } },
      ws: { send: (payload: unknown) => sent.push(payload), on: vi.fn() },
      watcher: { add: vi.fn(), on: (event: string, fn: (file: string) => void) => (handlers[event] ??= []).push(fn) },
      httpServer: null,
    };
    const serve = genesisDoctor({ root, configPath: outside, debounceMs: 10 }).find((p) => p.apply === "serve")!;
    (serve.configureServer as (s: unknown) => void)(server);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(server.watcher.add).toHaveBeenCalledWith(expect.arrayContaining([outside]));

    writeFileSync(outside, JSON.stringify({ rules: { "raw-tag": "off" } }));
    handlers.change[0](outside);
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ type: "full-reload" }));
  });
});
