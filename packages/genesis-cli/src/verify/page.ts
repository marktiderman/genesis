/**
 * Check one loaded page: axe's WCAG 2.2 A/AA rules (target-size included), then the in-page checks
 * (dom.ts), in that order because the focus check moves focus and scrolls. Read-only: the page
 * gets no input but `focus()`. Animations and transitions are stopped first, so a layout is
 * measured at rest.
 */
import type { Page } from "@playwright/test";
import { targetParts } from "./allow.js";
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
      const selector = node.target.map(String).join(" ");
      // axe names some elements only by a generated id (Radix's #radix-…), which changes between
      // renders: describe those by tag, slot or role and accessible name instead.
      // A selector that's only tags once its volatile parts are gone (`a[title="Details"]`, a
      // calendar's `button[data-day="11/1/2026"]`) doesn't say which element: described too.
      // (An aria-label names it: the allow list holds to that, so it stays.)
      const bare = !/\[aria-label/.test(selector) && targetParts(selector).parts.every((p) => /^[a-z][a-z0-9-]*$/.test(p));
      const target = /#(?:radix-|_r_|_R_)/.test(selector) || bare ? await stableTarget(page, selector) : selector;
      // target-size can't see genesis-ui's touchTarget pseudo-element, which makes the hit area
      // 44px on a coarse pointer; a node that has one is dropped.
      if (v.id === "target-size" && opts.viewport.touch && (await hasTouchTarget(page, selector))) continue;
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

/** A selector-like description of an element that doesn't depend on generated ids: `tag[data-slot="x"] "Name"`. */
async function stableTarget(page: Page, selector: string): Promise<string> {
  return page
    .evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return sel;
      const part = (n: Element) => {
        const slot = n.getAttribute("data-slot");
        const testId = n.getAttribute("data-testid");
        const role = n.getAttribute("role");
        const tag = n.tagName.toLowerCase();
        return testId ? `${tag}[data-testid="${testId}"]` : slot ? `${tag}[data-slot="${slot}"]` : role ? `${tag}[role="${role}"]` : tag;
      };
      const parent = el.parentElement && el.parentElement !== document.body ? `${part(el.parentElement)} > ` : "";
      const label = (el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "").replace(/\s+/g, " ").replace(/"/g, "'").trim();
      const name = label.length > 48 ? `${label.slice(0, 28)}…${label.slice(-19)}` : label;
      return `${parent}${part(el)}${name ? ` "${name}"` : ""}`;
    }, selector)
    .catch(() => selector);
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
      // ...and the area really takes taps: hit-test its edges in view (a clipped or covered area
      // doesn't), then put every scroll back.
      const scrolled: Array<[Element, number, number]> = [];
      for (let a = el.parentElement; a; a = a.parentElement) scrolled.push([a, a.scrollTop, a.scrollLeft]);
      const win: [number, number] = [window.scrollX, window.scrollY];
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const reaches = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      });
      for (const [a, top, left] of scrolled) if (a.scrollTop !== top || a.scrollLeft !== left) a.scrollTo({ top, left, behavior: "instant" });
      window.scrollTo({ left: win[0], top: win[1], behavior: "instant" });
      return reaches;
    }, selector)
    .catch(() => false);
}
