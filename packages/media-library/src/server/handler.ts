/**
 * The upload protocol's server half: one request handler for the route the
 * app mounts (`/uploads` by default). See docs/media-library-uploads.md.
 *
 *   POST   /uploads                   create (or skip, or resume an open session)
 *   GET    /uploads/:id               resume: the state and the parts the server has
 *   PUT    /uploads/:id/parts/:n      one part, with `content-digest: sha-256=:…:`
 *   POST   /uploads/:id/finalize      assemble, copy to the other targets, read back
 *   DELETE /uploads/:id               abort
 */
import { sha256Bytes } from "../hash";
import {
  SHA256_HEX,
  choosePartSize,
  parseContentDigest,
  partPlan,
  toBase64,
  type CreateUploadBody,
  type UploadCopy,
  type UploadError,
  type UploadErrorCode,
  type UploadOwner,
  type UploadSkipped,
  type UploadStatus,
} from "../protocol";
import type { UploadSession } from "./store";
import { verifyUpload, type UploadVerifyOptions } from "./verify";

/** The operation the app's rules are asked about. Every one of them is asked, every time. */
export type UploadOperation = "create" | "resume" | "part" | "finalize" | "abort";

/** What `authorize` is told. */
export interface UploadAuthorizeContext {
  op: UploadOperation;
  owner: UploadOwner;
  request: Request;
  purpose: string;
  name: string;
  contentType: string;
  size: number;
  /** The targets the client asked for (create), or the session's. */
  targets: string[];
  /** The session, for every operation after create. */
  upload?: UploadSession | undefined;
}

/**
 * The app's answer. On create, `targets` is the final set (narrowed from what
 * the client asked, or chosen when it asked for none).
 */
export type UploadDecision =
  | { allow: true; targets?: string[] | undefined }
  | { allow: false; status?: 403 | 413 | 415; error?: string | undefined };

/** An object the caller may already read, as the app's `readable` finds it. */
export interface ReadableObject {
  /** Its verified copies: a skip needs one, with this identity, in every target asked for. */
  copies: UploadCopy[];
  /** What the app wants a skip to return (a media value id, say). */
  ref?: string | undefined;
}

/** @stability Experimental */
export interface UploadHandlerOptions extends UploadVerifyOptions {
  /** Who is asking, from the request's credential, or null (401). A respondent without an account is an owner too. */
  owner: (request: Request) => UploadOwner | null | Promise<UploadOwner | null>;
  /** The app's rules, asked for every operation. */
  authorize: (context: UploadAuthorizeContext) => UploadDecision | Promise<UploadDecision>;
  /**
   * The storage key for a new upload. The client never names one: pass its
   * `name` through `safeName` if it goes in. A key with an empty, `.` or `..`
   * segment is refused.
   */
  keyFor: (context: { owner: UploadOwner; uploadId: string; purpose: string; name: string; contentType: string; size: number; sha256?: string | undefined }) => string | Promise<string>;
  /**
   * Objects with this identity the owner may already read, for
   * skip-if-identical. Only these are compared: a file someone else has is
   * never a match. Without it, nothing is skipped.
   */
  readable?: ((context: { owner: UploadOwner; purpose: string; size: number; sha256: string }) => Promise<ReadableObject[]>) | undefined;
  /**
   * Queues the read-back for a big upload (genesis-supabase's
   * `enqueueJob(admin, UPLOAD_VERIFY_JOB, { uploadId })`). Without it, every
   * upload verifies inline, which only suits a server with no time limit.
   */
  enqueueVerify?: ((uploadId: string) => Promise<void>) | undefined;
  /** Objects up to this size verify inline and finalize answers 200. Default 64 MiB. */
  verifyInlineBytes?: number | undefined;
  /** An open session lapses after this long without a part. Default 7 days. */
  sessionTtlSeconds?: number | undefined;
  /** The largest part this handler buffers. Default 32 MiB. */
  maxPartBytes?: number | undefined;
  /** The route's path. Default `/uploads`. */
  basePath?: string | undefined;
  /** Sees unexpected errors (a target down, a store failing); the client gets 500 or 503. */
  onError?: ((error: unknown, request: Request) => void) | undefined;
}

