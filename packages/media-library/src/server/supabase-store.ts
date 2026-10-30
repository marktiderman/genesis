/**
 * Upload sessions in the app's own Supabase (migration
 * 0001_genesis_media_library: the genesis_media_library schema, row level
 * security on the owner). Pass the service-role client: only it may write,
 * and the upload handler binds every operation to its owner itself. A
 * person's own client may only read their sessions.
 */
import type { FailedTarget, UploadCopy } from "../protocol";
import type { AssembledObject } from "../targets/target";
import { SessionConflictError, SessionNotOpenError, type StoredPart, type UploadSession, type UploadSessionStore } from "./store";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;

/**
 * The parts of a Supabase client this store uses: a `SupabaseClient` fits.
 * Loose on purpose, like genesis-supabase's `JobsClient`: an app's generated
 * types may not list this schema.
 */
export interface SessionStoreClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema(name: "genesis_media_library"): { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): Result<unknown> };
}

interface Row {
  id: string;
  owner_kind: string;
  owner_id: string;
  purpose: string;
  name: string;
  content_type: string;
  size: number;
  sha256: string | null;
  part_size: number;
  key: string;
  targets: string[];
  target_upload_id: string;
  state: UploadSession["state"];
  copies: UploadCopy[];
  failed: FailedTarget[];
  assembled: Record<string, AssembledObject>;
  pending_copies: Record<string, string>;
  verifying_since: string | null;
  lease_until: string | null;
  created_at: string;
  expires_at: string;
  upload_parts?: StoredPart[];
}

const toSession = (r: Row): UploadSession => ({
  id: r.id,
  owner: { kind: r.owner_kind, id: r.owner_id },
  purpose: r.purpose,
  name: r.name,
  contentType: r.content_type,
  size: Number(r.size),
  ...(r.sha256 ? { sha256: r.sha256 } : {}),
  partSize: Number(r.part_size),
  key: r.key,
  targets: r.targets,
  targetUploadId: r.target_upload_id,
  state: r.state,
  parts: (r.upload_parts ?? []).map((p) => ({ n: p.n, size: Number(p.size), digest: p.digest, etag: p.etag })).sort((a, b) => a.n - b.n),
  copies: r.copies ?? [],
  failed: r.failed ?? [],
  assembled: r.assembled ?? {},
  pendingCopies: r.pending_copies ?? {},
  ...(r.verifying_since ? { verifyingSince: new Date(r.verifying_since).toISOString() } : {}),
  ...(r.lease_until ? { leaseUntil: new Date(r.lease_until).toISOString() } : {}),
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: new Date(r.expires_at).toISOString(),
});

/** A store failure (not a refusal): the handler answers 503 and its `onError` sees it. */
export class SessionStoreError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "SessionStoreError";
    this.code = code;
  }
}

function check<T>(what: string, r: { data: unknown; error: { message: string; code?: string } | null }): T | null {
  // A unique index said no: another session holds the key, or this owner's open session for this file.
  if (r.error?.code === "23505") throw new SessionConflictError(`genesis_media_library ${what}: ${r.error.message}`);
  if (r.error) throw new SessionStoreError(`genesis_media_library ${what}: ${r.error.message}`, r.error.code);
  return r.data as T | null;
}

const sameTargets = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** @stability Experimental */
export function createSupabaseSessionStore(client: SessionStoreClient): UploadSessionStore {
  const db = () => client.schema("genesis_media_library");
  const withParts = "*, upload_parts(n, size, digest, etag)";
  return {
    async insert(s) {
      check(
        "insert",
        await db().from("uploads").insert({
          id: s.id,
          owner_kind: s.owner.kind,
          owner_id: s.owner.id,
          purpose: s.purpose,
          name: s.name,
          content_type: s.contentType,
          size: s.size,
          sha256: s.sha256 ?? null,
          part_size: s.partSize,
          key: s.key,
          targets: s.targets,
          target_upload_id: s.targetUploadId,
          state: s.state,
          copies: s.copies,
          failed: s.failed,
          assembled: s.assembled,
          pending_copies: s.pendingCopies,
          created_at: s.createdAt,
          expires_at: s.expiresAt,
        }),
      );
    },
    async get(id) {
      const row = check<Row>("get", await db().from("uploads").select(withParts).eq("id", id).maybeSingle());
      return row ? toSession(row) : null;
    },
    async findOpen(q) {
      const rows =
        check<Row[]>(
          "findOpen",
          await db()
            .from("uploads")
            .select(withParts)
            .eq("state", "open")
            .eq("owner_kind", q.owner.kind)
            .eq("owner_id", q.owner.id)
            .eq("purpose", q.purpose)
            .eq("size", q.size)
            .eq("sha256", q.sha256)
            .order("created_at", { ascending: false })
            .limit(20),
        ) ?? [];
      const match = rows.find((r) => sameTargets(r.targets, q.targets));
      return match ? toSession(match) : null;
    },
    async reservePart(id, part) {
      try {
        const result = check<string>("reservePart", await db().rpc("reserve_part", { p_upload: id, p_n: part.n, p_size: part.size, p_digest: part.digest }));
        if (result !== "reserved" && result !== "same" && result !== "received" && result !== "conflict") throw new SessionStoreError(`genesis_media_library reservePart: unexpected ${String(result)}`);
        return result;
      } catch (error) {
        // The session isn't open (finalized or aborted meanwhile): the handler answers 410.
        if (error instanceof SessionStoreError && error.code === "P0002") throw new SessionNotOpenError(id);
        throw error;
      }
    },
    async completePart(id, n, digest, etag) {
      return check<boolean>("completePart", await db().rpc("complete_part", { p_upload: id, p_n: n, p_digest: digest, p_etag: etag })) === true;
    },
    async releasePart(id, n, digest) {
      check("releasePart", await db().rpc("release_part", { p_upload: id, p_n: n, p_digest: digest }));
    },
    async claimVerify(id, until, now) {
      return check<boolean>("claimVerify", await db().rpc("claim_verify", { p_id: id, p_until: until, p_now: now })) === true;
    },
    async update(id, patch, when) {
      const body: Record<string, unknown> = {};
      if (patch.state) body.state = patch.state;
      if (patch.sha256) body.sha256 = patch.sha256;
      if (patch.copies) body.copies = patch.copies;
      if (patch.failed) body.failed = patch.failed;
      if (patch.expiresAt) body.expires_at = patch.expiresAt;
      if (patch.assembled) body.assembled = patch.assembled;
      if (patch.pendingCopies) body.pending_copies = patch.pendingCopies;
      if (patch.verifyingSince !== undefined) body.verifying_since = patch.verifyingSince;
      if (patch.leaseUntil !== undefined) body.lease_until = patch.leaseUntil;
      return check<boolean>("update", await db().rpc("update_upload", { p_id: id, p_patch: body, p_when: when ?? null })) === true;
    },
    async remove(id, when) {
      return check<boolean>("remove", await db().rpc("remove_upload", { p_id: id, p_when: when })) === true;
    },
    async stale(now, limit, verifyingBefore) {
      const rows = check<Row[]>("stale", await db().rpc("stale_uploads", { p_now: now.toISOString(), p_limit: limit, p_verifying_before: verifyingBefore.toISOString() })) ?? [];
      return rows.map(toSession);
    },
  };
}
