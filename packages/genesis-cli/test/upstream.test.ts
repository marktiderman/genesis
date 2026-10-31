// @feat:genesis-upstream
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { cells, checkUpstream, exportIssueUrl, readRegister } from "../src/upstream";

const table = (...rows: string[]) => ["# Genesis upstream", "", "| id | kind | status | feature | package | local | need |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");

describe("genesis upstream", () => {
  it("reads the register and names what is wrong", () => {
    const { entries, problems } = readRegister(
      table("| lanes | extension | candidate | data-views | @marktiderman/genesis-ui | src/lanes.tsx | Swimlanes on KanbanBoard |", "| Bad Id | wish | done | | | | |", "| lanes | gap | candidate | | | | Again |"),
    );
    expect(entries[0]).toEqual({ id: "lanes", kind: "extension", status: "candidate", feature: "data-views", package: "@marktiderman/genesis-ui", local: "src/lanes.tsx", need: "Swimlanes on KanbanBoard" });
    expect(problems).toEqual([
      'Bad Id: id must be lowercase words and dashes',
      "Bad Id: kind must be gap, extension, invention",
      "Bad Id: status must be candidate, proposed, promoted, declined",
      "Bad Id: say the need in one line",
      "lanes: listed twice",
    ]);
    expect(readRegister("no table").problems[0]).toMatch(/no table/);
  });

  it("finds the register among other tables and keeps escaped and code pipes in a cell", () => {
    const md = ["| status | means |", "| --- | --- |", "| candidate | not filed |", "", table("| pipes | gap | candidate | | | - | Rows \\| columns in `a|b` |"), "", "| other | table |"].join("\n");
    const { entries, problems } = readRegister(md);
    expect(problems).toEqual([]);
    expect(entries.map((e) => e.need)).toEqual(["Rows | columns in `a|b`"]);
    expect(cells("| `x` | a \\| b |")).toEqual(["x", "a | b"]);
    expect(readRegister(table("| abs | gap | candidate | | | /etc/x | Need |", "| up | gap | candidate | | | ../x | - |")).problems).toEqual([
      "abs: local must be paths inside the app, relative to its root",
      "up: say the need in one line",
      "up: local must be paths inside the app, relative to its root",
    ]);
  });

  it("checks local paths, and tells a promoted entry to delete its copy", () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-upstream-"));
    mkdirSync(path.join(root, "docs"));
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src/lanes.tsx"), "");
    writeFileSync(path.join(root, "docs/genesis-upstream.md"), table("| lanes | extension | promoted | | @marktiderman/genesis-ui | src/lanes.tsx | Swimlanes |", "| gone | gap | candidate | | | src/gone.ts | Gone |"));
    const r = checkUpstream(root);
    expect(r.problems).toEqual(["gone: local src/gone.ts doesn't exist"]);
    expect(r.warnings).toEqual(["lanes: Genesis ships it now; delete src/lanes.tsx and use @marktiderman/genesis-ui"]);
    expect(checkUpstream(mkdtempSync(path.join(tmpdir(), "genesis-upstream-"))).warnings[0]).toMatch(/no docs\/genesis-upstream.md/);
  });

  it("reads a register at the app's root, and a local cell that lists several paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-upstream-"));
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src/a.ts"), "");
    writeFileSync(path.join(root, "src/b.ts"), "");
    writeFileSync(path.join(root, "genesis-upstream.md"), table("| two | extension | promoted | | | src/a.ts, src/b.ts | Two files |", "| half | gap | candidate | | | src/a.ts<br>src/c.ts | One gone |"));
    const r = checkUpstream(root);
    expect(r.file).toBe("genesis-upstream.md");
    expect(r.problems).toEqual(["half: local src/c.ts doesn't exist"]);
    expect(r.warnings).toEqual(["two: Genesis ships it now; delete src/a.ts, src/b.ts and use the Genesis version"]);
    expect(readRegister(table("| mix | gap | candidate | | | src/a.ts, ../x | Need |")).problems).toEqual(["mix: local must be paths inside the app, relative to its root"]);
  });

  it("builds the gap form link without the app's local paths", () => {
    const url = new URL(exportIssueUrl({ id: "lanes", kind: "extension", status: "candidate", package: "@marktiderman/genesis-ui", local: "src/lanes.tsx", need: "Swimlanes on KanbanBoard" }));
    expect(url.searchParams.get("template")).toBe("gap.yml");
    expect(url.searchParams.get("title")).toBe("[Gap: extension] Swimlanes on KanbanBoard");
    expect(url.searchParams.get("register")).toBe("lanes");
    expect(url.toString()).not.toContain("lanes.tsx");
  });
});
