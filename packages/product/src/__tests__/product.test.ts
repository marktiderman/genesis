import { describe, expect, it } from "vitest";
import { answeredBy, buildBoard, demand, diffRelease, renderBoard, renderRelease, type CatalogFeature, type Signal } from "../index";
import { issueToSignal, parseCatalog, type GitHubIssue } from "../node";

const f = (id: string, status: CatalogFeature["status"], extra: Partial<CatalogFeature> = {}): CatalogFeature => ({
  id,
  name: id.replace(/-/g, " "),
  summary: `${id} summary`,
  status,
  owner: "owner",
  ...extra,
});

const s = (n: number, extra: Partial<Signal> = {}): Signal => ({
  id: `github#${n}`,
  kind: "idea",
  title: `ask ${n}`,
  url: `https://github.com/o/r/issues/${n}`,
  votes: 0,
  state: "open",
  createdAt: `2026-10-${String(10 + n).padStart(2, "0")}T00:00:00Z`,
  ...extra,
});

describe("board (@feat:product-roadmap)", () => {
  const catalog = [
    f("search", "planned", { horizon: "next" }),
    f("export", "building", { claimedBy: "compass" }),
    f("dark-mode", "planned", { horizon: "now" }),
    f("offline", "idea"),
    f("sharing", "idea", { aliases: ["share"] }),
    f("login", "live"),
  ];

  it("puts planned and building features under their horizon, a building one with none under now, and building first", () => {
    const board = buildBoard(catalog, []);
    expect(board.now.map((i) => i.feature.id)).toEqual(["export", "dark-mode"]);
    expect(board.next.map((i) => i.feature.id)).toEqual(["search"]);
    expect(board.later).toEqual([]);
    expect(board.now[0]!.feature.claimedBy).toBe("compass");
  });

  it("ranks ideas by demand and leaves shipped features off the board", () => {
    const board = buildBoard(catalog, [s(1, { featureId: "share", votes: 4 }), s(2, { featureId: "offline" })]);
    expect(board.ideas.map((i) => [i.feature.id, i.demand])).toEqual([
      ["sharing", 5],
      ["offline", 1],
    ]);
    expect([...board.now, ...board.next, ...board.later, ...board.ideas].some((i) => i.feature.id === "login")).toBe(false);
  });

  it("keeps untriaged and unknown-feature signals in the triage inbox, newest first, and ignores closed ones", () => {
    const board = buildBoard(catalog, [s(1), s(3), s(2, { featureId: "nope" }), s(4, { state: "closed" })]);
    expect(board.untriaged.map((x) => x.id)).toEqual(["github#3", "github#1"]);
    expect(board.unknown.map((x) => x.id)).toEqual(["github#2"]);
  });

  it("renders one table per horizon, the top ideas and the inbox", () => {
    const md = renderBoard(buildBoard(catalog, [s(1, { featureId: "offline", votes: 2 }), s(2)]), { date: "2026-10-25" });
    expect(md).toContain("# Product board");
    expect(md).toContain("Generated 2026-10-25");
    expect(md).toMatch(/## Now \(2\)[\s\S]*export[\s\S]*## Next \(1\)[\s\S]*search[\s\S]*## Later \(0\)[\s\S]*_Nothing here._/);
    expect(md).toContain("| offline (`offline`) | idea | owner | 3 | [#1](https://github.com/o/r/issues/1) |");
    expect(md).toContain("## To triage (1)");
  });
});

describe("demand (@feat:product-insights)", () => {
  it("counts each open signal's importance (1 when unset) plus its votes, and nothing closed", () => {
    expect(demand([s(1, { votes: 2 }), s(2, { importance: 3 }), s(3, { state: "closed", votes: 9 })])).toBe(6);
  });
});

describe("GitHub issues as signals (@feat:product-insights)", () => {
  const issue = (extra: Partial<GitHubIssue>): GitHubIssue => ({
    number: 7,
    title: "[Idea] Export to CSV",
    body: "### What would help\n\nCSV\n\n### Feature\n\nexport\n",
    html_url: "https://github.com/o/r/issues/7",
    state: "open",
    created_at: "2026-10-20T00:00:00Z",
    user: { login: "pat" },
    labels: [],
    reactions: { "+1": 3 },
    ...extra,
  });

  it("reads the kind from the title, the feature from the form's field, and 👍 as votes", () => {
    expect(issueToSignal(issue({}))).toEqual({
      id: "github#7",
      kind: "idea",
      title: "Export to CSV",
      url: "https://github.com/o/r/issues/7",
      featureId: "export",
      author: "pat",
      votes: 3,
      importance: undefined,
      state: "open",
      createdAt: "2026-10-20T00:00:00Z",
    });
  });

  it("prefers labels: kind, feature:<id> and importance", () => {
    const signal = issueToSignal(issue({ title: "Crash on save", labels: [{ name: "bug" }, "feature:editor", "importance:high"] }));
    expect(signal).toMatchObject({ kind: "bug", featureId: "editor", importance: 3, title: "Crash on save" });
  });

  it("skips pull requests and issues that aren't intake, and leaves _No response_ untriaged", () => {
    expect(issueToSignal(issue({ pull_request: {} }))).toBeNull();
    expect(issueToSignal(issue({ title: "Refactor the CLI" }))).toBeNull();
    expect(issueToSignal(issue({ body: "### Feature\n\n_No response_\n" }))?.featureId).toBeUndefined();
  });
});

describe("release notes (@feat:product-releases)", () => {
  const before = [f("export", "building"), f("search", "beta"), f("audit", "building", { visibility: "internal" })];
  const after = [
    f("export", "live", { tagline: "Take your data anywhere." }),
    f("search", "live"),
    f("audit", "live", { visibility: "internal" }),
    f("themes", "beta"),
  ];

  it("lists what reached live or beta, new features included, and leaves internal ones out", () => {
    expect(diffRelease(before, after).map((c) => [c.feature.id, c.change, c.from])).toEqual([
      ["themes", "beta", undefined],
      ["export", "live", "building"],
      ["search", "live", "beta"],
    ]);
  });

  it("finds the open asks a release answers and thanks them in the notes", () => {
    const signals = [s(1, { featureId: "export" }), s(2, { featureId: "export", state: "closed" }), s(3, { featureId: "other" })];
    const changes = diffRelease(before, after);
    expect(answeredBy(changes, signals).map((x) => x.id)).toEqual(["github#1"]);
    const md = renderRelease(changes, signals, { name: "2026-10-25" });
    expect(md).toContain("# Release 2026-10-25");
    expect(md).toContain("- **export**: Take your data anywhere. Asked for in [#1](https://github.com/o/r/issues/1).");
    expect(md).toMatch(/## Shipped[\s\S]*## In beta[\s\S]*themes/);
  });

  it("says so when nothing shipped", () => {
    expect(renderRelease([], [], { name: "x" })).toContain("No feature reached beta or live");
  });

  it("reads features.json keyed by id, or as an array", () => {
    expect(parseCatalog(JSON.stringify({ features: { a: { name: "A", status: "live" } } }))[0]).toMatchObject({ id: "a", name: "A" });
    expect(parseCatalog(JSON.stringify({ features: [{ id: "b" }] }))[0]).toMatchObject({ id: "b" });
  });
});
