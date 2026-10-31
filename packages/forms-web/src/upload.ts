import { createContext, useContext } from "react";
import type { UploadAdapter } from "@marktiderman/genesis-forms";

/**
 * Where a form's files go: genesis-forms' upload port (`UploadAdapter`) for
 * browser `File`s. The host stores each file (its own bucket, its own rules)
 * and resolves to a reference, which is all the answer keeps; a rejection is
 * shown under the field. `photo` fields read it. `signedUploadHost` is the
 * built-in one; any adapter of this shape fits.
 */
export type UploadHost = UploadAdapter<File>;

/** Provide it around `<Form>` (or pass `onUpload`) so `photo` fields can store files. */
export const UploadContext = createContext<UploadHost | null>(null);

/** The enclosing `UploadContext` value, or null when no host stores files. */
export function useUpload(): UploadHost | null {
  return useContext(UploadContext);
}

/** What `<Form>` asks while a file is on its way: it neither moves on nor sends until every one is done. */
export interface PendingUploads {
  /** Call when an upload starts; call the function it returns once it ends (it counts once). */
  start(): () => void;
  count(): number;
}

export const PendingUploadsContext = createContext<PendingUploads | null>(null);

/** A fresh counter of uploads in flight. */
export function createPendingUploads(): PendingUploads {
  let n = 0;
  return {
    start() {
      n++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        n--;
      };
    },
    count: () => n,
  };
}

/** Said when the respondent tries to move on or send while a photo is still uploading. */
export const UPLOAD_WAIT_MESSAGE = "Wait for the photo to finish uploading.";
