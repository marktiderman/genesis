/**
 * Check one loaded page: the in-page checks (dom.ts) and axe's WCAG 2.2 A/AA rules, target-size
 * included. Read-only: it resizes nothing itself, and gives the page no input but `focus()`.
 */
import type { Page } from "@playwright/test";
import { domChecks, type DomFinding } from "./dom.js";
import type { Viewport } from "./matrix.js";

export type CheckId = DomFinding["check"] | "axe";

export interface Finding {
  check: CheckId;
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

export async function checkPage(page: Page, opts: CheckPageOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  const dom = await page.evaluate(domChecks, {
    phone: opts.viewport.phone,
    coarse: opts.viewport.touch,
    maxFocus: opts.maxFocus ?? 60,
  });
  for (const f of dom) if (!(opts.skipMeta && f.check === "viewport-meta")) findings.push(f);

  const { default: AxeBuilder } = await import("@axe-core/playwright");
  let axe = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (opts.disableAxeRules?.length) axe = axe.disableRules(opts.disableAxeRules);
  for (const sel of opts.axeExclude ?? []) axe = axe.exclude(sel);
  const { violations } = await axe.analyze();
  // target-size can't see genesis-ui's touchTarget pseudo-element, which makes the hit area
  // 44px on a coarse pointer; a node that has one is dropped.
  for (const v of violations) {
    for (const node of v.nodes) {
      const target = node.target.map(String).join(" ");
      if (v.id === "target-size" && opts.viewport.touch && (await hasTouchTarget(page, target))) continue;
      findings.push({ check: "axe", rule: v.id, target, message: `${v.help} (${v.impact ?? "n/a"})` });
    }
  }
  return findings;
}

async function hasTouchTarget(page: Page, selector: string): Promise<boolean> {
  return page
    .evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return ["::before", "::after"].some((p) => {
        const s = getComputedStyle(el, p);
        return s.content !== "none" && s.position === "absolute" && parseFloat(s.width) >= 44 && parseFloat(s.height) >= 44;
      });
    }, selector)
    .catch(() => false);
}
