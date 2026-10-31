/**
 * The font files this package serves itself.
 *
 * The list moved to genesis-design-system (`@marktiderman/genesis-design-system/fonts`)
 * so design systems can read each font's class. The files are still built
 * here: `scripts/build-assets.mjs` bundles this module, reads the list
 * through it, and copies each weight's latin woff2 from its `@fontsource/*`
 * package (a devDependency of this package). A new family needs both: an
 * entry in design-system's list, and its `@fontsource` package here.
 *
 * Each family is under the SIL Open Font License 1.1; the build keeps each
 * licence beside the files (`dist/assets/fonts/LICENSES.txt`).
 */
export { LATIN_UNICODE_RANGE, SELF_HOSTED_FONTS, fontFileKey, type SelfHostedFont } from "@marktiderman/genesis-design-system/fonts";
