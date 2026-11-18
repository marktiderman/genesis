import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAllow,
  allowFor,
  entryCovers,
  patternCovers,
  matchesTarget,
  allViewports,
  checkPage,
  contextOptions,
  domChecks,
  flattenReactRouterRoutes,
  matchesPage,
  matchesPattern,
  onePathPerPattern,
  patternFor,
  validateAllow,
  widthViewport,
  type AllowEntry,
  type DomCheckOptions,
  type Finding,
} from "../src/verify/index.js";

describe("verify matrix", () => {
  it("has six widths and two zoom viewports; touch on phones and tablets, not on a zoomed desktop", () => {
    const vps = allViewports();
    expect(vps.map((v) => v.name)).toEqual(["320", "375", "768", "1024", "1280", "1440", "zoom-200", "zoom-400", "text-200"]);
    expect(vps.filter((v) => v.touch).map((v) => v.name)).toEqual(["320", "375", "768"]);
    // 1280×1024 at 400% lays out in 320×256 CSS px (WCAG 1.4.10).
    expect(vps.find((v) => v.name === "zoom-400")).toMatchObject({ width: 320, height: 256, touch: false, phone: true });
  });

  it("turns isMobile off in Firefox and reduces motion everywhere", () => {
    const phone = allViewports()[0];
    expect(contextOptions(phone, "firefox")).toMatchObject({ hasTouch: true, isMobile: false, reducedMotion: "reduce" });
    expect(contextOptions(phone, "webkit")).toMatchObject({ hasTouch: true, isMobile: true });
  });
});

describe("verify routes", () => {
  const patterns = flattenReactRouterRoutes([
    {
      id: "root",
      path: "",
      children: [
        { id: "index", index: true },
        { id: "items", path: "items" },
        { id: "item", path: "items/:id" },
        { id: "demo", path: "demo", children: [{ id: "demo-index", index: true }, { id: "client", path: ":ws/clients/:id/:section?" }] },
        { id: "splat", path: "docs/*" },
      ],
    },
  ]);

  it("flattens React Router's manifest into full patterns", () => {
    expect(patterns.map((p) => p.pattern)).toEqual(["/", "/items", "/items/:id", "/demo", "/demo/:ws/clients/:id/:section?", "/docs/*"]);
  });

  it("matches a path to its most specific pattern, optional segments and splats included", () => {
    expect(patternFor("/items", patterns)?.pattern).toBe("/items");
    expect(patternFor("/items/42", patterns)?.pattern).toBe("/items/:id");
    expect(patternFor("/demo/a/clients/1", patterns)?.pattern).toBe("/demo/:ws/clients/:id/:section?");
    expect(patternFor("/demo/a/clients/1/bookings", patterns)?.pattern).toBe("/demo/:ws/clients/:id/:section?");
    expect(patternFor("/docs/a/b", patterns)?.pattern).toBe("/docs/*");
    expect(patternFor("/nope/x", patterns)).toBeUndefined();
  });

  it("keeps a parameter's static suffix, and ranks a parameter route over a splat (React Router's ranking)", () => {
    const more = flattenReactRouterRoutes([{ id: "r", path: "", children: [{ id: "json", path: "files/:name.json" }, { id: "docs", path: "docs/*" }, { id: "page", path: "docs/:section/:page" }] }]);
    expect(matchesPattern("/files/:name.json", "/files/report.json")).toBe(true);
    expect(matchesPattern("/files/:name.json", "/files/report.csv")).toBe(false);
    expect(patternFor("/docs/api/start", more)?.pattern).toBe("/docs/:section/:page");
    expect(patternFor("/docs/overview", more)?.pattern).toBe("/docs/*");
    // A parameter with a static suffix outranks a plain one, whichever is listed first.
    const files = flattenReactRouterRoutes([{ id: "r", path: "", children: [{ id: "id", path: "files/:id" }, { id: "json", path: "files/:name.json" }] }]);
    expect(patternFor("/files/report.json", files)?.pattern).toBe("/files/:name.json");
    expect(patternFor("/files/report", files)?.pattern).toBe("/files/:id");
    const entry: AllowEntry = { check: "reflow", page: "/files/:name.json", reason: "x" };
    expect(applyAllow([entry], [{ check: "reflow", message: "m" }], { page: "/files/report.csv", viewport: "320", engine: "chromium" }).failing).toHaveLength(1);
  });

  it("keeps an absolute child path, and a parent that renders at its own path", () => {
    const more = flattenReactRouterRoutes([
      { id: "root", path: "", children: [{ id: "index", index: true }, { id: "products", path: "products", children: [{ id: "product", path: "/products/:id" }] }] },
    ]);
    expect(more.map((p) => p.pattern)).toEqual(["/", "/products", "/products/:id"]);
    // An empty-path parent with no index child renders at its own path too.
    expect(flattenReactRouterRoutes([{ id: "root", path: "", children: [{ id: "a", path: "about" }, { id: "rest", path: "*" }] }]).map((p) => p.pattern)).toEqual(["/", "/about", "/*"]);
  });

  it("keeps one path per pattern", () => {
    expect(onePathPerPattern(["/items", "/items/1", "/items/2", "/demo/a/clients/1", "/demo/b/clients/2/x", "/other"], patterns)).toEqual([
      "/items",
      "/items/1",
      "/demo/a/clients/1",
      "/other",
    ]);
  });
});