const MiB = 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{22}$/;
const PURPOSE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const MAX_JSON = 16 * 1024;

const WORDS: Record<UploadErrorCode, string> = {
  unauthenticated: "Sign in to upload.",
  forbidden: "You can't upload this.",
  not_found: "This upload doesn't exist or has expired.",
  bad_request: "The upload request isn't valid.",
  too_large: "The file is too large.",
  unsupported_type: "This kind of file can't be uploaded here.",
  part_size: "A part of the file is the wrong size.",
  digest_mismatch: "A part of the file arrived changed. It will be sent again.",
  digest_required: "Each part needs its SHA-256 (content-digest).",
  part_conflict: "A part was sent again with different contents. Start the upload again.",
  missing_parts: "Some parts of the file haven't arrived yet.",
  sha256_required: "The file's SHA-256 is needed to finish the upload.",
  identity_mismatch: "The file that arrived isn't the one described. Start the upload again.",
  finalized: "This upload is already finished.",
  method_not_allowed: "That isn't a method this route takes.",
  server_error: "The upload couldn't be stored just now. Try again.",
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function refuse(status: number, code: UploadErrorCode, extra: Partial<UploadError> = {}, error?: string): Response {
  return json(status, { error: error ?? WORDS[code], code, ...extra } satisfies UploadError);
}

/** The body, at most `max` bytes, or null when it is longer. Read as it streams, never buffered past the cap. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const bytes = await readCapped(request, MAX_JSON);
  if (!bytes) return null;
  if (bytes.byteLength === 0) return {};
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseCreate(body: Record<string, unknown> | null): CreateUploadBody | undefined {
  if (!body) return undefined;
  const { name, contentType, size, sha256, purpose, targets } = body;
  if (typeof name !== "string" || name.length === 0 || name.length > 1024) return undefined;
  if (typeof contentType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) return undefined;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) return undefined;
  if (sha256 !== undefined && (typeof sha256 !== "string" || !SHA256_HEX.test(sha256))) return undefined;
  if (typeof purpose !== "string" || !PURPOSE.test(purpose)) return undefined;
  if (targets !== undefined && (!Array.isArray(targets) || targets.length === 0 || targets.length > 8 || !targets.every((t) => typeof t === "string"))) return undefined;
  return { name, contentType, size, sha256, purpose, targets: targets as string[] | undefined };
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function statusOf(s: UploadSession, extra: Partial<UploadStatus> = {}): UploadStatus {
  return {
    uploadId: s.id,
    state: s.state,
    size: s.size,
    ...(s.sha256 ? { sha256: s.sha256 } : {}),
    partSize: s.partSize,
    parts: s.parts.map(({ n, size, digest }) => ({ n, size, digest })),
    targets: s.targets,
    expiresAt: s.expiresAt,
    ...(s.state === "open" || s.state === "verifying" ? {} : { copies: s.copies }),
    ...(s.failed.length ? { failed: s.failed } : {}),
    ...extra,
  };
}

const sameOwner = (a: UploadOwner, b: UploadOwner) => a.kind === b.kind && a.id === b.id;

/** A storage key every store keeps as it is: no empty, `.` or `..` segment, no control character. */
export function isSafeKey(key: string): boolean {
  return key.length > 0 && key.length <= 1024 && !/[\x00-\x1f\x7f]/.test(key) && key.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** A file name made safe for a storage key: one segment, no path, no control characters. For `keyFor`. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "file" : cleaned.slice(0, 200);
}

/**
 * The upload route: `(request) => Promise<Response>`. Every operation is
 * bound to the owner that created the upload and asked of `authorize` again;
 * another owner's upload, an unknown id and a lapsed session are the same
 * 404.
 *
 * ```ts
 * const handle = createUploadHandler({
 *   store: createSupabaseSessionStore(admin),
 *   targets: { working: createR2Target(env.BUCKET), archive: createS3Target({ …, objectLock: { mode: "COMPLIANCE", days: 3650 } }) },
 *   owner: async (request) => { const user = await userFrom(request); return user && { kind: "person", id: user.id }; },
 *   authorize: ({ op, owner, purpose, size }) => ({ allow: purpose === "media" && size <= 100 * 2 ** 30, targets: ["working", "archive"] }),
 *   keyFor: ({ owner, uploadId, name }) => `media/${owner.id}/${uploadId}/${safeName(name)}`,
 *   readable: ({ owner, sha256, size }) => findMyMediaWithIdentity(owner, sha256, size),
 *   enqueueVerify: (uploadId) => enqueueJob(admin, UPLOAD_VERIFY_JOB, { uploadId }).then(() => {}),
 * });
 * ```
 *
 * @stability Experimental
 */
export function createUploadHandler(options: UploadHandlerOptions): (request: Request) => Promise<Response> {
  const { store, targets } = options;
  const now = options.now ?? Date.now;
  const base = (options.basePath ?? "/uploads").replace(/\/+$/, "");
  const inlineBytes = options.verifyInlineBytes ?? 64 * MiB;
  const ttlMs = (options.sessionTtlSeconds ?? 7 * 86_400) * 1000;
  const maxPartBytes = options.maxPartBytes ?? 32 * MiB;
  const expiresAt = () => new Date(now() + ttlMs).toISOString();

  /** The owner's session, or a 404 for anything else. Then the app's rules, for this operation. */
  async function load(request: Request, owner: UploadOwner, id: string, op: UploadOperation): Promise<UploadSession | Response> {
    const s = ID.test(id) ? await store.get(id) : null;
    if (!s || !sameOwner(s.owner, owner) || (s.state === "open" && Date.parse(s.expiresAt) <= now())) return refuse(404, "not_found");
    const decision = await options.authorize({ op, owner, request, purpose: s.purpose, name: s.name, contentType: s.contentType, size: s.size, targets: s.targets, upload: s });
    if (!decision.allow) return refuse(decision.status ?? 403, decision.status === 413 ? "too_large" : decision.status === 415 ? "unsupported_type" : "forbidden", {}, decision.error);
    return s;
  }

  async function create(request: Request, owner: UploadOwner): Promise<Response> {
    const body = parseCreate(await readJson(request));
    if (!body) return refuse(422, "bad_request");
    const asked = body.targets ?? [];
    const decision = await options.authorize({ op: "create", owner, request, purpose: body.purpose, name: body.name, contentType: body.contentType, size: body.size, targets: asked });
    if (!decision.allow) return refuse(decision.status ?? 403, decision.status === 413 ? "too_large" : decision.status === 415 ? "unsupported_type" : "forbidden", {}, decision.error);
    // The app may narrow what was asked for, or choose when nothing was; it never widens past the request.
    const chosen = asked.length ? asked.filter((t) => !decision.targets || decision.targets.includes(t)) : (decision.targets ?? Object.keys(targets).slice(0, 1));
    const set = [...new Set(chosen)];
    if (set.length === 0 || !set.every((t) => Object.hasOwn(targets, t))) return refuse(422, "bad_request", {}, "No storage target is available for this upload.");
    const primary = targets[set[0]!]!;
    const partSize = choosePartSize(body.size, { min: primary.minPart, max: Math.min(primary.maxPart, maxPartBytes) });
    if (partSize === undefined) return refuse(413, "too_large");

    if (body.sha256) {
      // Skip only within what this owner may already read, and only on the whole object's identity.
      const sha256 = body.sha256;
      const candidates = options.readable ? await options.readable({ owner, purpose: body.purpose, size: body.size, sha256 }) : [];
      for (const object of candidates) {
        const copies = set.map((t) => object.copies.find((c) => c.target === t && c.sha256 === sha256 && c.size === body.size));
        if (copies.every((c): c is UploadCopy => c !== undefined)) {
          return json(200, { state: "skipped", copies, ...(object.ref ? { ref: object.ref } : {}) } satisfies UploadSkipped);
        }
      }
      const open = await store.findOpen({ owner, purpose: body.purpose, size: body.size, sha256, targets: set });
      if (open && Date.parse(open.expiresAt) > now()) return json(200, statusOf(open, { resumed: true }));
    }

    const id = randomId();
    const key = await options.keyFor({ owner, uploadId: id, purpose: body.purpose, name: body.name, contentType: body.contentType, size: body.size, sha256: body.sha256 });
    // A key a URL would rewrite (an empty, "." or ".." segment) would store the object somewhere else.
    if (!isSafeKey(key)) throw new Error(`keyFor returned an unsafe storage key (${JSON.stringify(key)}): no empty, "." or ".." segments, no leading slash.`);
    const targetUploadId = await primary.start(key, { contentType: body.contentType });
    const session: UploadSession = {
      id,
      owner,
      purpose: body.purpose,
      name: body.name,
      contentType: body.contentType,
      size: body.size,
      ...(body.sha256 ? { sha256: body.sha256 } : {}),
      partSize,
      key,
      targets: set,
      targetUploadId,
      state: "open",
      parts: [],
      copies: [],
      failed: [],
      createdAt: new Date(now()).toISOString(),
      expiresAt: expiresAt(),
    };
    await store.insert(session);
    return json(201, statusOf(session));
  }

  async function part(request: Request, s: UploadSession, nText: string): Promise<Response> {
    if (s.state !== "open") return refuse(410, "finalized");
    const plan = partPlan(s.size, s.partSize);
    const n = /^[1-9]\d{0,4}$/.test(nText) ? Number(nText) : 0;
    if (n < 1 || n > plan.count) return refuse(409, "part_size", {}, `There is no part ${nText} in this upload.`);
    const expected = plan.sizeOf(n);
    const declared = request.headers.get("content-length");
    if (declared !== null && Number(declared) !== expected) return Number(declared) > s.partSize ? refuse(413, "too_large") : refuse(409, "part_size");
    const digest = parseContentDigest(request.headers.get("content-digest"));
    if (!digest) return refuse(400, "digest_required");
    const had = s.parts.find((p) => p.n === n);
    if (had) {
      await request.body?.cancel().catch(() => {});
      // The same bytes again: nothing to do. Other bytes: refused, the first part stands.
      return had.digest === formatContentDigestB64(digest) ? json(200, { n, size: had.size, digest: had.digest }) : refuse(409, "part_conflict");
    }
    const bytes = await readCapped(request, expected);
    if (!bytes) return refuse(413, "too_large");
    if (bytes.byteLength !== expected) return refuse(409, "part_size");
    if (toBase64(await sha256Bytes(bytes)) !== digest) return refuse(422, "digest_mismatch");
    const receipt = await targets[s.targets[0]!]!.part(s.key, s.targetUploadId, n, bytes);
    const stored = { n, size: bytes.byteLength, digest: formatContentDigestB64(digest), etag: receipt.etag };
    // "same" (another request sent these bytes meanwhile) also takes this write's etag: the target
    // keeps the last write of a part, and finish must name it.
    const result = await store.addPart(s.id, stored);
    if (result === "conflict") return refuse(409, "part_conflict");
    await store.update(s.id, { expiresAt: expiresAt() }, ["open"]);
    return json(200, { n, size: stored.size, digest: stored.digest });
  }

  /** Verifies inline (small, or no queue) or queues it (202), and answers with what that gives. */
  async function verify(s: UploadSession): Promise<Response> {
    if (s.size > inlineBytes && options.enqueueVerify) {
      await options.enqueueVerify(s.id);
      return json(202, statusOf({ ...s, state: "verifying" }));
    }
    const after = await verifyUpload(s.id, { store, targets, now });
    if (!after) return refuse(404, "not_found");
    if (after.state === "identity_mismatch") return refuse(422, "identity_mismatch");
    return json(200, statusOf(after));
  }

  async function finalize(request: Request, s: UploadSession): Promise<Response> {
    // Verifying already: queue (or run) it again. The job is safe to run twice, and a queue
    // call that failed after the state changed would otherwise leave it verifying forever.
    if (s.state === "verifying") return verify(s);
    if (s.state === "done") return json(200, statusOf(s));
    if (s.state === "identity_mismatch") return refuse(422, "identity_mismatch");
    if (s.state === "partial") {
      // Retry only the targets that failed; the verified copies stand.
      if (!(await store.update(s.id, { state: "verifying", failed: [] }, ["partial"]))) return json(200, statusOf((await store.get(s.id)) ?? s));
      return verify({ ...s, state: "verifying", failed: [] });
    }
    const body = await readJson(request);
    if (!body) return refuse(422, "bad_request");
    const given = body.sha256;
    if (given !== undefined && (typeof given !== "string" || !SHA256_HEX.test(given))) return refuse(422, "bad_request");
    if (s.sha256 && given && given !== s.sha256) return refuse(422, "identity_mismatch");
    const sha256 = s.sha256 ?? (given as string | undefined);
    if (!sha256) return refuse(422, "sha256_required");
    const plan = partPlan(s.size, s.partSize);
    const missing: number[] = [];
    for (let n = 1; n <= plan.count; n++) if (!s.parts.some((p) => p.n === n)) missing.push(n);
    if (missing.length) return refuse(409, "missing_parts", { parts: missing.slice(0, 1000) });
    const primary = targets[s.targets[0]!]!;
    try {
      await primary.finish(s.key, s.targetUploadId, s.parts.map((p) => ({ n: p.n, etag: p.etag })));
    } catch (error) {
      // An earlier finalize may have assembled it and then failed to record that: the multipart
      // upload is gone but the object is there. Carry on to verification, which checks it whole.
      if (!(await primary.head(s.key).catch(() => null))) throw error;
    }
    if (!(await store.update(s.id, { state: "verifying", sha256 }, ["open"]))) return json(200, statusOf((await store.get(s.id)) ?? s));
    return verify({ ...s, state: "verifying", sha256 });
  }

  async function abort(s: UploadSession): Promise<Response> {
    if (s.state === "verifying") return refuse(409, "finalized", {}, "This upload is being checked; it can't be cancelled now.");
    if (s.state === "open") await targets[s.targets[0]!]?.abort(s.key, s.targetUploadId).catch(() => {});
    // Verified copies stay: removing them is deleting the media, under the app's retention policy.
    await store.remove(s.id);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  return async (request) => {
    try {
      const url = new URL(request.url);
      if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return refuse(404, "not_found");
      const rest = url.pathname.slice(base.length).split("/").filter(Boolean);
      const owner = await options.owner(request);
      if (!owner) return refuse(401, "unauthenticated");
      const method = request.method;
      if (rest.length === 0) return method === "POST" ? await create(request, owner) : refuse(405, "method_not_allowed");
      const [id, kind, n] = rest as [string, string | undefined, string | undefined];
      const op: UploadOperation | undefined =
        rest.length === 1 && method === "GET" ? "resume"
        : rest.length === 1 && method === "DELETE" ? "abort"
        : rest.length === 2 && kind === "finalize" && method === "POST" ? "finalize"
        : rest.length === 3 && kind === "parts" && method === "PUT" ? "part"
        : undefined;
      if (!op) return rest.length <= 3 ? refuse(405, "method_not_allowed") : refuse(404, "not_found");
      const s = await load(request, owner, id, op);
      if (s instanceof Response) return s;
      if (op === "resume") return json(200, statusOf(s));
      if (op === "part") return await part(request, s, n!);
      if (op === "finalize") return await finalize(request, s);
      return await abort(s);
    } catch (error) {
      try {
        options.onError?.(error, request);
      } catch {
        // A logger's own failure never changes the answer.
      }
      return refuse(503, "server_error");
    }
  };
}

/** A part's digest as stored: the full `content-digest` value from its base64. */
function formatContentDigestB64(b64: string): string {
  return `sha-256=:${b64}:`;
}
