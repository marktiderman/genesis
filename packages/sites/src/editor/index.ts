/**
 * @marktiderman/genesis-sites/editor: the visual editor.
 *
 * `<SiteEditor siteId store brand />` edits a site's pages in Puck with a
 * canvas drawn by the sections' own renderers, autosaves drafts by
 * compare-and-swap, and checks before it publishes. Puck is this package's
 * dependency: an app imports everything from here, never from
 * `@puckeditor/core`. Published pages (`/web`) never load this module.
 *
 * Importing it registers the built-in sections. Puck injects its own styles.
 *
 * @packageDocumentation
 */
import "../sections/index";

export { SiteEditor, type SiteEditorProps } from "./site-editor";
export { createEditorConfig, type CanvasMetadata, type ComponentInfo, type EditorConfig, type EditorConfigOptions } from "./config";
export { sectionFields, humanize, type SectionFields } from "./fields";
export {
  NODE_KEYS,
  countTypes,
  fromEditorData,
  h1SectionId,
  itemToNode,
  nodeToItem,
  placeholderSnapshot,
  presetComponentName,
  pruneEmpty,
  safeSectionId,
  sectionTypeOf,
  toEditorData,
  type EditorData,
  type EditorRootProps,
  type FromEditorResult,
  type PuckItem,
} from "./data";
export { Autosaver, AutosaveBlockedError, type AutosaveState, type AutosaveStatus, type AutosaverOptions } from "./autosave";
export { checkSite, movePageInList, pageTemplates, pathProblems, publishSite, renamePage, slugify, type EditorSiteStore, type PageTemplate, type SiteCheck } from "./site-actions";
export { renderPreview, type PreviewInput, type PreviewResult } from "./preview";
export { AssetPicker, IMAGE_TYPES, uploadProblem, type AssetPickerProps } from "./asset-picker";
export type { EditorAssets, PickedImage } from "./services";
export { genesisOverrides } from "./overrides";

// What an app needs of Puck to extend the editor, so it never imports Puck itself.
export { usePuck, createUsePuck, type Config as PuckConfig, type Data as PuckData, type Overrides as PuckOverrides } from "@puckeditor/core";