describe("verify allow", () => {
  const finding: Finding = { check: "reflow", target: 'main > div.wide "Totals"', message: "runs past" };
  const where = { page: "/items/42", viewport: "320", engine: "webkit" as const };

  it("covers a finding by check, route pattern, viewport, engine and target", () => {
    const entries: AllowEntry[] = [{ check: "reflow", page: "/items/:id", viewports: ["320"], engines: ["webkit"], target: '"Totals"', reason: "framed later" }];
    expect(applyAllow(entries, [finding], where).failing).toEqual([]);
    expect(applyAllow(entries, [finding], { ...where, page: "/items/1" }).failing).toEqual([]);
    expect(applyAllow(entries, [finding], { ...where, engine: "chromium" }).failing).toHaveLength(1);
    expect(applyAllow(entries, [finding], { ...where, viewport: "375" }).failing).toHaveLength(1);
  });

  it("matches story ids exactly or by prefix", () => {
    expect(matchesPage("story:forms--*", "story:forms--default")).toBe(true);
    expect(matchesPage("story:forms--default", "story:forms--other")).toBe(false);
    expect(matchesPage("/items/:id", "story:items--x")).toBe(false);
  });

  it("matches an axe entry only on its rule, and never fails on info notes", () => {
    const axe: Finding = { check: "axe", rule: "color-contrast", message: "low contrast" };
    const note: Finding = { check: "touch-media", level: "info", message: "no coarse pointer" };
    const entries: AllowEntry[] = [{ check: "axe", rule: "target-size", page: "/items/42", reason: "x" }];
    const result = applyAllow(entries, [axe, note], where);
    expect(result.failing).toEqual([axe]);
    expect(result.notes).toEqual([note]);
  });

  it("matches a target by whole selector parts or name, never as a substring", () => {
    expect(matchesTarget("html", "html")).toBe(true);
    expect(matchesTarget("html", 'div[data-slot="html-preview"]')).toBe(false);
    expect(matchesTarget("div#tabs", "div#tabs-2")).toBe(false);
    expect(matchesTarget('tr[data-slot="table-row"] > button', 'tbody > tr[data-slot="table-row"]:nth-of-type(3) > button:nth-of-type(1) "Edit"')).toBe(true);
    expect(matchesTarget('"Edit"', 'tbody > button "Edit"')).toBe(true);
    expect(matchesTarget('button "Edit"', 'tbody > button "Delete"')).toBe(false);
    expect(matchesTarget("button", "button#radix-_r_12_")).toBe(true);
    expect(matchesTarget("time", 'time[datetime="2026-11-15T18:11:00Z"]')).toBe(true);
    expect(matchesTarget('a[data-testid="package-chat"]', 'a[data-testid="package-chat"] "genesis-chat 0.11.0"')).toBe(true);
  });

  it("holds an entry that names an aria-label to it; a bare entry still matches", () => {
    expect(matchesTarget('button[aria-label="Save"]', 'div > button[aria-label="Delete"]')).toBe(false);
    expect(matchesTarget('button[aria-label="Save"]', 'div > button[aria-label="Save"]')).toBe(true);
    expect(matchesTarget("div > button", 'div > button[aria-label="Delete"]')).toBe(true);
    const save: AllowEntry = { check: "axe", rule: "target-size", page: "/items/42", target: 'button[aria-label="Save"]', reason: "x" };
    expect(applyAllow([save], [{ check: "axe", rule: "target-size", target: 'button[aria-label="Delete"]', message: "m" }], where).failing).toHaveLength(1);
    const bare: AllowEntry = { check: "axe", rule: "target-size", page: "/items/42", target: "div > button", reason: "x" };
    expect(applyAllow([bare], [{ check: "axe", rule: "target-size", target: 'div > button[aria-label="Delete"]', message: "m" }], where).failing).toEqual([]);
  });

  it("prefers a targeted entry wherever it sits in the list", () => {
    const broad: AllowEntry = { check: "reflow", page: "/items/42", reason: "broad" };
    const narrow: AllowEntry = { check: "reflow", page: "/items/42", target: "div.wide", reason: "narrow" };
    expect(allowFor([broad, narrow], { check: "reflow", target: "main > div.wide", message: "m" }, where)).toBe(narrow);
  });

  it("compares page patterns segment by segment for growth", () => {
    expect(patternCovers("/demo/:ws", "/demo/all")).toBe(true);
    expect(patternCovers("/demo/:ws", "/demo/*")).toBe(false);
    expect(patternCovers("/demo/*", "/demo/:ws/clients")).toBe(true);
    expect(patternCovers("/demo/:ws/:section?", "/demo/:ws")).toBe(true);
    expect(patternCovers("/demo/:ws", "/demo/:ws/:section?")).toBe(false);
    expect(patternCovers("/items", "/items/:id")).toBe(false);
    expect(patternCovers("/files/:name.json", "/files/:name.csv")).toBe(false);
    expect(patternCovers("/files/:name.json", "/files/report.csv")).toBe(false);
    expect(patternCovers("/files/:name.json", "/files/report.json")).toBe(true);
    expect(patternCovers("/files/:id", "/files/:name.json")).toBe(true);
    const base: AllowEntry = { check: "reflow", page: "/demo/:ws", target: "html", reason: "x" };
    expect(entryCovers(base, { ...base, page: "/demo/*" })).toBe(false);
  });

  it("doesn't count a narrowed entry as growth", () => {
    const base: AllowEntry = { check: "hit-area", page: "/items/:id", reason: "x" };
    expect(entryCovers(base, { check: "hit-area", page: "/items/:id", viewports: ["320"], target: "button", reason: "x" })).toBe(true);
    expect(entryCovers(base, { check: "reflow", page: "/items/:id", reason: "x" })).toBe(false);
    expect(entryCovers({ ...base, viewports: ["320"] }, { ...base, viewports: ["320", "375"] })).toBe(false);
  });

  it("needs a reason on every entry", () => {
    expect(validateAllow([{ check: "reflow", page: "/", reason: " " }])).toHaveLength(1);
  });
});

