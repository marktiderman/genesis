/**
 * The check-in's photo question: forms-native's `photos` seam (`PhotoHost`) over
 * expo-image-picker. The picker is passed in, so this file loads in tests without the native
 * module; `check-in.ts` hands it the real one.
 *
 * The upload `check-in.ts` passes is a stub, like the check-in's `send`: the photo stays on the
 * phone and the answer keeps a reference to it. Point it at your storage (a Supabase Storage
 * bucket under RLS, say) and resolve to the stored file's id; then declare "photos or videos" in
 * the privacy manifest (genesis.config.json `privacy.collects`).
 */
import type { PhotoRef } from "@marktiderman/genesis-forms";
import type { NativePhotoFile, PhotoHost } from "@marktiderman/genesis-forms-native";

/** The parts of an expo-image-picker asset the host reads. */
export interface PickedAsset {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string;
}

export type PickResult = { canceled: true; assets: null } | { canceled: false; assets: PickedAsset[] };

/** `launchImageLibraryAsync` from expo-image-picker, or a stand-in. */
export type LaunchLibrary = (options: {
  mediaTypes: ["images"];
  allowsMultipleSelection: boolean;
  selectionLimit: number;
  quality: number;
}) => Promise<PickResult>;

const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
};

/** A picked asset as the form's file, with a name and a MIME type even when the picker gives none. */
export function photoFile(asset: PickedAsset, index: number): NativePhotoFile {
  const fromUri = asset.uri.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const name = asset.fileName || fromUri || `photo-${index + 1}.jpg`;
  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  return { uri: asset.uri, name, type: asset.mimeType || EXTENSION_TYPES[extension] || "image/jpeg", size: asset.fileSize ?? 0 };
}

/** The photo host: the photo library (no camera, so no camera permission) and `upload`. */
export function createCheckInPhotos(launch: LaunchLibrary, upload: (file: NativePhotoFile) => Promise<PhotoRef>): PhotoHost {
  return {
    camera: false,
    async pick(_field, { max }) {
      if (max <= 0) return [];
      // A quality below 1 re-encodes as JPEG, so a HEIC library photo arrives as a type the form takes.
      const result = await launch({ mediaTypes: ["images"], allowsMultipleSelection: max > 1, selectionLimit: max, quality: 0.8 });
      if (result.canceled) return [];
      return result.assets.slice(0, max).map(photoFile);
    },
    upload: (file) => upload(file),
  };
}

/** The stub upload: the photo stays on the phone and the answer keeps a reference to it. */
export function stubUpload(makeId: () => string): (file: NativePhotoFile) => Promise<PhotoRef> {
  return async (file) => ({ id: `local-${makeId()}`, name: file.name, type: file.type, size: file.size });
}
