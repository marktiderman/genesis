/** One visit: open the target, wait for it to settle, run the checks, fail on anything not allowed. */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { applyAllow, checkPage, formatFinding, validateAllow, type AllowEntry, type Engine, type Viewport } from "@marktiderman/genesis-cli/verify";
import { SAMPLE_DIR, type Target } from "./pages";

export const ALLOW: AllowEntry[] = JSON.parse(readFileSync(join(import.meta.dirname, "allow.json"), "utf8")).allow;
const allowErrors = validateAllow(ALLOW);
if (allowErrors.length) throw new Error(allowErrors.join("\n"));

export const FINDINGS_LOG = join(SAMPLE_DIR, "test-results", "conformance-findings.jsonl");

export async function visit(page: Page, origin: string, target: Target, info: TestInfo) {
  const { engine, viewport } = info.project.metadata as { engine: Engine; viewport: Viewport };
  const response = await page.goto(origin + target.url, { waitUntil: "load" });
  expect(response?.status(), `${target.id} answered ${response?.status()}`).toBeLessThan(400);
  if (target.kind === "story") await page.locator("#storybook-root > *, #storybook-docs > *").first().waitFor({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);

  const findings = await checkPage(page, { viewport, skipMeta: target.kind === "story" });
  const where = { page: target.id, viewport: viewport.name, engine };
  const { failing, allowed } = applyAllow(ALLOW, findings, where);

  mkdirSync(join(SAMPLE_DIR, "test-results"), { recursive: true });
  appendFileSync(
    FINDINGS_LOG,
    `${JSON.stringify({ ...where, failing, allowed: allowed.map((a) => ALLOW.indexOf(a.entry)) })}\n`,
  );
  if (failing.length) await info.attach("findings.json", { body: JSON.stringify(failing, null, 2), contentType: "application/json" });
  expect(failing.map(formatFinding), `${target.id} at ${viewport.name} in ${engine}`).toEqual([]);
}
