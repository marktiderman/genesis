import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { build } from "vite";
import { afterAll, describe, expect, it, vi } from "vitest";
import { genesisDoctor } from "../src/vite.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

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
});
