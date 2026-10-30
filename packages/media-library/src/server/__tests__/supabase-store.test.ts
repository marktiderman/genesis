// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import { createSupabaseSessionStore, SessionStoreError, type SessionStoreClient } from "../supabase-store";
import type { UploadSession } from "../store";

/** Records the PostgREST calls the store makes, and answers from `answers` in order. */
function fakeClient(answers: { data: unknown; error: { message: string } | null }[]) {
  const calls: string[] = [];
  const next = () => Promise.resolve(answers.shift() ?? { data: null, error: null });
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lte", "order", "limit", "delete"]) {
      chain[m] = (...args: unknown[]) => (calls.push(`${table}.${m}(${args.map((a) => JSON.stringify(a)).join(",")})`), chain);
    }
    chain.insert = (row: unknown) => (calls.push(`${table}.insert`), calls.push(JSON.stringify(row)), next());
    chain.maybeSingle = () => next();
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => next().then(resolve, reject);
    return chain;
  };
  const client: SessionStoreClient = {
    schema: (name) => {
      calls.push(`schema ${name}`);
      return { from: builder, rpc: (fn, args) => (calls.push(`rpc ${fn} ${JSON.stringify(args)}`), next()) };
    },
  };
  return { client, calls };
}

const session: UploadSession = {
  id: "A".repeat(22),
  owner: { kind: "person", id: "alice" },
  purpose: "media",
  name: "a.jpg",
  contentType: "image/jpeg",
  size: 10,
  partSize: 4,
  key: "media/a.jpg",
  targets: ["working", "archive"],
  targetUploadId: "mpu-1",
  state: "open",
  parts: [],
  copies: [],
  failed: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  expiresAt: "2026-11-08T00:00:00.000Z",
};

const row = {
  id: session.id,
  owner_kind: "person",
  owner_id: "alice",
  purpose: "media",
  name: "a.jpg",
  content_type: "image/jpeg",
  size: "10",
  sha256: null,
  part_size: 4,
  key: "media/a.jpg",
  targets: ["working", "archive"],
  target_upload_id: "mpu-1",
  state: "open",
  copies: [],
  failed: [],
  created_at: "2026-11-01T00:00:00+00:00",
  expires_at: "2026-11-08T00:00:00+00:00",
  upload_parts: [{ n: 2, size: 4, digest: "d2", etag: "e2" }, { n: 1, size: "4", digest: "d1", etag: "e1" }],
};

describe("createSupabaseSessionStore", () => {
  it("maps a row (with its parts, in order) to a session, and a session to a row", async () => {
    const { client, calls } = fakeClient([{ data: null, error: null }, { data: row, error: null }]);
    const store = createSupabaseSessionStore(client);
    await store.insert(session);
    expect(JSON.parse(calls[2]!)).toMatchObject({ id: session.id, owner_kind: "person", owner_id: "alice", sha256: null, target_upload_id: "mpu-1", expires_at: session.expiresAt });
    const got = await store.get(session.id);
    expect(got).toEqual({ ...session, parts: [{ n: 1, size: 4, digest: "d1", etag: "e1" }, { n: 2, size: 4, digest: "d2", etag: "e2" }] });
  });

  it("goes through add_part and update_upload, so both act under RLS and atomically", async () => {
    const { client, calls } = fakeClient([{ data: "conflict", error: null }, { data: true, error: null }]);
    const store = createSupabaseSessionStore(client);
    expect(await store.addPart(session.id, { n: 1, size: 4, digest: "d", etag: "e" })).toBe("conflict");
    expect(await store.update(session.id, { state: "verifying", sha256: "a".repeat(64) }, ["open"])).toBe(true);
    expect(calls.filter((c) => c.startsWith("rpc"))).toEqual([
      `rpc add_part {"p_upload":"${session.id}","p_n":1,"p_size":4,"p_digest":"d","p_etag":"e"}`,
      `rpc update_upload {"p_id":"${session.id}","p_patch":{"state":"verifying","sha256":"${"a".repeat(64)}"},"p_when":["open"]}`,
    ]);
  });

  it("matches findOpen on the target set too, and turns a database error into SessionStoreError", async () => {
    const { client } = fakeClient([{ data: [{ ...row, targets: ["working"] }, row], error: null }, { data: null, error: { message: "boom" } }]);
    const store = createSupabaseSessionStore(client);
    expect((await store.findOpen({ owner: session.owner, purpose: "media", size: 10, sha256: "a".repeat(64), targets: ["archive", "working"] }))!.targets).toEqual(["working", "archive"]);
    await expect(store.get("x")).rejects.toBeInstanceOf(SessionStoreError);
  });
});
