import { describe, expect, it } from "vitest";
import { answeredBy, buildBoard, demand, diffRelease, renderBoard, renderRelease, type CatalogFeature, type Signal } from "../index";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogAt, closeAnswered, githubSignals, issueToSignal, parseCatalog, publishBoardIssue, type GitHubIssue } from "../node";

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

  it("reads the kind from the title and 👍 as votes, and keeps the form's feature as a suggestion, not a link", () => {
    expect(issueToSignal(issue({}))).toEqual({
      id: "github#7",
      kind: "idea",
      title: "Export to CSV",
      url: "https://github.com/o/r/issues/7",
      featureId: undefined,
      suggestedFeatureId: "export",
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
    expect(issueToSignal(issue({ body: "### Feature\n\n_No response_\n" }))?.suggestedFeatureId).toBeUndefined();
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

describe("review fixes on #249 (@feat:product-releases)", () => {
  const live = [f("export", "live"), f("search", "live")];

  it("throws on a --from ref that doesn't exist instead of reading an empty catalog (H1)", () => {
    const repo = mkdtempSync(join(tmpdir(), "product-"));
    const run = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    run("init", "-q");
    run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "first");
    expect(catalogAt("HEAD", "features.json", repo)).toEqual([]);
    expect(() => catalogAt("v-typo-does-not-exist", "features.json", repo)).toThrow(/is not a commit/);
    writeFileSync(join(repo, "features.json"), JSON.stringify({ features: { a: { name: "A", status: "live" } } }));
    run("add", ".");
    run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "second");
    expect(catalogAt("HEAD", "features.json", repo).map((x) => x.id)).toEqual(["a"]);
    expect(catalogAt("HEAD", join(realpathSync(repo), "features.json"), repo).map((x) => x.id)).toEqual(["a"]);
    expect(() => catalogAt("HEAD", "../elsewhere.json", repo)).toThrow(/outside the repo/);
  });

  it("treats an issue labelled both bug and idea as a bug, so a release never closes it", () => {
    const signal = issueToSignal({ number: 6, title: "x", html_url: "u", state: "open", created_at: "", labels: ["idea", "bug", "feature:export"] });
    expect(signal?.kind).toBe("bug");
    expect(answeredBy(diffRelease([], live), [signal!])).toEqual([]);
  });

  it("closes only ideas: feedback and bugs on a shipped feature stay open (H2)", () => {
    const signals = [s(1, { featureId: "export" }), s(2, { featureId: "export", kind: "feedback" }), s(3, { featureId: "export", kind: "bug" })];
    expect(answeredBy(diffRelease([], live), signals).map((x) => x.id)).toEqual(["github#1"]);
  });

  it("counts a signal toward demand only once a triager links it; a suggestion waits in triage (H3)", () => {
    const board = buildBoard([f("export", "idea")], [s(1, { suggestedFeatureId: "export", votes: 5 })]);
    expect(board.ideas[0]!.demand).toBe(0);
    expect(board.untriaged.map((x) => x.id)).toEqual(["github#1"]);
    expect(renderBoard(board, { date: "d" })).toContain("(suggests `export`)");
  });

  it("renders titles as code, so a title can't @mention, link or embed (M4)", () => {
    const md = renderBoard(buildBoard([], [s(1, { title: "@team see ![x](https://e/x.png) `y`" })]), { date: "d" });
    expect(md).toContain("idea: `@team see ![x](https://e/x.png) 'y'`");
    expect(renderBoard(buildBoard([], [s(2, { title: "a | b" })]), { date: "d" })).toContain("`a | b`");
  });
});

describe("GitHub source and writes (@feat:product-insights)", () => {
  type Call = { url: string; method: string; body?: unknown };
  const fakeFetch = (routes: Record<string, { body: unknown; link?: string }>, calls: Call[]) =>
    (async (url: string, init: { method: string; body?: string }) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
      const key = Object.keys(routes).find((k) => url.endsWith(k));
      const route = key ? routes[key]! : { body: {} };
      return new Response(JSON.stringify(route.body), { status: 200, headers: route.link ? { link: route.link } : {} });
    }) as unknown as typeof fetch;
  const gh = (n: number, extra: Partial<GitHubIssue> = {}): GitHubIssue => ({
    number: n,
    title: `[Idea] ask ${n}`,
    html_url: `https://github.com/o/r/issues/${n}`,
    state: "open",
    created_at: "2026-10-20T00:00:00Z",
    user: { login: "pat" },
    labels: [],
    ...extra,
  });

  it("reads open issues across every page, and counts votes once per person, without the author or bots (M2, M3)", async () => {
    const calls: Call[] = [];
    const source = githubSignals({
      repo: "o/r",
      fetch: fakeFetch(
        {
          "/issues?state=open&per_page=100": { body: [gh(1, { labels: ["feature:export"], reactions: { "+1": 4 } })], link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"' },
          "/issues?page=2": { body: [gh(2)] },
          "/issues/1/reactions?content=%2B1&per_page=100": {
            body: [{ user: { login: "pat" } }, { user: { login: "ana" } }, { user: { login: "bot", type: "Bot" } }, { user: { login: "lee" } }],
          },
        },
        calls,
      ),
    });
    const signals = await source.list();
    expect(signals.map((x) => [x.id, x.featureId, x.votes])).toEqual([
      ["github#1", "export", 2],
      ["github#2", undefined, 0],
    ]);
    expect(calls.every((c) => !c.url.includes("state=all"))).toBe(true);
  });

  it("throws rather than stopping silently at the page cap (M3)", async () => {
    const loop = { body: [], link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"' };
    const source = githubSignals({ repo: "o/r", maxPages: 2, fetch: fakeFetch({ "per_page=100": loop, "page=2": loop }, []) });
    await expect(source.list()).rejects.toThrow(/stopped after 2 pages/);
  });

  it("writes only the board issue it owns: the product-board label and its own author (M1)", async () => {
    const calls: Call[] = [];
    await publishBoardIssue(
      { repo: "o/r", token: "t", fetch: fakeFetch({ "per_page=100": { body: [gh(9, { title: "Product board", user: { login: "stranger" } })] }, "/issues": { body: { html_url: "u", labels: [{ name: "product-board" }] } } }, calls) },
      "board",
    );
    expect(calls[0]!.url).toContain("labels=product-board&creator=github-actions%5Bbot%5D");
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { title: "Product board", labels: ["product-board"] } });
    expect(calls.some((c) => c.url.endsWith("/issues/9"))).toBe(false);
  });

  it("creates the board label first when the repo has none, and refuses an issue without it (L4)", async () => {
    const calls: Call[] = [];
    const fetchStub = (async (url: string, init: { method: string; body?: string }) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith("/labels/product-board")) return new Response("{}", { status: 404 });
      if (init.method === "POST" && url.endsWith("/issues")) return new Response(JSON.stringify({ html_url: "u", labels: [{ name: "product-board" }] }), { status: 201 });
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await publishBoardIssue({ repo: "o/r", token: "t", fetch: fetchStub }, "b")).toBe("u");
    expect(calls.map((c) => `${c.method} ${c.url.replace(/^.*\/repos\/o\/r/, "").split("?")[0]}`)).toEqual([
      "GET /issues",
      "GET /labels/product-board",
      "POST /labels",
      "POST /issues",
    ]);
  });

  it("closes before it comments, so a rerun never comments twice (L1)", async () => {
    const calls: Call[] = [];
    await closeAnswered({ repo: "o/r", token: "t", fetch: fakeFetch({}, calls) }, [s(5, { featureId: "export" })], () => "shipped");
    expect(calls.map((c) => [c.method, c.url.replace("https://api.github.com/repos/o/r", "")])).toEqual([
      ["PATCH", "/issues/5"],
      ["POST", "/issues/5/comments"],
    ]);
  });
});

