/** One visit: open the target, wait for it to settle, run the checks, fail on anything not allowed. */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { applyAllow, checkPage, formatFinding, validateAllow, zoomText, type AllowEntry, type Engine, type Viewport } from "@marktiderman/genesis-cli/verify";
import { SAMPLE_DIR, type Target } from "./pages";

export const ALLOW: AllowEntry[] = JSON.parse(readFileSync(join(import.meta.dirname, "allow.json"), "utf8")).allow;
const allowErrors = [
  ...validateAllow(ALLOW),
  ...ALLOW.flatMap((e, i) => (e.check === "axe" && !e.rule ? [`allow entry ${i} (axe on ${e.page}) must name its rule`] : [])),
  ...ALLOW.flatMap((e, i) => (e.page === "*" || e.page === "/*" || e.page === "story:*" ? [`allow entry ${i} covers every page; name the pages`] : [])),
];
if (allowErrors.length) throw new Error(allowErrors.join("\n"));

export const RESULTS_DIR = join(SAMPLE_DIR, "test-results");
/** One findings log per worker, so lines from parallel workers never interleave. */
export const findingsLog = (worker: number) => join(RESULTS_DIR, `conformance-findings-${process.env.CONFORMANCE_SHARD ?? "0"}-${worker}.jsonl`);

/** The viewport meta is the same at every size: it is checked once per page, in this project. */
const META_PROJECT = "chromium-1280";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
const ERROR_SCREEN = /Oops!|An unexpected error occurred|The requested page could not be found/;

/** Waits until nothing in the DOM has changed for `quiet` ms (Supabase realtime and polling never let the network idle). */
async function domSettled(page: Page, info: TestInfo, quiet = 300, cap = 5_000) {
  const settled = await page.evaluate(
    ({ quiet, cap }) =>
      new Promise<boolean>((resolve) => {
        let timer = setTimeout(() => done(true), quiet);
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => done(true), quiet);
        });
        const capTimer = setTimeout(() => done(false), cap);
        function done(ok: boolean) {
          observer.disconnect();
          clearTimeout(timer);
          clearTimeout(capTimer);
          resolve(ok);
        }
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      }),
    { quiet, cap },
  );
  if (!settled) info.annotations.push({ type: "warning", description: `the page kept changing for ${cap}ms; measured anyway` });
}

export async function visit(page: Page, origin: string, target: Target, info: TestInfo) {
  const { engine, viewport } = info.project.metadata as { engine: Engine; viewport: Viewport };
  // Nothing from the network: web fonts and third-party assets would make layout depend on the
  // network. Pages fall back to the system font stack, the same in every run.
  await page.route((url) => !LOCAL.test(url.href) && !url.href.startsWith("data:"), (route) => route.abort());
  if (viewport.textZoom) await zoomText(page);

  const response = await page.goto(origin + target.url, { waitUntil: "load" });
  expect(response?.status(), `${target.id} answered ${response?.status()}`).toBeLessThan(400);
  if (target.kind === "story") {
    await page.locator("#storybook-root > *, #storybook-docs > *").first().waitFor({ timeout: 15_000 });
  } else {
    await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 15_000 });
    // The page asked for, not a redirect or the error screen (which would pass every check).
    const landed = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
    const asked = target.url.replace(/\/+$/, "") || "/";
    if (!target.redirects) expect(landed, `${target.id} redirected`).toBe(asked);
    expect(ERROR_SCREEN.test(await page.locator("body").innerText()), `${target.id} shows the error screen`).toBe(false);
  }
  await domSettled(page, info);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));

  const findings = await checkPage(page, { viewport, skipMeta: target.kind === "story" || info.project.name !== META_PROJECT });
  const where = { page: target.id, viewport: viewport.name, engine };
  const { failing, allowed, notes } = applyAllow(ALLOW, findings, where);

  mkdirSync(RESULTS_DIR, { recursive: true });
  appendFileSync(
    findingsLog(info.parallelIndex),
    `${JSON.stringify({ ...where, project: info.project.name, failing, notes, allowed: allowed.map((a) => ALLOW.indexOf(a.entry)) })}\n`,
  );
  for (const note of notes) info.annotations.push({ type: "note", description: formatFinding(note) });
  if (failing.length) await info.attach("findings.json", { body: JSON.stringify(failing, null, 2), contentType: "application/json" });
  // Every failing finding is in the attachment; the message lists the first 15.
  const shown = failing.slice(0, 15).map(formatFinding);
  if (failing.length > 15) shown.push(`…and ${failing.length - 15} more (findings.json)`);
  expect(shown, `${target.id} at ${viewport.name} in ${engine}`).toEqual([]);
}
