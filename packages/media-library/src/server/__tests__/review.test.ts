// @feat:media-resumable-uploads
// Each of these failed on add69735, before the fixes from the second review of #550.
import { describe, expect, it } from "vitest";
import type { UploadStatus } from "../../protocol";
import { sweepExpiredUploads } from "../verify";
import { BASE, bytesOf, digestOf, sendAll, setup, sha256Hex } from "./helpers";

const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("2. one verification at a time (a lease)", () => {
  it("a second finalize during an inline verify doesn't copy or lock again", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    // Hold the archive copy open until the second finalize has had its go.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const start = s.archive.start;
    let first = true;
    s.archive.start = async (key, meta) => {
      if (first) {
        first = false;
        await held;
      }
      return start(key, meta);
    };
    const a = s.alice.finalize(id);
    for (let i = 0; i < 20; i++) await tick();
    const b = await s.alice.finalize(id);
    expect(b.status).toBe(202);
    expect((await json(b)).state).toBe("verifying");
    release();
    expect((await json(await a)).state).toBe("done");
    expect(s.archive.calls.filter((c) => c.startsWith("start"))).toHaveLength(1);
    expect(s.archive.calls.filter((c) => c.startsWith("lock"))).toHaveLength(1);
    expect(s.archive.locks.size).toBe(1);
  });

  it("a verify job that finds the lease taken asks to be run again later", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(40));
    await s.alice.finalize(id);
    expect(await s.store.claimVerify(id, new Date(s.now() + 60_000).toISOString(), new Date(s.now()).toISOString())).toBe(true);
    const outcome = await s.verifyJob({ payload: { uploadId: id } });
    expect(outcome).toMatchObject({ retryAfterSeconds: expect.any(Number) });
    expect(s.archive.calls.some((c) => c.startsWith("start"))).toBe(false);
  });
});

describe("3. abort and sweep remove only what they loaded", () => {
  it("an abort that loaded `open` doesn't remove a session finalize has since finished", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const remove = s.store.remove;
    s.store.remove = async (uploadId, when) => {
      // Finalize wins the race between the abort's load and its delete.
      await s.alice.finalize(uploadId);
      return remove(uploadId, when);
    };
    const res = await s.alice.abort(id);
    expect(res.status).toBe(409);
    expect(s.store.sessions.get(id)!.state).toBe("done");
  });

  it("the sweep doesn't remove a session that left `open` after it was listed", async () => {
    const s = setup({ sessionTtlSeconds: 60 });
    const { id } = await sendAll(s, bytesOf(10));
    s.tick(61_000);
    const listed = await s.store.stale(new Date(s.now()), 10, new Date(0));
    expect(listed.map((x) => x.id)).toEqual([id]);
    const stale = s.store.stale;
    s.store.stale = async (...args) => {
      const out = await stale(...args);
      await s.store.update(id, { state: "verifying" }); // it moved on meanwhile
      return out;
    };
    await sweepExpiredUploads({ store: s.store, targets: s.targets, now: s.now });
    expect(s.store.sessions.has(id)).toBe(true);
  });
});

describe("5. a part number is reserved before its bytes are written", () => {
  it("two requests for the same part with different bytes: the loser is refused before it writes", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 8, purpose: "media" }));
    const writes: string[] = [];
    const part = s.working.part;
    let wrote!: () => void;
    const secondWrote = new Promise<void>((r) => (wrote = r));
    let calls = 0;
    s.working.part = async (key, upload, n, body, info) => {
      const mine = ++calls;
      // The first writer is slow: it writes only after the second one did (or a moment passed).
      if (mine === 1) await Promise.race([secondWrote, new Promise((r) => setTimeout(r, 30))]);
      const receipt = await part(key, upload, n, body, info);
      writes.push(`write ${mine}`);
      if (mine === 2) wrote();
      return receipt;
    };
    const [a, b] = await Promise.all([s.alice.part(uploadId, 1, bytesOf(4, 1)), s.alice.part(uploadId, 1, bytesOf(4, 2))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(writes).toHaveLength(1);
    // What the target holds for part 1 is what the session recorded.
    const stored = s.store.sessions.get(uploadId)!.parts[0]!;
    const winner = a.status === 200 ? bytesOf(4, 1) : bytesOf(4, 2);
    expect(stored.digest).toBe(await digestOf(winner));
  });
});

