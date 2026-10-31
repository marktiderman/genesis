/**
 * @marktiderman/genesis-media/uploads: resumable, checksummed uploads (ADR
 * 0012, primitive 4). This entry holds what the server and every client
 * share: the protocol's shapes, the part plan, and the digests.
 *
 * - The server: `@marktiderman/genesis-media/uploads/server`.
 * - Storage targets: `@marktiderman/genesis-media/uploads/targets`.
 *
 * @packageDocumentation
 */
export {
  MAX_PARTS,
  SHA256_HEX,
  choosePartSize,
  formatContentDigest,
  parseContentDigest,
  partPlan,
  toBase64,
  toHex,
  type CreateUploadBody,
  type FailedTarget,
  type FinalizeBody,
  type UploadCopy,
  type UploadError,
  type UploadErrorCode,
  type UploadOwner,
  type UploadPart,
  type UploadSkipped,
  type UploadState,
  type UploadStatus,
} from "./protocol";
export { createNobleSha256, createSha256, sha256Bytes, sha256Stream, type CreateSha256, type Sha256 } from "./hash";