async function chromium() {
  try {
    const { chromium } = await import("@playwright/test");
    return existsSync(chromium.executablePath()) ? chromium : undefined;
  } catch {
    return undefined;
  }
}

describe("verify in the browser (Chromium)", async () => {
  const browserType = await chromium();
  // CI's Conformance job sets this, so the tests can't pass there by skipping.
  if (process.env.VERIFY_REQUIRE_BROWSER && !browserType) throw new Error("VERIFY_REQUIRE_BROWSER is set but Playwright's Chromium isn't installed");
  const run = browserType ? it : it.skip;
  const PHONE: DomCheckOptions = { phone: true, coarse: true, maxFocus: 30 };
  const open = async (html: string, touch = true, size = { width: 320, height: 256 }) => {
    const browser = await browserType!.launch();
    const context = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    await page.setContent(html);
    return { page, close: () => browser.close() };
  };
  const check = async (html: string, opts = PHONE, touch = true) => {
    const { page, close } = await open(html, touch);
    try {
      return await page.evaluate(domChecks, opts);
    } finally {
      await close();
    }
  };
  const META = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`;
  // AppShell's shape: an overflow-hidden root, a main that scrolls vertically, a fixed phone tab bar.
  const shell = (content: string, mainStyle = "") =>
    `${META}<body style="margin:0"><div style="height:100vh;overflow:hidden;display:flex;flex-direction:column">` +
    `<main style="flex:1;overflow-y:auto;${mainStyle}">${content}</main></div>` +
    `<nav data-testid="tabs" style="position:fixed;bottom:0;left:0;right:0;height:64px;background:#fff"><a href="#" style="display:inline-block;width:80px;height:64px">Home</a></nav></body>`;

  run("passes a page that fits, with a complete viewport meta", async () => {
    const found = await check(shell(`<p>fits</p>`), { ...PHONE, coarse: false });
    expect(found).toEqual([]);
  });

  run("finds sideways scroll and its cause, but not a table in its own scrolling frame", async () => {
    const found = await check(`${META}<body style="margin:0"><div id="wide" style="width:600px">x</div><div style="overflow-x:auto"><table style="width:900px"><tr><td>ok</td></tr></table></div></body>`);
    const reflow = found.filter((f) => f.check === "reflow");
    expect(reflow.some((f) => f.message.includes("scrolls sideways"))).toBe(true);
    // The page itself (html) and the element that makes it scroll; not the framed table.
    expect(reflow.map((f) => f.target)).toEqual(["html", 'div#wide "x"']);
  });

  run("finds a too-wide card inside AppShell's clipping root and vertically scrolling main", async () => {
    const found = await check(shell(`<div id="card" style="width:600px">card</div><div style="overflow-x:auto"><pre>${"x".repeat(200)}</pre></div>`), { ...PHONE, coarse: false });
    // The card, and main (the shell's page scroller) scrolling sideways because of it; not the framed code.
    expect(found.filter((f) => f.check === "reflow").map((f) => f.target)).toEqual(["div > main", 'div#card "card"']);
  });

  run("doesn't count a table cell clipping its own content at the column's edge", async () => {
    const found = await check(
      `${META}<body style="margin:0"><div style="overflow-x:auto"><table style="width:100%;table-layout:fixed"><tr><td style="overflow:hidden;width:60px"><span id="badge" style="display:inline-block;width:400px">Medium</span></td></tr></table></div></body>`,
      { ...PHONE, coarse: false },
    );
    expect(found.filter((f) => f.check === "reflow")).toEqual([]);
  });

  run("still finds content cut off by wide content that hides its own overflow", async () => {
    const found = await check(`${META}<body style="margin:0"><pre id="code" style="overflow-x:hidden;margin:0"><span id="line" style="display:inline-block;width:600px">long line</span></pre></body>`, { ...PHONE, coarse: false });
    expect(found.filter((f) => f.check === "reflow").some((f) => f.message.includes("cut off by pre#code"))).toBe(true);
  });

  run("finds a tablist that hides overflow cutting off its last tabs, and a clipping cell in a table that doesn't scroll", async () => {
    const tabs = await check(
      `${META}<body style="margin:0"><div role="tablist" id="tabs" style="display:flex;overflow:hidden"><button style="flex:none;width:200px">One</button><button id="last" style="flex:none;width:200px">Two</button></div></body>`,
      { ...PHONE, coarse: false },
    );
    expect(tabs.filter((f) => f.check === "reflow").some((f) => f.message.includes("cut off by div#tabs"))).toBe(true);
    const unframed = await check(
      `${META}<body style="margin:0"><table style="width:600px;table-layout:fixed"><tr><td style="overflow:hidden;width:600px"><span style="display:inline-block;width:600px">Medium</span></td></tr></table></body>`,
      { ...PHONE, coarse: false },
    );
    expect(unframed.some((f) => f.check === "reflow")).toBe(true);
  });

  run("catches content hidden by overflow-x: hidden on the body", async () => {
    const found = await check(`${META}<body style="margin:0;overflow-x:hidden"><p id="cut" style="width:500px">cut off</p></body>`);
    expect(found.filter((f) => f.check === "reflow").map((f) => f.target)).toContain('p#cut "cut off"');
  });

  run("finds focus hidden under a fixed bar, and passes once scroll-padding clears it", async () => {
    const page = (pad: string) => shell(`<div style="height:400px"></div><a id="under" href="#" style="display:block;height:20px">link</a><div style="height:400px"></div>`, pad);
    const hiddenUnder = await check(page(""), { ...PHONE, coarse: false });
    expect(hiddenUnder.filter((f) => f.check === "focus-obscured").map((f) => f.target)).toContain('a#under "link"');
    const padded = await check(page("scroll-padding-bottom:64px"), { ...PHONE, coarse: false });
    expect(padded.filter((f) => f.check === "focus-obscured")).toEqual([]);
  });

  run("sees a painted bar that ignores the pointer", async () => {
    const found = await check(
      `${META}<body style="margin:0"><div style="height:400px"></div><a id="under" href="#" style="display:block;height:20px">link</a><div style="height:400px"></div>` +
        `<div style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#fff;pointer-events:none"></div></body>`,
      { ...PHONE, coarse: false },
    );
    expect(found.filter((f) => f.check === "focus-obscured").map((f) => f.target)).toContain('a#under "link"');
  });

  run("measures paint order: a bar behind a raised link doesn't cover it, a z-index:auto bar above it does", async () => {
    const page = (barZ: string, linkStyle: string) =>
      `${META}<body style="margin:0"><div style="height:400px"></div><a id="link" href="#" style="display:block;height:20px;${linkStyle}">link</a><div style="height:400px"></div>` +
      `<div style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#fff;pointer-events:none;${barZ}"></div></body>`;
    const behind = await check(page("z-index:1", "position:relative;z-index:2;background:#ccc"), { ...PHONE, coarse: false });
    expect(behind.filter((f) => f.check === "focus-obscured")).toEqual([]);
    // A raised link that itself ignores the pointer: still not covered by the bar behind it.
    const raisedNoPointer = await check(page("z-index:1", "position:relative;z-index:2;background:#ccc;pointer-events:none"), { ...PHONE, coarse: false });
    expect(raisedNoPointer.filter((f) => f.check === "focus-obscured")).toEqual([]);
    const above = await check(page("", ""), { ...PHONE, coarse: false });
    expect(above.filter((f) => f.check === "focus-obscured").map((f) => f.target)).toContain('a#link "link"');
  });

  run("doesn't count a backdrop that sits behind the page and ignores the pointer", async () => {
    const found = await check(
      `${META}<body style="margin:0"><div style="position:fixed;inset:0;background:#eee;pointer-events:none;z-index:-1"></div><div style="height:400px"></div><a id="link" href="#" style="display:block;height:20px">link</a><div style="height:400px"></div></body>`,
      { ...PHONE, coarse: false },
    );
    expect(found.filter((f) => f.check === "focus-obscured")).toEqual([]);
  });

  run("doesn't count text that a box scrolls vertically as clipped at 200% text", async () => {
    const found = await check(
      `${META}<body><div style="height:40px;overflow-x:hidden;overflow-y:auto"><p>one</p><p>two</p><p>three</p></div></body>`,
      { ...PHONE, coarse: false, textZoom: true },
    );
    expect(found.filter((f) => f.check === "text-clipped")).toEqual([]);
  });

  run("leaves focus and every frame's scroll as it found them", async () => {
    const { page, close } = await open(shell(`<div style="height:900px"></div><a href="#">deep link</a>`));
    try {
      await page.evaluate(domChecks, PHONE);
      expect(await page.evaluate(() => [document.querySelector("main")!.scrollTop, document.activeElement === document.body])).toEqual([0, true]);
    } finally {
      await close();
    }
  });

  run("measures the 44px hit area: touchTarget pseudo-elements and labels count, sr-only inputs don't", async () => {
    const found = await check(
      `${META}<style>.tt{position:relative}.tt::after{content:"";position:absolute;width:44px;height:44px;left:50%;top:50%;transform:translate(-50%,-50%)}` +
        `.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>` +
        `<body><button id="small" style="width:24px;height:24px">a</button><button id="ok" class="tt" style="width:24px;height:24px">b</button>` +
        `<label style="display:flex;min-height:44px;min-width:200px"><input id="labelled" type="checkbox">Remember me</label>` +
        `<input type="checkbox" class="sr" id="peer"><a class="sr" href="#main">Skip to content</a></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(['button#small "a"']);
  });

  run("measures controls below the fold, and hit-tests a label there in view", async () => {
    const { page, close } = await open(
      `${META}<body style="margin:0"><div style="height:1500px"></div><button id="deep" style="width:24px;height:24px">d</button>` +
        `<label style="display:flex;min-height:44px;min-width:200px"><input id="far" type="checkbox">Remember me</label><div style="height:600px"></div></body>`,
    );
    try {
      const found = await page.evaluate(domChecks, PHONE);
      expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(['button#deep "d"']);
      // Scrolled back where it was.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await close();
    }
  });

  run("measures a control scrolled out of a sideways strip, not one in a closed drawer", async () => {
    const found = await check(
      `${META}<body style="margin:0"><div role="tablist" style="display:flex;overflow-x:auto;width:320px">` +
        `<button style="flex:none;width:300px;height:48px">One</button><button style="flex:none;width:300px;height:48px">Two</button><button id="far" style="flex:none;width:24px;height:24px">3</button></div>` +
        `<aside style="position:fixed;top:0;left:-300px;width:280px"><button id="drawer" style="width:24px;height:24px">x</button></aside></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(['button#far "3"']);
  });

  run("probes a tall label in the part that's on screen, and keeps a quote in a name intact", async () => {
    const found = await check(
      `${META}<body style="margin:0"><label style="display:block;width:200px;height:600px"><input id="tall" type="checkbox"> Remember me</label>` +
        `<button id="q" style="width:24px;height:24px" aria-label='Move "Intro" up'></button></body>`,
    );
    const hit = found.filter((f) => f.check === "hit-area").map((f) => f.target);
    expect(hit).toEqual([`button#q "Move 'Intro' up"`]);
  });

  run("doesn't count a label that has only a thin strip on screen", async () => {
    const found = await check(
      `${META}<body style="margin:0"><label style="position:fixed;left:0;top:246px;width:300px;height:200px;display:block"><input id="strip" type="checkbox"> Remember me</label></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toContain('input#strip');
  });

  run("keeps the start and the end of a long name", async () => {
    const found = await check(
      `${META}<body><button id="u" style="width:24px;height:24px" aria-label="Move the question about your weekly goals up"></button>` +
        `<button id="d" style="width:24px;height:24px" aria-label="Move the question about your weekly goals down"></button></body>`,
    );
    const names = found.filter((f) => f.check === "hit-area").map((f) => f.target);
    expect(new Set(names).size).toBe(2);
  });

  run("exempts a link in running text, not a link alone in a list item", async () => {
    const found = await check(
      `${META}<body><div>I agree to the <a id="terms" href="#">Terms</a> of use.</div><ul><li><a id="nav" href="#">Settings</a></li></ul></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(['a#nav "Settings"']);
  });

  run("counts floating controls on a phone, but not a full-width bar, a dialog or an off-screen panel", async () => {
    const found = await check(
      `${META}<body><button style="position:fixed;right:8px;bottom:80px">help</button>` +
        `<nav style="position:fixed;bottom:0;left:0;right:0"><a href="#">Home</a><a href="#">More</a></nav>` +
        `<div role="dialog" style="position:fixed;top:8px;left:8px;width:100px"><button>Close</button></div>` +
        `<aside style="position:fixed;top:0;left:-300px;width:280px"><button>Hidden</button></aside></body>`,
      { ...PHONE, coarse: false },
    );
    expect(found.filter((f) => f.check === "floating-controls")).toEqual([]);
    const two = await check(
      `${META}<body><button style="position:fixed;right:8px;bottom:8px">help</button><button style="position:fixed;left:8px;bottom:8px">chat</button></body>`,
      { ...PHONE, coarse: false },
    );
    expect(two.some((f) => f.check === "floating-controls")).toBe(true);
  });

  run("reports a missing viewport meta, and a touch emulation that didn't take as info", async () => {
    const found = await check(`<body><p>x</p></body>`, PHONE, false);
    expect(found.filter((f) => f.check === "viewport-meta")).toHaveLength(3);
    const media = found.find((f) => f.check === "touch-media");
    expect(media?.level).toBe("info");
    // With touch emulation missing, no hit-area findings at all.
    expect(found.some((f) => f.check === "hit-area")).toBe(false);
  });

  run("finds a shell scroller that scrolls sideways", async () => {
    const found = await check(`${META}<body style="margin:0"><div data-slot="shell-main" style="height:100vh;overflow:auto"><div style="width:700px;overflow:hidden">wide</div></div></body>`, { ...PHONE, coarse: false });
    expect(found.some((f) => f.check === "reflow" && f.message.includes("page scroller"))).toBe(true);
  });

  run("finds a 44px area that a neighbour on top takes taps from", async () => {
    const found = await check(
      `${META}<style>.tt{position:relative}.tt::after{content:"";position:absolute;width:44px;height:44px;left:50%;top:50%;transform:translate(-50%,-50%)}</style>` +
        `<body><div style="position:relative"><button id="a" class="tt" style="width:20px;height:20px;position:absolute;top:20px;left:20px">a</button>` +
        `<button id="b" class="tt" style="width:20px;height:20px;position:absolute;top:44px;left:20px">b</button></div></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(['button#a "a"']);
  });

  run("finds text cut off at 200% text, not an ellipsis", async () => {
    const found = await check(
      `${META}<body><div id="cut" style="height:20px;overflow:hidden"><p style="margin:0">line one</p><p style="margin:0">line two</p></div>` +
        `<div style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">a long truncated label</div></body>`,
      { ...PHONE, coarse: false, textZoom: true },
    );
    expect(found.filter((f) => f.check === "text-clipped").map((f) => f.target)).toEqual(['div#cut "line one line two"']);
  });

  run("checkPage runs axe with target-size and drops target-size on a touchTarget control", async () => {
    const { page, close } = await open(
      `${META}<style>@media (pointer: coarse){.tt{position:relative}.tt::after{content:"";position:absolute;width:44px;height:44px;left:50%;top:50%;transform:translate(-50%,-50%)}}</style>` +
        `<body><main><h1>t</h1><button class="tt" style="width:12px;height:12px;padding:0" aria-label="ok"></button><div style="margin-top:80px"><button style="width:12px;height:12px;padding:0" aria-label="tiny"></button><button style="width:12px;height:12px;padding:0" aria-label="tiny2"></button></div></main></body>`,
    );
    try {
      const findings = await checkPage(page, { viewport: widthViewport(320) });
      const targetSize = findings.filter((f) => f.rule === "target-size").map((f) => f.target);
      expect(targetSize).toContain('button[aria-label="tiny"]');
      expect(targetSize.some((t) => t === ".tt")).toBe(false);
    } finally {
      await close();
    }
  });
});
