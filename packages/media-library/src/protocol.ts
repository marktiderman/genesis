/**
 * The upload protocol's shapes, shared by the server handler and the
 * clients: the JSON of each message, the part plan, and the digests. See
 * docs/media-library-uploads.md for the protocol itself.
 */

/** Who an upload is for, as the app's auth names it: a person, a service, a form respondent. */
export interface UploadOwner {
  kind: string;
  id: string;
}

/**
 * An upload's state. `open` takes parts; `verifying` is reading the copies
 * back; `done`, `partial` and `identity_mismatch` are what verification
 * found. (A skip never makes a session.)
 */
export type UploadState = "open" | "verifying" | "done" | "partial" | "identity_mismatch";

/** `POST /uploads`. */
export interface CreateUploadBody {
  /** The file's name on the client's device (for the app's records; never a storage key). */
  name: string;
  contentType: string;
  /** The whole object's size in bytes. */
  size: number;
  /**
   * The whole object's SHA-256, lowercase hex. Optional: without it there's
   * no skip check, and it must be given at finalize instead.
   */
  sha256?: string | undefined;
  /** The app's word for what the upload is for (`avatar`, `media`, `form-answer`). */
  purpose: string;
  /** Target names the app configured. Default: the app's choice for the purpose. */
  targets?: string[] | undefined;
  /**
   * An id the client chose (22 random base64url characters), so a create it
   * has to retry (the answer was lost) finds the session the first try made
   * instead of leaving it behind.
   */
  uploadId?: string | undefined;
}

/** `POST /uploads/:id/finalize`. */
export interface FinalizeBody {
  /** Required when create had none; must match when it had one. */
  sha256?: string | undefined;
}

/** One received part, as the server has it. */
export interface UploadPart {
  n: number;
  size: number;
  /** `sha-256=:<base64>:`, as it arrived in `content-digest`. */
  digest: string;
}

/** One verified copy: what a media value records in `copies[]`. */
export interface UploadCopy {
  target: string;
  /** Its target's tier: `working`, `archive` or `cold`. */
  tier: "working" | "archive" | "cold";
  key: string;
  size: number;
  sha256: string;
  lockMode?: "GOVERNANCE" | "COMPLIANCE" | undefined;
  /** ISO 8601. */
  lockedUntil?: string | undefined;
  /** ISO 8601. */
  verifiedAt: string;
}

/** A target that didn't verify, and why. */
export interface FailedTarget {
  target: string;
  code: "readback_mismatch" | "target_error" | "missing";
}

/** The answer to Create (a new or resumed session), Resume and Finalize. */
export interface UploadStatus {
  uploadId: string;
  state: UploadState;
  size: number;
  sha256?: string | undefined;
  partSize: number;
  parts: UploadPart[];
  targets: string[];
  /** ISO 8601: when an open session lapses without another part. */
  expiresAt: string;
  copies?: UploadCopy[] | undefined;
  failed?: FailedTarget[] | undefined;
  /** On Create: this owner already had this session open. */
  resumed?: boolean | undefined;
}

/** The answer to a Create that found an identical object the caller can read. */
export interface UploadSkipped {
  state: "skipped";
  copies: UploadCopy[];
  /** What the app's `readable` returned for it (a media value id, say). */
  ref?: string | undefined;
}

/** Every refusal: words safe to show the person, and a code for the client. */
export interface UploadError {
  error: string;
  code: UploadErrorCode;
  /** For `missing_parts`: the parts to send. */
  parts?: number[] | undefined;
}

export type UploadErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "too_large"
  | "unsupported_type"
  | "part_size"
  | "digest_mismatch"
  | "digest_required"
  | "part_conflict"
  | "missing_parts"
  | "sha256_required"
  | "identity_mismatch"
  | "finalized"
  | "method_not_allowed"
  | "server_error";

/** How many parts a file of `size` has at `partSize`, and each one's size. */
export function partPlan(size: number, partSize: number): { count: number; sizeOf(n: number): number } {
  const count = size === 0 ? 1 : Math.ceil(size / partSize);
  return {
    count,
    sizeOf: (n) => (n < count ? partSize : size - partSize * (count - 1)),
  };
}

/** S3's limit, and every part protocol's: at most 10,000 parts. */
export const MAX_PARTS = 10_000;
const MiB = 1024 * 1024;

/**
 * The part size for a file: at least `min`, large enough to keep the count
 * at or under `MAX_PARTS`, rounded up to a whole MiB once it passes `min`,
 * and never more than `max` (then the file is too big: undefined).
 */
export function choosePartSize(size: number, limits: { min: number; max: number }): number | undefined {
  let partSize = Math.max(limits.min, Math.ceil(size / MAX_PARTS));
  if (partSize > limits.min) partSize = Math.ceil(partSize / MiB) * MiB;
  return partSize <= limits.max ? partSize : undefined;
}

export const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Bytes as standard base64. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/** Bytes as lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, "0");
  return s;
}

/** A `content-digest` value for a SHA-256 (RFC 9530): `sha-256=:<base64>:`. */
export function formatContentDigest(sha256: Uint8Array): string {
  return `sha-256=:${toBase64(sha256)}:`;
}

/** The SHA-256 a `content-digest` header carries, as base64, or undefined (no sha-256 member, or malformed). */
export function parseContentDigest(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const member of header.split(",")) {
    const m = /^\s*sha-256\s*=\s*:([A-Za-z0-9+/]{43}=):\s*$/i.exec(member);
    if (m) return m[1];
  }
  return undefined;
}