describe("the core stays usable from React Native (@feat:product-roadmap)", () => {
  it("imports nothing from node: and never pulls in ./node, through every module index reaches", () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(join(__dirname, "..", `${file}.ts`), "utf8");
      for (const [, spec] of text.matchAll(/from\s+"([^"]+)"/g)) {
        expect(spec!.startsWith("node:"), `${file} imports ${spec}`).toBe(false);
        expect(spec, `${file} imports ./node`).not.toBe("./node");
        if (spec!.startsWith("./")) walk(spec!.slice(2));
      }
    };
    walk("index");
    expect([...seen].sort()).toEqual(["board", "index", "model", "release"]);
  });
});

describe("board issue writes (@feat:product-roadmap)", () => {
  it("leaves the issue alone when only the date changed", async () => {
    const calls: string[] = [];
    const fetchStub = (async (url: string, init: { method: string }) => {
      calls.push(`${init.method} ${url}`);
      const body = [{ number: 3, title: "Product board", body: "Generated 2026-10-24 by x\nsame", html_url: "u3", state: "open", created_at: "", user: { login: "github-actions[bot]" }, labels: [] }];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await publishBoardIssue({ repo: "o/r", token: "t", fetch: fetchStub }, "Generated 2026-10-25 by x\nsame")).toBe("u3");
    expect(calls.every((c) => c.startsWith("GET"))).toBe(true);
  });
});
