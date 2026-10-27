/**
 * @marktiderman/genesis-extension: the parts every Genesis Chrome extension
 * needs, for the service worker, content scripts and extension pages.
 * React pieces are in `/react`; a Chrome fake for tests is in `/testing`.
 */
export { getChrome } from "./chrome";
export type {
  ChromeLike,
  MessageSender,
  Port,
  StorageArea,
  Tab,
} from "./chrome";
export {
  broadcast,
  createRouter,
  isFromContentScript,
  isFromExtensionPage,
  request,
} from "./messaging";
export type {
  ContentContext,
  Handler,
  Message,
  PageContext,
  Router,
} from "./messaging";
export { createPrefs } from "./prefs";
export type { Prefs } from "./prefs";
export { connectSurface, openSurface, syncSidePanel } from "./surfaces";
export type { OpenSurfaceOptions, Surface, SurfaceMode } from "./surfaces";
export { showPageBar } from "./page-bar";
export type {
  PageBarAction,
  PageBarChip,
  PageBarIcon,
  PageBarModel,
} from "./page-bar";
export { pingNativeHost, startNativeJob } from "./native";
export type { NativeJob, NativeJobOptions } from "./native";
export { commandKeys, isMac, shortcutKeys } from "./keys";
