import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Registry, Switchboard } from "../index";
import {
  GitdataAdapter,
  attachGitdata,
  gitdataMdContract,
  gitdataResourceName,
} from "../gitdata";

function seedFeatures(dataRoot: string) {
  const dir = join(dataRoot, "features");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "GEN-900--alpha.md"),
    `---
kind: feature-record
id: GEN-900
slug: alpha
type: feature
parent: null
cleanse: pending
owns:
  - apps/sample/**
---

# Alpha

## The job
Does the alpha thing.

## Notes (inbox — AL-132)
- hello
`,
    "utf8",
  );
}

describe("GitdataAdapter", () => {
  it("lists, gets, updates frontmatter + job, and attachGitdata wires the registry", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "gitdata-"));
    seedFeatures(dataRoot);

    const resource = gitdataResourceName("features");
    const adapter = new GitdataAdapter({
      dataRoot,
      resources: { [resource]: { dir: "features" } },
    });
    const contract = gitdataMdContract(resource);

    const rows = await adapter.list(contract);
    expect(rows).toHaveLength(1);
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first).toMatchObject({
      id: "GEN-900",
      slug: "alpha",
      title: "Alpha",
      cleanse: "pending",
    });
    expect(String(first!.job)).toMatch(/alpha thing/i);
    expect(first!.owns).toEqual(["apps/sample/**"]);

    const updated = await adapter.update(contract, "GEN-900", {
      cleanse: "ratified",
      job: "Updated job text for alpha.",
      title: "Alpha Prime",
    });
    expect(updated).toMatchObject({
      id: "GEN-900",
      cleanse: "ratified",
      title: "Alpha Prime",
    });
    expect(String(updated.job)).toMatch(/Updated job/);

    const disk = readFileSync(join(dataRoot, "features/GEN-900--alpha.md"), "utf8");
    expect(disk).toMatch(/cleanse: ratified/);
    expect(disk).toMatch(/# Alpha Prime/);
    expect(disk).toMatch(/Updated job text for alpha/);

    const registry = new Registry();
    const names = attachGitdata(registry, { dataRoot, tables: ["features"] });
    expect(names).toEqual([resource]);
    registry.setEnvironmentDefault("gitdata");
    const sb = new Switchboard(registry);
    const one = await sb.resource(resource).get("GEN-900");
    expect(one?.title).toBe("Alpha Prime");
  });
});
