/**
 * The `figma-routes` rule: `genesis figma:routes` as a doctor check. It runs only when the app's
 * genesis.config.json has a `figma` block, and never fails a run: coverage gaps are `info`
 * (`warn` under --strict), and a missing token or an unreachable API is one `info` notice.
 */
import { checkFigmaRoutes, coverageFindings, FigmaConfigError, readFigmaConfig } from "../figma/routes.js";
import type { DoctorContext } from "./types.js";

export async function checkFigmaRoutesRule(ctx: DoctorContext): Promise<void> {
  let config;
  try {
    config = readFigmaConfig(ctx.root);
  } catch (err) {
    if (!(err instanceof FigmaConfigError)) throw err;
    ctx.report({ rule: "figma-routes", level: "warn", file: "genesis.config.json", message: err.message });
    return;
  }
  if (!config) return;
  if (!process.env.FIGMA_ACCESS_TOKEN) {
    ctx.report({ rule: "figma-routes", level: "info", file: "genesis.config.json", message: "skipped: FIGMA_ACCESS_TOKEN isn't set (CI sets it from a secret)" });
    return;
  }
  try {
    const report = await checkFigmaRoutes({ root: ctx.root, config });
    for (const f of coverageFindings(report, ctx.strict ?? false)) ctx.report({ rule: "figma-routes", ...f });
  } catch (err) {
    ctx.report({ rule: "figma-routes", level: "info", file: "genesis.config.json", message: `skipped: ${(err as Error).message}` });
  }
}
