/**
 * The upload handshake's JSON, shared by the server (`createUploadHandler` in
 * `/server`) and the browser (genesis-forms-web's `signedUploadHost`). A
 * respondent's browser asks the app's server for one signed upload per file,
 * then sends the bytes straight to storage with it; the answer keeps only the
 * reference the server handed back.
 *
 * These shapes now live in genesis-media-library (`/compat`), the one home for
 * uploads (ADR 0012); they are re-exported here under their old names so
 * nothing breaks (types only: the engine doesn't load media-library at run time). New upload
 * code uses media-library's resumable protocol.
 */
import type { SignedUploadGrant } from "@marktiderman/genesis-media-library/compat";
import type { PhotoRef } from "./photo";

export type {
  /** @deprecated Use `SignedUpload` from `@marktiderman/genesis-media-library/compat`. */
  SignedUpload,
  /** @deprecated Use `SignedUploadRefusal` from `@marktiderman/genesis-media-library/compat`. */
  SignedUploadRefusal as UploadRefusal,
  /** @deprecated Use `SignedUploadRequest` from `@marktiderman/genesis-media-library/compat`. */
  SignedUploadRequest as UploadRequest,
} from "@marktiderman/genesis-media-library/compat";

/**
 * 200: the reference the answer keeps, and where to send the bytes.
 *
 * @deprecated Use `SignedUploadGrant<PhotoRef>` from `@marktiderman/genesis-media-library/compat`.
 */
export type UploadGrant = SignedUploadGrant<PhotoRef>;

/**
 * The longest upload request body: a few fields of JSON. Kept here as a value (the shapes above
 * are types only), so the forms engine still loads with nothing else installed.
 *
 * @deprecated Use `MAX_SIGNED_UPLOAD_REQUEST_BYTES` from `@marktiderman/genesis-media-library/compat`.
 */
export const MAX_UPLOAD_REQUEST_BYTES = 4_000;
