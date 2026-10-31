/**
 * @marktiderman/genesis-media/uploads/server: the upload protocol's server
 * half. Fetch and WebCrypto (Node 20+ and Workers).
 *
 * - `createUploadHandler({ store, targets, owner, authorize, keyFor, readable?, enqueueVerify? })`:
 *   the route, `(request) => Promise<Response>`.
 * - `createUploadVerifyJob` and `UPLOAD_VERIFY_JOB`: the read-back as a
 *   genesis_jobs job; `sweepExpiredUploads` and `UPLOAD_SWEEP_JOB` for lapsed sessions.
 * - `UploadSessionStore`, with `createSupabaseSessionStore` (the default, a
 *   table with RLS on the owner) and `createMemorySessionStore` for tests.
 *
 * Storage targets are in `@marktiderman/genesis-media/uploads/targets`.
 *
 * @packageDocumentation
 */
export {
  createUploadHandler,
  isSafeKey,
  safeName,
  type ReadableObject,
  type UploadAuthorizeContext,
  type UploadDecision,
  type UploadHandlerOptions,
  type UploadOperation,
} from "./handler";
export {
  UPLOAD_SWEEP_JOB,
  UPLOAD_VERIFY_JOB,
  createUploadVerifyJob,
  discardUnverified,
  isStuckVerifying,
  sweepExpiredUploads,
  verifyUpload,
  type UploadVerifyOptions,
  type VerifyRun,
} from "./verify";
export {
  SessionConflictError,
  SessionNotOpenError,
  createMemorySessionStore,
  type PartReservation,
  type StoredPart,
  type UploadSession,
  type UploadSessionPatch,
  type UploadSessionStore,
} from "./store";
export { SessionStoreError, createSupabaseSessionStore, type SessionStoreClient } from "./supabase-store";
