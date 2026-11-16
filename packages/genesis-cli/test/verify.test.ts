import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAllow, allViewports, contextOptions, domChecks, validateAllow, type AllowEntry, type Finding } from "../src/verify/index.js";

describe("verify matrix", () => {
  it("has six widths and two zoom viewports, touch on phones and tablets", () => {
    const vps = allViewports();
    expect(vps.map((v) => v.name)).toEqual(["320", "375", "768", "1024", "1280", "1440", "zoom-200", "zoom-400"]);
    expect(vps.filter((v) => v.touch).map((v) => v.name)).toEqual(["320", "375", "768", "zoom-200", "zoom-400"]);
    // 1280×1024 at 400% lays out in 320×256 CSS px (WCAG 1.4.10).
    expect(vps.find((v) => v.name === "zoom-400")).toMatchObject({ width: 320, height: 256 });
  });

  it("turns isMobile off in Firefox and reduces motion everywhere", () => {
    const phone = allViewports()[0];
    expect(contextOptions(phone, "firefox")).toMatchObject({ hasTouch: true, isMobile: false, reducedMotion: "reduce" });
    expect(contextOptions(phone, "webkit")).toMatchObject({ hasTouch: true, isMobile: true });
  });
});

describe("verify allow", () => {
  const finding: Finding = { check: "reflow", target: "main > div.wide", message: "runs past" };
  const where = { page: "/items", viewport: "320", engine: "webkit" as const };

  it("covers a finding by check, page pattern, viewport, engine and target", () => {
    const entries: AllowEntry[] = [{ check: "reflow", page: "/it*", viewports: ["320"], engines: ["webkit"], target: "div.wide", reason: "framed later" }];
    expect(applyAllow(entries, [finding], where).failing).toEqual([]);
    expect(applyAllow(entries, [finding], { ...where, engine: "chromium" }).failing).toHaveLength(1);
    expect(applyAllow(entries, [finding], { ...where, viewport: "375" }).failing).toHaveLength(1);
  });

  it("matches an axe entry only on its rule", () => {
    const axe: Finding = { check: "axe", rule: "color-contrast", message: "low contrast" };
    const entries: AllowEntry[] = [{ check: "axe", rule: "target-size", page: "/items", reason: "x" }];
    expect(applyAllow(entries, [axe], where).failing).toEqual([axe]);
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

describe("verify in-page checks (Chromium)", async () => {
  const browserType = await chromium();
  const run = browserType ? it : it.skip;
  const check = async (html: string, opts = { phone: true, coarse: true, maxFocus: 20 }, hasTouch = true) => {
    const browser = await browserType!.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 256 }, hasTouch, isMobile: hasTouch });
      await page.setContent(html);
      return await page.evaluate(domChecks, opts);
    } finally {
      await browser.close();
    }
  };
  const META = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`;

  run("finds sideways scroll and the element that causes it, but not a framed one", async () => {
    const found = await check(`${META}<body style="margin:0"><div id="wide" style="width:600px">x</div><div style="overflow-x:auto"><table style="width:900px"><tr><td>ok</td></tr></table></div></body>`);
    const reflow = found.filter((f) => f.check === "reflow");
    expect(reflow.some((f) => f.message.includes("scrolls sideways"))).toBe(true);
    expect(reflow.map((f) => f.target)).toEqual([undefined, "div#wide"]);
  });

  run("catches content hidden by overflow-x: hidden on the body", async () => {
    const found = await check(`${META}<body style="margin:0;overflow-x:hidden"><p id="cut" style="width:500px">cut off</p></body>`);
    expect(found.filter((f) => f.check === "reflow").map((f) => f.target)).toContain("p#cut");
  });

  run("finds focus hidden under a fixed bar", async () => {
    const found = await check(
      `${META}<body style="margin:0"><div style="height:400px"></div><a id="under" href="#" style="display:block;height:20px">link</a><div style="height:400px"></div>` +
        `<nav style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#fff"></nav></body>`,
    );
    expect(found.filter((f) => f.check === "focus-obscured").map((f) => f.target)).toContain("a#under");
  });

  run("measures the 44px hit area with a touchTarget-style pseudo-element", async () => {
    const found = await check(
      `${META}<style>.tt{position:relative}.tt::after{content:"";position:absolute;width:44px;height:44px;left:50%;top:50%;transform:translate(-50%,-50%)}</style>` +
        `<body><button id="small" style="width:24px;height:24px">a</button><button id="ok" class="tt" style="width:24px;height:24px">b</button></body>`,
    );
    expect(found.filter((f) => f.check === "hit-area").map((f) => f.target)).toEqual(["button#small"]);
  });

  run("counts floating controls on a phone and reports a missing viewport meta", async () => {
    const found = await check(
      `<body><button style="position:fixed;right:8px;bottom:8px">help</button><button style="position:fixed;left:8px;bottom:8px">chat</button></body>`,
    );
    expect(found.some((f) => f.check === "floating-controls")).toBe(true);
    expect(found.filter((f) => f.check === "viewport-meta")).toHaveLength(3);
  });
});
