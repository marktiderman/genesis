/**
 * The upload port: what stores a file a respondent adds to an upload field
 * (`photo`) and resolves to its reference, which is all the answer keeps. The
 * engine stays storage-agnostic; the renderer uploads through whichever
 * adapter the host passes.
 *
 * The built-in one is genesis-forms-web's `signedUploadHost`: the signed
 * single upload this package's `createUploadHandler` serves. Any object with
 * this shape fits, so a host can opt into another store (genesis-media-library's
 * `/forms` adapter, for resumable, checksummed uploads) by passing it, with no
 * dependency from forms on it.
 */
import type { PhotoRef } from "./photo";
import type { FieldBlock } from "./types";

/** A file as an adapter is given it: a browser `File`, or a native picker's file with these. */
export interface UploadFile {
  readonly name: string;
  /** Its MIME type; may be empty when the device doesn't know it. */
  readonly type: string;
  /** Bytes. */
  readonly size: number;
}

/** @stability Experimental */
export interface UploadAdapter<F extends UploadFile = UploadFile> {
  /** Stores the file for this field; resolves to its reference. A rejection's message is shown under the field. */
  upload(file: F, field: FieldBlock): Promise<PhotoRef>;
  /** A link to read a stored file (the host's storage signs it), or null when it can't be read. */
  url?(ref: PhotoRef, field?: FieldBlock): Promise<string | null>;
}
