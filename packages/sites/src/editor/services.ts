/**
 * What the editor's fields reach for that isn't in Puck's props: the store
 * and site (for uploads), the asset library, and the image picker. Provided
 * by `SiteEditor`; a field rendered outside it says so.
 */
import { createContext, useContext } from "react";
import type { Asset, AssetMeta, SiteStore } from "../core/store";

/** The host's asset library, beside the store's `putAsset` uploads. */
export interface EditorAssets {
  /** The images and files a site already has (shown in the picker's Library). */
  list?: (siteId: string) => Promise<Asset[]>;
  /** Upload, instead of the store's `putAsset` (for a host that stores files elsewhere). */
  upload?: (siteId: string, file: File, meta: AssetMeta) => Promise<Asset>;
  /** The largest upload, in bytes. Default 10 MB. */
  maxBytes?: number;
}

export interface PickedImage {
  src: string;
  alt: string;
  decorative?: boolean;
  width?: number;
  height?: number;
}

export interface EditorServices {
  siteId: string;
  store: Pick<SiteStore, "putAsset">;
  assets?: EditorAssets;
  /** Open the image picker; resolves with the choice, or null when cancelled. */
  pickImage(options?: { current?: PickedImage }): Promise<PickedImage | null>;
}

export const EditorServicesContext = createContext<EditorServices | null>(null);

export function useEditorServices(): EditorServices {
  const services = useContext(EditorServicesContext);
  if (!services) throw new Error("genesis-sites/editor: a field was rendered outside <SiteEditor>.");
  return services;
}
