// @feat:doctor-fixes
/**
 * The fix engine when the disk fills mid-write (ENOSPC): what a failed write leaves is removed, a
 * partial new file and a half-written staging file alike. node:fs is stood in so one write writes
 * part of its content and then fails, as a full disk does.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { removeTempDir } from "./temp.js";

const failing = vi.hoisted(() => ({ match: null as RegExp | null }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const writeFileSync = ((file: Parameters<typeof fs.writeFileSync>[0], data: string, options?: Parameters<typeof fs.writeFileSync>[2]) => {
    if (failing.match && typeof file === "string" && failing.match.test(file)) {
      fs.writeFileSync(file, data.slice(0, 2), options);
      throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
    }
    return fs.writeFileSync(file, data, options);
  }) as typeof fs.writeFileSync;
  return { ...fs, default: { ...fs, writeFileSync }, writeFileSync };
});

const { applyPlan, defineFix, planFix, sha256 } = await import("../src/fix/index.js");

const dirs: string[] = [];
const tmpApp = (files: Record<string, string>) => {
  const root = mkdtempSync(path.join(tmpdir(), "genesis-fix-enospc-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) writeFileSync(path.join(root, rel), text);
  return root;
};
afterAll(() => {
  for (const d of dirs.splice(0)) removeTempDir(d);
});
beforeEach(() => {
  failing.match = null;
});

const writes = (files: Record<string, { before: string | null; content: string }>) =>
  defineFix({
    id: "test.writes",
    kind: "auto",
    rules: ["r"],
    title: "writes",
    plan: () => ({ summary: "s", files: Object.entries(files).map(([p, f]) => ({ path: p, beforeHash: f.before === null ? null : sha256(f.before), content: f.content, why: "w" })) }),
  });

describe("a write that fails part way (ENOSPC)", () => {
  it("removes the partial new file", async () => {
    const root = tmpApp({});
    const fix = writes({ "new.txt": { before: null, content: "a whole file" } });
    const plan = await planFix(fix, { root, findings: [] });
    failing.match = /new\.txt$/;
    await expect(applyPlan(fix, plan, { root, findings: [] })).rejects.toThrow();
    expect(readdirSync(root)).toEqual([]);
  });

  it("removes the half-written staging file, and leaves the original as it was", async () => {
    const root = tmpApp({ "a.txt": "original" });
    const fix = writes({ "a.txt": { before: "original", content: "rewritten" } });
    const plan = await planFix(fix, { root, findings: [] });
    failing.match = /\.genesis-fix-/;
    await expect(applyPlan(fix, plan, { root, findings: [] })).rejects.toThrow();
    expect(readdirSync(root)).toEqual(["a.txt"]);
    expect(readFileSync(path.join(root, "a.txt"), "utf8")).toBe("original");
  });
});
