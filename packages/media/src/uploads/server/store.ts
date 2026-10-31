/**
 * Where upload sessions live. The default is the app's own table
 * (`createSupabaseSessionStore`, over the genesis_media schema with
 * row level security on the owner); a Worker can keep them in a Durable
 * Object instead by implementing this interface. Every method that changes
 * a session is a compare-and-set, so two requests racing on one session
 * can't both win.
 */
import type { FailedTarget, UploadCopy, UploadOwner, UploadState } from "../protocol";
import type { AssembledObject } from "../targets/target";

/** One part: reserved (no etag yet, being written) or received (with the target's etag). */
export interface StoredPart {
  n: number;
  size: number;
  /** `sha-256=:<base64>:`. */
  digest: string;
  /** The target's receipt; null while the part is reserved and being written. */
  etag: string | null;
}

/** An upload session as stored. */
export interface UploadSession {
  id: string;
  owner: UploadOwner;
  purpose: string;
  name: string;
  contentType: string;
  size: number;
  sha256?: string | undefined;
  partSize: number;
  /** The storage key: this upload's own (it holds the upload id), never another upload's. */
  key: string;
  /** Target names; the first takes the parts, the rest are copied at finalize. */
  targets: string[];
  /** The first target's multipart upload id. */
  targetUploadId: string;
  state: UploadState;
  parts: StoredPart[];
  copies: UploadCopy[];
  failed: FailedTarget[];
  /** The objects this upload made, by target: read back, locked and deleted by exactly these. */
  assembled: Record<string, AssembledObject>;
  /** Copies under way, by target: their multipart upload ids, so a run that died can be aborted. */
  pendingCopies: Record<string, string>;
  /** ISO 8601: when it entered `verifying`. */
  verifyingSince?: string | undefined;
  /** ISO 8601: a worker holds the verification until then. */
  leaseUntil?: string | undefined;
  /** Which worker holds it (a random token per run): only it may renew, save or finish. */
  leaseHolder?: string | undefined;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601: an open session lapses then, without another part. */
  expiresAt: string;
}

/** What may change on a session after it is made. `null` clears a field. */
export type UploadSessionPatch = Partial<{
  state: UploadState;
  sha256: string;
  copies: UploadCopy[];
  failed: FailedTarget[];
  expiresAt: string;
  assembled: Record<string, AssembledObject>;
  pendingCopies: Record<string, string>;
  verifyingSince: string | null;
  leaseUntil: string | null;
  leaseHolder: string | null;
}>;

/** The session isn't open any more (it was finalized or aborted meanwhile). */
export class SessionNotOpenError extends Error {
  constructor(id: string) {
    super(`upload ${id} isn't open`);
    this.name = "SessionNotOpenError";
  }
}

/** Another session already holds this key, or this owner's open session for this identity. */
export class SessionConflictError extends Error {
  constructor(what: string) {
    super(what);
    this.name = "SessionConflictError";
  }
}

/** What reserving a part found. */
export type PartReservation =
  /** It's this request's to write. */
  | "reserved"
  /** Reserved or received with these bytes already: write it (again, harmlessly) and complete it. */
  | "same"
  /** Received already with these bytes: nothing to write. */
  | "received"
  /** Reserved or received with other bytes: refused, nothing written. */
  | "conflict";

/** @stability Experimental */
export interface UploadSessionStore {
  /**
   * Stores a new session. Throws `SessionConflictError` when the key is taken,
   * or the owner already has an open session for this identity, purpose and
   * target set (two tabs at once): the caller resumes that one.
   */
  insert(session: UploadSession): Promise<void>;
  get(id: string): Promise<UploadSession | null>;
  /** The owner's open session for this identity, purpose and target set, if any. */
  findOpen(query: { owner: UploadOwner; purpose: string; size: number; sha256: string; targets: string[] }): Promise<UploadSession | null>;
  /**
   * Reserves part `n` for these bytes before they are written, atomically
   * with the check (a compare-and-set on the part row). Throws
   * `SessionNotOpenError` when the session isn't open.
   */
  reservePart(id: string, part: { n: number; size: number; digest: string }): Promise<PartReservation>;
  /** Records the target's etag for a part reserved with this digest. False when the reservation is gone. */
  completePart(id: string, n: number, digest: string, etag: string): Promise<boolean>;
  /** Drops a reservation with this digest that never received an etag (the write failed). */
  releasePart(id: string, n: number, digest: string): Promise<void>;
  /**
   * Applies `patch` when the session is still in one of `when` states (all
   * states when omitted) and, when `holder` is given, while that worker still
   * holds the lease. True when it applied.
   */
  update(id: string, patch: UploadSessionPatch, when?: UploadState[], holder?: string): Promise<boolean>;
  /**
   * Takes the verification lease for `holder` until `until`, when the
   * session is `verifying` and no lease is live at `now`. True when it does.
   */
  claimVerify(id: string, until: string, now: string, holder: string): Promise<boolean>;
  /**
   * Removes the session when it is still in one of `when` states and, with
   * `leaseFreeAt`, when no verification lease is live then. True when removed.
   */
  remove(id: string, when: UploadState[], leaseFreeAt?: string): Promise<boolean>;
  /**
   * Sessions for the sweep: open ones past `expiresAt`, and verifying ones
   * that entered `verifying` before `verifyingBefore` with no live lease.
   */
  stale(now: Date, limit: number, verifyingBefore: Date): Promise<UploadSession[]>;
}

