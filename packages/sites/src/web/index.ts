/**
 * @marktiderman/genesis-sites/web: the renderer and the request handler.
 * Imports the built-in sections. Never imports an editor.
 *
 * @packageDocumentation
 */
export { ASSETS_PREFIX, handleSiteRequest, renderSitePageToString, type SiteRequestOptions } from "./handler";
export { SiteRenderer, collectFormSlugs, fontFaces, pageStyleText, type SiteAssets, type SiteRendererProps } from "./document";
export { ASSET_SIZES, FONT_FILES } from "./assets.generated";
