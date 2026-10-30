/**
 * Where upload sessions live. The default is the app's own table
 * (`createSupabaseSessionStore`, over the genesis_media_library schema with
 * row level security on the owner); a Worker can keep them in a Durable
 * Object instead by implementing this interface.
 */
import type { FailedTarget, UploadCopy, UploadOwner, UploadState } from "../protocol";

/** One received part, with the target's receipt. */
export interface StoredPart {
  n: number;
  size: number;
  /** `sha-256=:<base64>:`. */
  digest: string;
  etag: string;
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
  /** The storage key, from the app's `keyFor`. */
  key: string;
  /** Target names; the first takes the parts, the rest are copied at finalize. */
  targets: string[];
  /** The first target's multipart upload id. */
  targetUploadId: string;
  state: UploadState;
  parts: StoredPart[];
  copies: UploadCopy[];
  failed: FailedTarget[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601: an open session lapses then, without another part. */
  expiresAt: string;
}

/** What may change on a session after it is made. */
export type UploadSessionPatch = Partial<Pick<UploadSession, "state" | "sha256" | "copies" | "failed" | "expiresAt">>;

/** @stability Experimental */
export interface UploadSessionStore {
  insert(session: UploadSession): Promise<void>;
  get(id: string): Promise<UploadSession | null>;
  /** The owner's open session for this identity, purpose and target set, if any. */
  findOpen(query: { owner: UploadOwner; purpose: string; size: number; sha256: string; targets: string[] }): Promise<UploadSession | null>;
  /**
   * Records a part, atomically: `added`; `same` (already there with this
   * digest: its etag becomes this one, the target's latest write); or
   * `conflict` (already there with another digest; nothing changes).
   */
  addPart(id: string, part: StoredPart): Promise<"added" | "same" | "conflict">;
  /** Applies `patch` when the session is still in one of `when` states (all states when omitted). True when it applied. */
  update(id: string, patch: UploadSessionPatch, when?: UploadState[]): Promise<boolean>;
  remove(id: string): Promise<void>;
  /** Open sessions whose `expiresAt` has passed, for the sweep. */
  expired(now: Date, limit: number): Promise<UploadSession[]>;
}

const sameTargets = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** Sessions in memory, for tests and a single process. @stability Experimental */
export function createMemorySessionStore(): UploadSessionStore & { readonly sessions: Map<string, UploadSession> } {
  const sessions = new Map<string, UploadSession>();
  const copy = (s: UploadSession): UploadSession => structuredClone(s);
  return {
    sessions,
    async insert(s) {
      sessions.set(s.id, copy(s));
    },
    async get(id) {
      const s = sessions.get(id);
      return s ? copy(s) : null;
    },
    async findOpen(q) {
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
          return copy(s);
        }
      }
      return null;
    },
    async addPart(id, part) {
      const s = sessions.get(id);
      if (!s) throw new Error(`no session ${id}`);
      const had = s.parts.find((p) => p.n === part.n);
      if (had) {
        if (had.digest !== part.digest) return "conflict";
        had.etag = part.etag;
        return "same";
      }
      s.parts.push({ ...part });
      s.parts.sort((a, b) => a.n - b.n);
      return "added";
    },
    async update(id, patch, when) {
      const s = sessions.get(id);
      if (!s || (when && !when.includes(s.state))) return false;
      Object.assign(s, structuredClone(patch));
      return true;
    },
    async remove(id) {
      sessions.delete(id);
    },
    async expired(now, limit) {
      return [...sessions.values()].filter((s) => s.state === "open" && Date.parse(s.expiresAt) <= now.getTime()).slice(0, limit).map(copy);
    },
  };
}
