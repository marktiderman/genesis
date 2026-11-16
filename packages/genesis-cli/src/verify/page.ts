/**
 * Check one loaded page: axe's WCAG 2.2 A/AA rules (target-size included), then the in-page checks
 * (dom.ts), in that order because the focus check moves focus and scrolls. Read-only: the page
 * gets no input but `focus()`. Animations and transitions are stopped first, so a layout is
 * measured at rest.
 */
import type { Page } from "@playwright/test";
import { domChecks, type DomFinding } from "./dom.js";
import type { Viewport } from "./matrix.js";

export type CheckId = DomFinding["check"] | "axe";

export interface Finding {
  check: CheckId;
  /** `info` findings are reported and never fail a run. */
  level?: "info";
  /** The axe rule id, for `axe` findings. */
  rule?: string;
  target?: string;
  message: string;
}

export interface CheckPageOptions {
  viewport: Viewport;
  /** Axe rules to leave out everywhere (rare: a rule that misfires on a pattern Genesis ships). */
  disableAxeRules?: string[];
  /** Selectors axe skips (third-party frames). */
  axeExclude?: string[];
  /** Skip the viewport-meta check (a story iframe has Storybook's meta, not the app's). */
  skipMeta?: boolean;
  maxFocus?: number;
}

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const AT_REST = "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";

/**
 * Doubles the browser's default text size (Chromium's font-size setting, as a person sets it), for
 * the text-200 viewport. Call before `page.goto`.
 */
export async function zoomText(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes" as never, { fontSizes: { standard: 32, fixed: 26 } } as never);
}

export async function checkPage(page: Page, opts: CheckPageOptions): Promise<Finding[]> {
  await page.addStyleTag({ content: AT_REST });
  // Anything still running (a transition the stylesheet caught mid-way) settles first.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), undefined, { timeout: 2_000 })
    .catch(() => {});
  const findings: Finding[] = [];

  const { default: AxeBuilder } = await import("@axe-core/playwright");
  let axe = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (opts.disableAxeRules?.length) axe = axe.disableRules(opts.disableAxeRules);
  for (const sel of opts.axeExclude ?? []) axe = axe.exclude(sel);
  const { violations } = await axe.analyze();
  for (const v of violations) {
    for (const node of v.nodes) {
      const target = node.target.map(String).join(" ");
      // target-size can't see genesis-ui's touchTarget pseudo-element, which makes the hit area
      // 44px on a coarse pointer; a node that has one is dropped.
      if (v.id === "target-size" && opts.viewport.touch && (await hasTouchTarget(page, target))) continue;
      findings.push({ check: "axe", rule: v.id, target, message: `${v.help} (${v.impact ?? "n/a"})` });
    }
  }

  const dom = await page.evaluate(domChecks, {
    phone: opts.viewport.phone,
    coarse: opts.viewport.touch,
    maxFocus: opts.maxFocus ?? 60,
    textZoom: opts.viewport.textZoom,
  });
  for (const f of dom) if (!(opts.skipMeta && f.check === "viewport-meta")) findings.push(f);
  return findings;
}

async function hasTouchTarget(page: Page, selector: string): Promise<boolean> {
  return page
    .evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el || !matchMedia("(pointer: coarse)").matches) return false;
      const big = ["::before", "::after"].some((p) => {
        const s = getComputedStyle(el, p);
        return s.content !== "none" && s.position === "absolute" && parseFloat(s.width) >= 44 && parseFloat(s.height) >= 44;
      });
      if (!big) return false;
      // ...and the area really takes taps: hit-test its edges (a clipped or covered area doesn't).
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      });
    }, selector)
    .catch(() => false);
}