const sameTargets = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** Sessions in memory, for tests and a single process. @stability Experimental */
export function createMemorySessionStore(): UploadSessionStore & { readonly sessions: Map<string, UploadSession> } {
  const sessions = new Map<string, UploadSession>();
  const copy = (s: UploadSession): UploadSession => structuredClone(s);
  const openFor = (q: { owner: UploadOwner; purpose: string; size: number; sha256?: string | undefined; targets: string[] }) => {
    if (!q.sha256) return undefined;
    for (const s of sessions.values()) {
      if (
        s.state === "open" &&
        s.owner.kind === q.owner.kind &&
        s.owner.id === q.owner.id &&
        s.purpose === q.purpose &&
        s.size === q.size &&
        s.sha256 === q.sha256 &&
        sameTargets(s.targets, q.targets)
      ) {
        return s;
      }
    }
    return undefined;
  };
  return {
    sessions,
    async insert(s) {
      if (sessions.has(s.id)) throw new SessionConflictError(`the upload id ${s.id} is taken`);
      if ([...sessions.values()].some((x) => x.key === s.key)) throw new SessionConflictError(`the key ${s.key} is taken`);
      if (openFor(s)) throw new SessionConflictError("an open session for this file exists");
      sessions.set(s.id, copy(s));
    },
    async get(id) {
      const s = sessions.get(id);
      return s ? copy(s) : null;
    },
    async findOpen(q) {
      const s = openFor(q);
      return s ? copy(s) : null;
    },
    async reservePart(id, part) {
      const s = sessions.get(id);
      if (!s || s.state !== "open") throw new SessionNotOpenError(id);
      const had = s.parts.find((p) => p.n === part.n);
      if (had) return had.digest !== part.digest ? "conflict" : had.etag === null ? "same" : "received";
      s.parts.push({ ...part, etag: null });
      s.parts.sort((a, b) => a.n - b.n);
      return "reserved";
    },
    async completePart(id, n, digest, etag) {
      const p = sessions.get(id)?.parts.find((x) => x.n === n && x.digest === digest);
      if (!p) return false;
      p.etag = etag;
      return true;
    },
    async releasePart(id, n, digest) {
      const s = sessions.get(id);
      if (s) s.parts = s.parts.filter((p) => !(p.n === n && p.digest === digest && p.etag === null));
    },
    async update(id, patch, when, holder) {
      const s = sessions.get(id);
      if (!s || (when && !when.includes(s.state)) || (holder !== undefined && s.leaseHolder !== holder)) return false;
      for (const [k, v] of Object.entries(structuredClone(patch))) {
        if (v === null) delete (s as unknown as Record<string, unknown>)[k];
        else (s as unknown as Record<string, unknown>)[k] = v;
      }
      return true;
    },
    async claimVerify(id, until, now, holder) {
      const s = sessions.get(id);
      if (!s || s.state !== "verifying" || (s.leaseUntil && Date.parse(s.leaseUntil) > Date.parse(now))) return false;
      s.leaseUntil = until;
      s.leaseHolder = holder;
      return true;
    },
    async remove(id, when, leaseFreeAt) {
      const s = sessions.get(id);
      if (!s || !when.includes(s.state)) return false;
      if (leaseFreeAt && s.leaseUntil && Date.parse(s.leaseUntil) > Date.parse(leaseFreeAt)) return false;
      sessions.delete(id);
      return true;
    },
    async stale(now, limit, verifyingBefore) {
      const t = now.getTime();
      return [...sessions.values()]
        .filter(
          (s) =>
            (s.state === "open" && Date.parse(s.expiresAt) <= t) ||
            (s.state === "verifying" && Date.parse(s.verifyingSince ?? s.createdAt) <= verifyingBefore.getTime() && !(s.leaseUntil && Date.parse(s.leaseUntil) > t)),
        )
        .slice(0, limit)
        .map(copy);
    },
  };
}
