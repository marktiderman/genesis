/**
 * @marktiderman/genesis-media-library/compat: the JSON of the signed
 * single-upload handshake genesis-forms has used (one signed PUT per file),
 * kept so browsers already speaking it keep working while forms moves onto
 * the resumable protocol. New code uses the protocol in `.` and `/client`.
 *
 * @packageDocumentation
 */

/**
 * What the browser POSTs (`content-type: application/json`, at most
 * `MAX_SIGNED_UPLOAD_REQUEST_BYTES`). Exactly one of `attemptId` (a new
 * response: the visit's attempt id, a UUID) and `edit` (an edit link's token,
 * while changing a sent response).
 *
 * @deprecated Use the resumable protocol (`CreateUploadBody`); kept for browsers already in use.
 */
export interface SignedUploadRequest {
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
 * `uploadToSignedUrl`); a store that signs a plain URL sets `url`.
 *
 * @deprecated See `SignedUploadRequest`.
 */
export interface SignedUpload {
  path: string;
  token: string;
  bucket?: string | undefined;
  url?: string | undefined;
}

/** 200: the reference the answer keeps, and where to send the bytes. @deprecated See `SignedUploadRequest`. */
export interface SignedUploadGrant<Ref = unknown> {
  ref: Ref;
  upload: SignedUpload;
}

/**
 * Any other status: words to show, and for some a `code`: `closed` (409),
 * `bad_link` (403) or `too_many_photos` (429).
 *
 * @deprecated See `SignedUploadRequest`.
 */
export interface SignedUploadRefusal {
  error: string;
  code?: string | undefined;
}

/** The longest signed-upload request body: a few fields of JSON. @deprecated See `SignedUploadRequest`. */
export const MAX_SIGNED_UPLOAD_REQUEST_BYTES = 4_000;