describe("6. two tabs, one session", () => {
  it("two creates at once for the same file make one session", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const body = { name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" };
    const [a, b] = await Promise.all([s.alice.create(body), s.alice.create(body)]);
    const ids = [(await json<UploadStatus>(a)).uploadId, (await json<UploadStatus>(b)).uploadId];
    expect(ids[0]).toBe(ids[1]);
    expect([...s.store.sessions.values()].filter((x) => x.state === "open")).toHaveLength(1);
    expect(s.working.openUploads.size).toBe(1);
  });
});

describe("7. a part streams through, never held whole twice", () => {
  it("the target gets the request's bytes as a stream, read as it arrives", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 8, purpose: "media" }));
    const part = s.working.part;
    let sawStream = false;
    s.working.part = async (key, upload, n, body, info) => {
      sawStream = body instanceof ReadableStream;
      return part(key, upload, n, body, info);
    };
    const chunks = [bytesOf(2, 1), bytesOf(2, 3)];
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulled < chunks.length) c.enqueue(chunks[pulled++]!);
        else c.close();
      },
    });
    const whole = new Uint8Array([...chunks[0]!, ...chunks[1]!]);
    const res = await s.handler(
      new Request(`${BASE}/${uploadId}/parts/1`, { method: "PUT", headers: { "x-test-owner": "alice", "content-length": "4", "content-digest": await digestOf(whole) }, body, duplex: "half" } as RequestInit),
    );
    expect(res.status).toBe(200);
    expect(sawStream).toBe(true);
  });

  it("a streamed part that doesn't match its digest is refused and not recorded", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 8, purpose: "media" }));
    const res = await s.alice.part(uploadId, 1, bytesOf(4, 1), await digestOf(bytesOf(4, 2)));
    expect(res.status).toBe(422);
    expect(s.store.sessions.get(uploadId)!.parts).toEqual([]);
    expect((await s.alice.part(uploadId, 1, bytesOf(4, 1))).status).toBe(200);
  });
});

describe("8. small items", () => {
  it("a part that arrives after finalize (the session was read just before) is 410, not 503", async () => {
    const s = setup();
    const { id, parts } = await sendAll(s, bytesOf(10));
    const stale = structuredClone(s.store.sessions.get(id)!);
    stale.parts = [];
    await s.alice.finalize(id);
    const get = s.store.get;
    s.store.get = async (uploadId) => (uploadId === id ? structuredClone(stale) : get(uploadId));
    const res = await s.alice.part(id, 1, parts[0]!);
    expect(res.status).toBe(410);
  });

  it("a session stuck verifying with no live lease can be aborted and swept, and its unverified objects removed", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(40));
    await s.alice.finalize(id); // 202: queued, and the job never runs
    expect((await s.alice.abort(id)).status).toBe(409);
    s.tick(2 * 3600_000);
    expect((await s.alice.abort(id)).status).toBe(204);
    expect(s.working.objects.size).toBe(0);
    const again = await sendAll(s, bytesOf(40, 2));
    await s.alice.finalize(again.id);
    s.tick(2 * 3600_000);
    expect(await sweepExpiredUploads({ store: s.store, targets: s.targets, now: s.now })).toBe(1);
    expect(s.store.sessions.size).toBe(0);
  });

  it("a copy whose run died leaves no multipart upload behind: the next run aborts it", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    // The archive accepts the start, then dies before the copy can finish or abort.
    const part = s.archive.part;
    s.archive.part = async () => {
      throw new Error("process died");
    };
    const abort = s.archive.abort;
    s.archive.abort = async () => {
      throw new Error("process died");
    };
    expect((await json(await s.alice.finalize(id))).state).toBe("partial");
    expect(s.archive.openUploads.size).toBe(1);
    s.archive.part = part;
    s.archive.abort = abort;
    expect((await json(await s.alice.finalize(id))).state).toBe("done");
    expect(s.archive.openUploads.size).toBe(0);
  });

  it("an owner kind the session table can't store is refused before anything is made", async () => {
    const seen: unknown[] = [];
    const s = setup({ owner: () => ({ kind: "Person!", id: "alice" }), onError: (e) => void seen.push(e) });
    const res = await s.alice.create({ name: "a", contentType: "a/b", size: 4, purpose: "media" });
    expect(res.status).toBe(503);
    expect(String(seen[0])).toMatch(/owner kind/);
    expect(s.working.calls).toEqual([]);
  });
});

describe("9. copies carry their tier", () => {
  it("each copy records its target's tier (working by default)", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const done = await json<UploadStatus>(await s.alice.finalize(id));
    expect(done.copies!.map((c) => [c.target, c.tier])).toEqual([
      ["working", "working"],
      ["archive", "archive"],
    ]);
  });
});

