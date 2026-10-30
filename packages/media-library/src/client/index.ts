/**
 * @marktiderman/genesis-media-library/client: the upload client, one core for
 * browser, React Native and Node.
 *
 * - `createUploader({ endpoint, headers?, hash?, resumeStore?, filesAtOnce?, partsAtOnce?, bytesPerSecond? })`:
 *   `upload(source, { name, contentType, purpose, hashFirst?, priority?, onProgress? })` gives a
 *   handle with `done`, `pause`, `resume` and `cancel`.
 * - Sources: `fromBlob` (a browser `File`), `fromFileHandle` (expo-file-system, `node:fs`), `fromBytes`.
 * - `createIndexedDbResumeStore`, `createMemoryResumeStore`; `createWorkerFileHasher`. Under
 *   the `browser` condition this entry hashes in the package's own Web Worker by default.
 * - `createSupabaseTusTransport`: Supabase Storage's TUS endpoint, a separate in-order transport.
 *
 * @packageDocumentation
 */
export {
  UploadClientError,
  createUploader,
  type UploadHandle,
  type UploadOptions,
  type UploadPriority,
  type UploadProgress,
  type UploadResult,
  type Uploader,
  type UploaderOptions,
} from "./uploader";
export { fromBlob, fromBytes, fromFileHandle, type ReadableFileHandle, type UploadSource } from "./sources";
export { createIndexedDbResumeStore, createMemoryResumeStore, createSpeedLimiter, type ResumeStore } from "./config";
export { createWorkerFileHasher, isBrowserPage, type WorkerLike } from "./worker-hasher";
export { hashBlob, type HashReply, type HashRequest } from "./hash-core";
export {
  TUS_CHUNK_BYTES,
  TusError,
  base64Utf8,
  createSupabaseTusTransport,
  type SupabaseTusOptions,
  type TusFailure,
  type TusRecord,
  type TusSource,
} from "./supabase-tus";
