/**
 * The editor's view of the real output: the `/web` request handler, run in
 * the browser, renders a page of the drafts (`preview`) or of the live
 * release (`live`) exactly as a visitor gets it. Its stylesheet is inlined
 * so the HTML works as an iframe's `srcdoc`, and its script is left out:
 * the frame is sandboxed with no script and no same-origin access, so
 * nothing an editor typed can run with the editor's privileges.
 *
 * The renderer and its assets load on demand (a separate chunk), so opening
 * the editor doesn't download them until a preview or the canvas needs them.
 */
import type { FormsResolver } from "../core/forms";
import type { SiteStore } from "../core/store";
import type { BrandInput } from "../core/theme";

/** The site stylesheet (every section's classes), for the canvas frame. */
export async function loadSiteCss(): Promise<string> {
  const { ASSETS } = await import("../web/assets.generated");
  return ASSETS.css.body;
}

/** CSS text that can sit inside a `<style>` element. */
export const styleText = (css: string) => css.replace(/<\/style/gi, "<\\/style");

export interface PreviewInput {
  store: Pick<SiteStore, "getLive" | "getDraft" | "listPages" | "getPageDraft">;
  siteId: string;
  brand: BrandInput;
  path: string;
  mode: "preview" | "live";
  forms?: FormsResolver;
}

export interface PreviewResult {
  status: number;
  /** The page as a self-contained document, or null when the address redirects or isn't the site's. */
  html: string | null;
  /** Where a redirect goes. */
  location?: string;
}

/**
 * One page through `handleSiteRequest`, as an iframe-ready document.
 *
 * @stability Beta
 */
export async function renderPreview(input: PreviewInput): Promise<PreviewResult> {
  const [{ renderSitePageToString }, { ASSETS }] = await Promise.all([import("../web/handler"), import("../web/assets.generated")]);
  const result = await renderSitePageToString(new Request(`https://preview.invalid${input.path}`), {
    store: input.store,
    brand: { getBrand: () => input.brand },
    siteId: input.siteId,
    mode: input.mode,
    unknownPath: "not-found",
    csp: false,
    ...(input.forms ? { forms: input.forms } : {}),
  });
  if (!result) return { status: 404, html: null };
  if (result.status >= 300 && result.status < 400) return { status: result.status, html: null, location: result.headers.get("location") ?? "" };
  const css = `<style data-gs-inlined="">${styleText(ASSETS.css.body)}</style>`;
  const formsCss = `<style data-gs-inlined="">${styleText(ASSETS.formsCss.body)}</style>`;
  const html = result.html
    .replace(/<link rel="stylesheet" href="[^"]*\/_gs\/([^"]+)"\/>/g, (_m, name: string) => (name === ASSETS.css.name ? css : name === ASSETS.formsCss.name ? formsCss : ""))
    .replace(/<script type="module" src="[^"]*\/_gs\/[^"]*"><\/script>/g, "");
  return { status: result.status, html };
}
