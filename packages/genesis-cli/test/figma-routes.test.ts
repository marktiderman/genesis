import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appNavTargets,
  appRoutes,
  checkFigmaRoutes,
  compare,
  destinations,
  dynamicNavTargets,
  figmaIdOf,
  formatCoverage,
  navTargets,
  readFigma,
  readFigmaConfig,
  routeMatches,
  validateFigmaConfig,
  FigmaConfigError,
  type FetchLike,
} from "../src/figma/routes.js";
import { checkFigmaRoutesRule } from "../src/doctor/figma-routes.js";
import type { DoctorContext, FindingInput } from "../src/doctor/types.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "figma-routes");
const APP = path.join(FIXTURES, "app");
const RECORDED = JSON.parse(readFileSync(path.join(FIXTURES, "figma.json"), "utf8")) as Record<string, unknown>;

/** Answers from the recorded responses; anything else is a 404. No network. */
const recorded: FetchLike = async (url, init) => {
  expect(init.headers["X-Figma-Token"]).toBe("test-token");
  const key = url.replace("https://api.figma.com", "");
  const body = RECORDED[key];
  return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
};

describe("routes", () => {
  it("reads Expo Router and TanStack file routes", () => {
    const routes = appRoutes(APP).map((r) => `${r.platform} ${r.route}${r.figmaId ? ` #${r.figmaId}` : ""}`);
    expect(routes).toEqual([
      "native (tabs)",
      "native (tabs)/settings #1:99",
      "native items/[id]",
      "web admin/decks",
      "web courses/$courseId",
      "web docs/{-$section}",
      "web index #2:10",
    ]);
  });

  it("matches URLs to routes: groups dropped, params and optional segments", () => {
    expect(routeMatches("(tabs)/settings", "/settings")).toBe(true);
    expect(routeMatches("items/[id]", "/items/42")).toBe(true);
    expect(routeMatches("courses/$courseId", "/courses/$courseId")).toBe(true);
    expect(routeMatches("docs/{-$section}", "/docs")).toBe(true);
    expect(routeMatches("docs/{-$section}", "/docs/intro")).toBe(true);
    expect(routeMatches("docs/{-$section}", "/docs/a/b")).toBe(false);
    expect(routeMatches("files/$", "/files/a/b")).toBe(true);
    expect(routeMatches("index", "/")).toBe(true);
    expect(routeMatches("(tabs)", "/")).toBe(true);
    expect(routeMatches("(tabs)/settings", "/settings?tab=1")).toBe(true);
  });

  it("matches an Expo catch-all [...rest] to one or more segments", () => {
    expect(routeMatches("docs/[...slug]", "/docs/a")).toBe(true);
    expect(routeMatches("docs/[...slug]", "/docs/a/b/c")).toBe(true);
    expect(routeMatches("docs/[...slug]", "/docs")).toBe(false);
    expect(routeMatches("(app)/[...rest]/edit", "/a/b/edit")).toBe(true);
    expect(routeMatches("(app)/[...rest]/edit", "/a/b")).toBe(false);
    expect(routeMatches("items/[id]", "/items/a/b")).toBe(false);
  });

  it("reads the figma: comment in the first lines only", () => {
    expect(figmaIdOf("// figma: 12:34\nx")).toBe("12:34");
    expect(figmaIdOf("// figma: 12-34")).toBe("12:34");
    expect(figmaIdOf("\n\n\n\n\n// figma: 1:2")).toBeUndefined();
  });
});

describe("navigation targets", () => {
  it("takes string literals only", () => {
    const code = [
      'router.push("/a");',
      "router.replace('/b');",
      "router.push(`/c`);",
      "router.push(`/d/${id}`);",
      "router.push(path);",
      '<Link href="/e">e</Link>',
      '<Link className="x" to="/f">f</Link>',
      '<Link href={"/g"}>g</Link>',
      'navigate({ to: "/h", params });',
      '<Link href="https://example.com">x</Link>',
    ].join("\n");
    expect(navTargets(code, "x.tsx").map((t) => t.target)).toEqual(["/a", "/b", "/c", "/e", "/f", "/g", "/h"]);
  });

  it("finds template-literal and { pathname } navigation as unchecked", () => {
    const code = [
      'router.push("/a");',
      "router.push(`/d/${id}`);",
      'router.replace({ pathname: "/items/[id]", params: { id } });',
      "<Link href={`/e/${id}`}>e</Link>",
      '<Link href={{ pathname: "/f/[id]", params: { id } }}>f</Link>',
      "navigate({ to: `/g/${id}` });",
      "router.push(`/plain`);",
    ].join("\n");
    expect(dynamicNavTargets(code, "x.tsx").map((t) => `${t.line} ${t.target}`)).toEqual([
      "2 `/d/${id}`",
      '3 { pathname: "/items/[id]", params: { id }',
      "4 `/e/${id}`",
      '5 { pathname: "/f/[id]", params: { id }',
      "6 `/g/${id}`",
    ]);
  });

  it("finds them across the app", () => {
    expect(appNavTargets(APP).map((t) => `${t.file}:${t.line} ${t.target}`)).toEqual([
      "src/app/(tabs)/index.tsx:5 /settings",
      "src/app/(tabs)/index.tsx:6 /items/42",
      "src/routes/index.tsx:6 /admin/decks",
      "src/routes/index.tsx:7 /courses/$courseId",
    ]);
  });
});

describe("Figma", () => {
  it("reads prototype links from interactions and transitionNodeID, skipping CHANGE_TO", () => {
    const node = RECORDED["/v1/files/FAKEfileKEY123/nodes?ids=1%3A10%2C1%3A11%2C1%3A12%2C1%3A13%2C2%3A10%2C2%3A11"] as { nodes: Record<string, { document: never }> };
    expect([...destinations(node.nodes["1:10"]!.document)]).toEqual(["1:11", "1:13"]);
  });

  it("validates the config", () => {
    expect(() => validateFigmaConfig({ file: "abc", pages: {} })).toThrow(FigmaConfigError);
    expect(() => validateFigmaConfig({ file: "abc", pages: { tablet: "x" } })).toThrow(/only "web" and "native"/);
    expect(validateFigmaConfig({ file: "abc", pages: { web: "W" } }).proposalsPage).toBe("Proposals");
  });
});

describe("checkFigmaRoutes", () => {
  it("reports drift on the fixture", async () => {
    const report = await checkFigmaRoutes({ root: APP, token: "test-token", fetch: recorded });
    expect(report.summary).toEqual({ routes: 7, frames: 6, covered: 4, coveredPercent: 57, hotspots: 3, missing: 6 });
    expect(report.routesWithoutFrame.map((r) => r.route)).toEqual(["items/[id]", "admin/decks", "docs/{-$section}"]);
    expect(report.framesWithoutRoute.map((f) => f.name)).toEqual(["old/screen"]);
    expect(Object.fromEntries(Object.entries(report.proposals).map(([s, fs]) => [s, fs.map((f) => f.name)]))).toEqual({ Draft: ["invite/(tabs)/invite"] });
    expect(report.missingHotspots.map((m) => `${m.from} -> ${m.to} ${m.targetHasFrame}`)).toEqual(["(tabs) -> items/[id] false", "index -> admin/decks false"]);
    expect(report.deadHotspots.map((d) => `${d.from.name} -> ${d.to.name}`)).toEqual(["(tabs) -> old/screen"]);
    expect(report.idMismatches.map((m) => `${m.route} ${m.figmaId} [${m.frames.join(",")}]`)).toEqual(["(tabs)/settings 1:99 [1:11,1:12]"]);
    expect(report.missingPages).toEqual([]);
    expect(formatCoverage(report)).toMatchSnapshot();
  });

  it("reads a Proposal section on a route page as a proposal, not as frames without a route", () => {
    const config = validateFigmaConfig({ file: "abc", pages: { native: "App" } });
    const frames = [
      { id: "1:1", name: "(tabs)/invite", page: "App", section: "Proposal · Draft · invite", route: "(tabs)/invite" },
      { id: "1:2", name: "other", page: "App", route: "other" },
    ];
    const report = compare(config, [], [], { pages: ["App"], frames, hotspots: [{ from: "1:2", to: "1:1" }] } as never);
    expect(report.framesWithoutRoute.map((f) => f.name)).toEqual(["other"]);
    expect(report.deadHotspots).toEqual([]);
    expect(Object.keys(report.proposals)).toEqual(["Proposal · Draft · invite"]);
  });

  it("counts a configured page the file doesn't have as missing, so --strict fails with no routes", () => {
    const config = validateFigmaConfig({ file: "abc", pages: { web: "Web" } });
    const report = compare(config, [], [], { pages: ["Proposals"], frames: [], hotspots: [] });
    expect(report.missingPages).toEqual(["Web"]);
    expect(report.summary.missing).toBe(1);
  });

  it("reports unresolvable navigation in a route file as unchecked, not missing", () => {
    const config = validateFigmaConfig({ file: "abc", pages: { native: "App" } });
    const routes = [{ route: "(tabs)", platform: "native" as const, file: "src/app/(tabs)/index.tsx" }];
    const dynamic = [
      { file: "src/app/(tabs)/index.tsx", line: 3, target: "`/items/${id}`" },
      { file: "src/components/x.tsx", line: 1, target: "`/x/${id}`" },
    ];
    const report = compare(config, routes, [], { pages: ["App", "Proposals"], frames: [], hotspots: [] }, dynamic);
    expect(report.uncheckedNavigation.map((t) => t.target)).toEqual(["`/items/${id}`"]);
    expect(report.summary.missing).toBe(1);
  });

  it("gives up on a stalled Figma API with a clear error", async () => {
    const stalled: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    const config = validateFigmaConfig({ file: "abc", pages: { web: "Web" } });
    await expect(readFigma(config, "t", stalled, 20)).rejects.toThrow(/Figma API \/v1\/files\/abc didn't answer within/);
  });

  it("needs a token", async () => {
    await expect(checkFigmaRoutes({ root: APP, token: "", fetch: recorded })).rejects.toThrow(/FIGMA_ACCESS_TOKEN/);
  });
});

describe("the figma-routes doctor rule", () => {
  afterEach(() => vi.unstubAllEnvs());
  const run = async (strict: boolean) => {
    const found: FindingInput[] = [];
    await checkFigmaRoutesRule({ root: APP, strict, report: (f: FindingInput) => found.push(f) } as unknown as DoctorContext);
    return found;
  };

  it("names the file when genesis.config.json isn't valid JSON", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "figma-routes-"));
    try {
      writeFileSync(path.join(dir, "genesis.config.json"), '{ "figma": { "file": "abc", }');
      expect(() => readFigmaConfig(dir)).toThrow(FigmaConfigError);
      expect(() => readFigmaConfig(dir)).toThrow(/genesis\.config\.json isn't valid JSON/);
      const found: FindingInput[] = [];
      await checkFigmaRoutesRule({ root: dir, strict: false, report: (f: FindingInput) => found.push(f) } as unknown as DoctorContext);
      expect(found).toEqual([expect.objectContaining({ rule: "figma-routes", level: "warn", message: expect.stringContaining("isn't valid JSON") })]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is one info notice without a token", async () => {
    vi.stubEnv("FIGMA_ACCESS_TOKEN", "");
    expect(await run(true)).toEqual([expect.objectContaining({ rule: "figma-routes", level: "info", message: expect.stringContaining("skipped") })]);
  });

  it("reports gaps as info, warn under --strict, and never error", async () => {
    vi.stubEnv("FIGMA_ACCESS_TOKEN", "test-token");
    vi.stubGlobal("fetch", recorded);
    try {
      const plain = await run(false);
      expect(plain.length).toBe(8);
      expect(plain.every((f) => f.level === "info")).toBe(true);
      const strict = await run(true);
      expect(strict.filter((f) => f.level === "warn").length).toBe(6);
      expect(strict.some((f) => f.level === "error")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
