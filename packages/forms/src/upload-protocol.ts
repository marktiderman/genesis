/**
 * The upload handshake's JSON, shared by the server (`createUploadHandler` in
 * `/server`) and the browser (genesis-forms-web's `signedUploadHost`). A
 * respondent's browser asks the app's server for one signed upload per file,
 * then sends the bytes straight to storage with it; the answer keeps only the
 * reference the server handed back.
 *
 * Moved up from the host app's feedback photo uploads; the field names and
 * status codes are the ones it used, so its browsers and server keep talking.
 */
import type { PhotoRef } from "./photo";

/**
 * What the browser POSTs (`content-type: application/json`, at most
 * `MAX_UPLOAD_REQUEST_BYTES`). Exactly one of `attemptId` (a new response: the
 * visit's attempt id, a UUID) and `edit` (an edit link's token, while changing
 * a sent response).
 */
export interface UploadRequest {
  /** The upload field's id. */
  fieldId: string;
  /** The file's name on the respondent's device. */
  name: string;
  /** Its MIME type. */
  type: string;
  /** Bytes. */
  size: number;
  attemptId?: string | undefined;
  edit?: string | undefined;
}

/**
 * Where the browser sends the bytes, as the app's storage signed it. Supabase
 * Storage hands back `path` and `token` (with `bucket`, for
 * `uploadToSignedUrl`); a store that signs a plain URL sets `url`, which
 * `signedUploadHost` PUTs the file to when no `send` is given.
 */
export interface SignedUpload {
  path: string;
  token: string;
  bucket?: string | undefined;
  url?: string | undefined;
}

/** 200: the reference the answer keeps, and where to send the bytes. */
export interface UploadGrant {
  ref: PhotoRef;
  upload: SignedUpload;
}

/**
 * Any other status: words to show the respondent, and for some a `code`:
 * `closed` (409, an edit while the form takes no changes), `bad_link` (403, an
 * edit link that doesn't check out) or `too_many_photos` (429, the attempt or
 * edit has as many uploads as the store allows; the name the host app's
 * browsers already know, kept for every upload field type).
 */
export interface UploadRefusal {
  error: string;
  code?: string | undefined;
}

/** The longest upload request body: a few fields of JSON. */
export const MAX_UPLOAD_REQUEST_BYTES = 4_000;
