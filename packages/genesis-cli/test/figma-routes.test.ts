import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appNavTargets,
  appRoutes,
  checkFigmaRoutes,
  destinations,
  figmaIdOf,
  formatCoverage,
  navTargets,
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
