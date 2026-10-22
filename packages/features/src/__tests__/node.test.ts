import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { defineFlags } from "../index";
import { buildFeatureOutputs, checkFeatureOutputs, globToRegExp, scanFlagReads, summarizeCheck, type FeatureProjectOptions } from "../node";
import { features, flags } from "./fixture";

/** A test tag, built so this file isn't itself read as tagging these fixture ids. */
const tag = (id: string) => `@${"feat"}:${id}`;

function repo(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "genesis-features-"));
  const all = {
    "src/tasks.ts": "",
    "src/app.tsx": `useFlag("wins.v2"); <Flag name="wins.kill" />`,
    "src/tasks.test.ts": `// ${tag("tasks")}`,
    "AGENTS.md": "# Agents\n\nHand-written.\n",
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const opts = (root: string, more: Partial<FeatureProjectOptions> = {}): FeatureProjectOptions => ({ root, features, flags, today: "2026-10-22", ...more });
const write = (root: string, path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

describe("build and check", () => {
  it("fails before a build, passes after, and fails again when the registry moves on", () => {
    const root = repo();
    expect(checkFeatureOutputs(opts(root)).stale).toEqual(["AGENTS.md", "features.json", "flags.json", ".claude/skills/features/SKILL.md"]);
    expect(buildFeatureOutputs(opts(root))).toEqual(["AGENTS.md", "features.json", "flags.json", ".claude/skills/features/SKILL.md", "CLAUDE.md"]);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toMatch(/^# Agents\n\nHand-written\.\n\n<!-- genesis-features:start -->/);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    const result = checkFeatureOutputs(opts(root));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(buildFeatureOutputs(opts(root))).toEqual([]);

    const moved = { ...features, tasks: { ...features.tasks, status: "deprecated" as const } };
    expect(checkFeatureOutputs(opts(root, { features: moved })).stale).toEqual(["AGENTS.md", "features.json"]);
  });

  it("ignores hand edits outside generated blocks but not inside them", () => {
    const root = repo();
    buildFeatureOutputs(opts(root));
    const file = join(root, "AGENTS.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("Hand-written.", "Edited."));
    expect(checkFeatureOutputs(opts(root)).ok).toBe(true);
    writeFileSync(file, readFileSync(file, "utf8").replace("3 features", "4 features"));
    expect(checkFeatureOutputs(opts(root)).stale).toEqual(["AGENTS.md"]);
  });

  it("refuses a block with a missing, repeated or misordered marker, rather than wipe text", () => {
    const root = repo();
    buildFeatureOutputs(opts(root));
    const file = join(root, "AGENTS.md");
    const built = readFileSync(file, "utf8");
    writeFileSync(file, built.replace("<!-- genesis-features:end -->", "") + "\nMy notes after.\n");
    expect(checkFeatureOutputs(opts(root)).errors[0]).toMatch(/^AGENTS\.md: The generated block's markers are broken/);
    expect(() => buildFeatureOutputs(opts(root))).toThrow(/AGENTS\.md: The generated block's markers are broken/);
    expect(readFileSync(file, "utf8")).toContain("My notes after.");
  });

  it("reads CRLF files as LF, so a Windows checkout isn't stale", () => {
    const root = repo();
    buildFeatureOutputs(opts(root));
    for (const path of ["AGENTS.md", "features.json"]) {
      const file = join(root, path);
      writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
    }
    expect(checkFeatureOutputs(opts(root)).stale).toEqual([]);
  });

  it("needs CLAUDE.md to import AGENTS.md, and build adds the line to an existing file", () => {
    const root = repo({ "CLAUDE.md": "# Claude\n" });
    expect(checkFeatureOutputs(opts(root)).errors).toContain("CLAUDE.md must import the agent notes with a line `@AGENTS.md` (`build` adds it).");
    buildFeatureOutputs(opts(root));
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("# Claude\n\n@AGENTS.md\n");
  });

  it("keeps the marketing block in a file of its choice", () => {
    const root = repo({ "README.md": "# Thing\n" });
    buildFeatureOutputs(opts(root, { marketing: "README.md" }));
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain("**Tasks** — Never lose a next step.");
    expect(checkFeatureOutputs(opts(root, { marketing: "README.md" })).ok).toBe(true);
  });

  it("refuses to drop an id, and accepts the rename through aliases", () => {
    const root = repo();
    buildFeatureOutputs(opts(root));
    const { billing: _gone, ...rest } = features;
    const message = 'the feature id "billing" was removed. Ids are permanent: keep the entry with status "retired", or list "billing" in the new entry\'s aliases';
    expect(checkFeatureOutputs(opts(root, { features: rest })).errors).toContain(message);
    expect(() => buildFeatureOutputs(opts(root, { features: rest }))).toThrow(message);
    const renamed = { ...rest, payments: { ...features.billing, aliases: ["billing"] } };
    expect(buildFeatureOutputs(opts(root, { features: renamed }))).toContain("features.json");
  });

  it("fails on a missing code path; warns on missing docs, reviews due and untested live features", () => {
    const root = repo({ "src/tasks.test.ts": "" });
    const broken = {
      ...features,
      wins: { ...features.wins, links: { code: ["src/gone.ts"], docs: ["docs/none.md"] } },
      tasks: { ...features.tasks, reviewedAt: "2026-01-01" },
    };
    buildFeatureOutputs(opts(root, { features: broken }));
    const result = checkFeatureOutputs(opts(root, { features: broken }));
    expect(result.errors).toEqual(["wins.links.code: src/gone.ts doesn't exist"]);
    expect(result.warnings).toEqual([
      "tasks: last reviewed 2026-01-01, over 90 days ago",
      "wins.links.docs: docs/none.md doesn't exist",
      `tasks: live, but no test is tagged ${tag("tasks")}`,
    ]);
  });

  it("enforces the flag rules against the code", () => {
    const more = defineFlags(features, {
      ...flags,
      "tasks.paid": { feature: "tasks", kind: "permission", owner: "mark", default: false, scopes: ["practice"] },
      "billing.ops": { feature: "billing", kind: "ops", owner: "mark", default: true, scopes: ["platform"], runbook: "docs/runbook.md" },
    });
    const root = repo({ "src/app.tsx": `useFlag("wins.v2"); useFlag(name); useFlag("nope"); getFlag<K>("tasks.paid");\nfunction useFlag(key: string) {}` });
    const result = checkFeatureOutputs(opts(root, { flags: more, today: "2026-12-02" }));
    expect(result.errors.filter((e) => !e.includes("stale") && !e.includes("CLAUDE"))).toEqual([
      "tasks.paid: a permission flag. Paid or role access belongs in the feature's `access` (entitlements), not a flag",
      "billing.ops.runbook: docs/runbook.md doesn't exist",
      "wins.v2 expired on 2026-12-01: remove its code path, then the flag",
      "src/app.tsx:1: a flag read with a computed key. Use a literal key, so the read can be checked",
      'src/app.tsx:1: the flag "nope" is read but not defined',
      "wins.kill: defined but never read. Remove it, or read it through the flag accessor",
      "billing.ops: defined but never read. Remove it, or read it through the flag accessor",
    ]);
    expect(result.expiredFlags).toEqual(["wins.v2"]);
  });

  it("validates feature ids in test tags, changesets and PR labels", () => {
    const root = repo({
      "src/x.test.ts": `it('works ${tag("nope")}', () => {})`,
      ".changeset/a.md": "---\n\"pkg\": patch\n---\n\nFixes.\n\nFeatures: tasks, ghost\n",
    });
    const errors = checkFeatureOutputs(opts(root, { labels: ["feature:wins", "feature:phantom", "bug"] })).errors;
    expect(errors).toEqual(
      expect.arrayContaining([
        `src/x.test.ts:1: ${tag("nope")} is not a feature`,
        ".changeset/a.md: Features: ghost is not a feature",
        "PR label feature:phantom: phantom is not a feature",
      ]),
    );
    expect(errors.join("\n")).not.toMatch(/Features: tasks|feature:wins/);
  });

  it("warns about route and server-function files no feature covers", () => {
    const root = repo({ "src/routes/admin.tsx": "", "src/routes/__root.tsx": "", "src/lib/page.functions.ts": "", "src/routes/tasks/index.tsx": "" });
    const covered = { ...features, tasks: { ...features.tasks, links: { code: ["src/tasks.ts", "src/routes/tasks/"] } } };
    const warnings = checkFeatureOutputs(opts(root, { features: covered })).warnings;
    expect(warnings.filter((w) => w.includes("covers"))).toEqual([
      "src/lib/page.functions.ts: no feature's links.code covers it",
      "src/routes/admin.tsx: no feature's links.code covers it",
    ]);
  });

  it("summarizes for a session start", () => {
    const root = repo();
    const claimed = { ...features, billing: { ...features.billing, status: "building" as const, claimedBy: "less" } };
    const result = checkFeatureOutputs(opts(root, { features: claimed, today: "2026-12-02" }));
    const summary = summarizeCheck(result, claimed);
    expect(summary).toMatch(/^Features: 3 in the registry; \d+ errors, \d+ warnings?\./);
    expect(summary).toContain("- Stale generated files: AGENTS.md, features.json, flags.json, .claude/skills/features/SKILL.md.");
    expect(summary).toContain("- Expired flags: wins.v2.");
    expect(summary).toContain("- Being built: billing (less).");
  });
});

describe("scanFlagReads", () => {
  it("reads literal keys from calls and JSX, and flags computed ones", () => {
    const text = [
      `const a = useFlag("x.a");`,
      "const b = getFlag(`x.b`);",
      "const c = useFlag(`x.${id}`);",
      `<Flag name="x.d" />`,
      `<Flag name={"x.e"}>`,
      `<Flag name={key}>`,
      `export function useFlag(key: K) {}`,
      `interface R { useFlag(key: K): boolean }`,
      `obj.useFlag(dynamic);`,
    ].join("\n");
    const { keys, dynamic } = scanFlagReads("f.tsx", text);
    expect(keys.map((k) => k.key).sort()).toEqual(["x.a", "x.b", "x.d", "x.e"]);
    expect(dynamic.sort()).toEqual(["f.tsx:3", "f.tsx:6"]);
  });

  it("takes other accessor names", () => {
    expect(scanFlagReads("f.ts", `flag("a.b", ctx); isOn('c.d')`, ["flag", "isOn"]).keys.map((k) => k.key)).toEqual(["a.b", "c.d"]);
  });
});

describe("globToRegExp", () => {
  it("handles **, * and braces", () => {
    const re = globToRegExp("src/**/*.{ts,tsx}");
    expect(["src/a.ts", "src/x/y/b.tsx"].every((p) => re.test(p))).toBe(true);
    expect(re.test("src/a.js")).toBe(false);
    expect(globToRegExp("**/*.functions.ts").test("a.functions.ts")).toBe(true);
  });
});
