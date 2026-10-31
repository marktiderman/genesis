// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import type { UploadStatus } from "../../protocol";
import { isSafeKey, safeName } from "../handler";
import { sweepExpiredUploads } from "../verify";
import { BASE, bytesOf, digestOf, partsOf, sendAll, setup, sha256Hex } from "./helpers";

const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

describe("create", () => {
  it("opens a session bound to its owner, with the part plan and the targets the app chose", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const res = await s.alice.create({ name: "a.bin", contentType: "image/jpeg", size: 10, sha256: await sha256Hex(bytes), purpose: "media" });
    expect(res.status).toBe(201);
    const body = await json<UploadStatus>(res);
    expect(body).toMatchObject({ state: "open", size: 10, partSize: 4, parts: [], targets: ["working", "archive"] });
    expect(body.uploadId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(s.store.sessions.get(body.uploadId)!.owner).toEqual({ kind: "person", id: "alice" });
    expect(s.store.sessions.get(body.uploadId)!.key).toBe(`media/alice/${body.uploadId}/a.bin`);
    expect(s.working.calls).toEqual([`start media/alice/${body.uploadId}/a.bin`]);
  });

  it("takes sha256 as optional, narrows targets to the app's, and refuses what's malformed or not allowed", async () => {
    const s = setup();
    expect((await s.alice.create({ name: "a", contentType: "image/jpeg", size: 1, purpose: "media" })).status).toBe(201);
    const narrowed = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "image/jpeg", size: 1, purpose: "media", targets: ["archive", "elsewhere"] }));
    expect(narrowed.targets).toEqual(["archive"]);
    for (const bad of [{}, { name: "a", contentType: "x", size: 1, purpose: "media" }, { name: "a", contentType: "a/b", size: -1, purpose: "media" }, { name: "a", contentType: "a/b", size: 1, purpose: "Media!" }, { name: "a", contentType: "a/b", size: 1, purpose: "m", sha256: "nothex" }]) {
      expect((await s.alice.create(bad)).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await s.anon.create({ name: "a", contentType: "a/b", size: 1, purpose: "media" })).status).toBe(401);
    const refusing = setup({ authorize: () => ({ allow: false, status: 413 }) });
    const refused = await refusing.alice.create({ name: "a", contentType: "a/b", size: 1, purpose: "media" });
    expect(refused.status).toBe(413);
    expect((await json(refused)).code).toBe("too_large");
  });

  it("refuses a file too big for the part limits (more than 10,000 parts at the largest part)", async () => {
    const s = setup({ maxPartBytes: 4 });
    expect((await s.alice.create({ name: "a", contentType: "a/b", size: 40_001, purpose: "media" })).status).toBe(413);
  });
});

describe("skip-if-identical", () => {
  const copiesFor = (sha256: string, size: number) => [
    { target: "working", tier: "working" as const, key: "media/old", size, sha256, verifiedAt: "2026-10-01T00:00:00.000Z" },
    { target: "archive", tier: "archive" as const, key: "media/old", size, sha256, verifiedAt: "2026-10-01T00:00:00.000Z" },
  ];

  it("skips only on the whole object's SHA-256 and size, within what the caller can already read", async () => {
    const bytes = bytesOf(10);
    const sha = await sha256Hex(bytes);
    const s = setup({ readableObjects: [{ copies: copiesFor(sha, 10), ref: "media-value-1" }] });
    const skipped = await s.alice.create({ name: "copy.bin", contentType: "a/b", size: 10, sha256: sha, purpose: "media" });
    expect(skipped.status).toBe(200);
    expect(await json(skipped)).toEqual({ state: "skipped", copies: copiesFor(sha, 10), ref: "media-value-1" });
    expect(s.working.calls).toEqual([]);
    // Bob uploads the very same file: it isn't in what Bob can read, so it is no match, and nothing tells him it exists.
    const bob = await s.bob.create({ name: "copy.bin", contentType: "a/b", size: 10, sha256: sha, purpose: "media" });
    expect(bob.status).toBe(201);
    expect(s.readableCalls.map((c) => c.owner.id)).toEqual(["alice", "bob"]);
  });

  it("is no skip for another size, another SHA-256, a match missing a target, or no sha256 at create", async () => {
    const bytes = bytesOf(10);
    const sha = await sha256Hex(bytes);
    const s = setup({ readableObjects: [{ copies: copiesFor(sha, 10) }] });
    expect((await s.alice.create({ name: "a", contentType: "a/b", size: 11, sha256: sha, purpose: "media" })).status).toBe(201);
    expect((await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: "0".repeat(64), purpose: "media" })).status).toBe(201);
    expect((await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" })).status).toBe(201);
    const missing = setup({ readableObjects: [{ copies: copiesFor(sha, 10).slice(0, 1) }] });
    expect((await missing.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: sha, purpose: "media" })).status).toBe(201);
    // A part's digest never decides a skip: only the declared whole-object identity is looked up.
    expect(s.readableCalls.every((c) => /^[0-9a-f]{64}$/.test(c.sha256))).toBe(true);
  });
});

describe("parts", () => {
  it("records a checked part, and the same part again is a no-op", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    const first = await s.alice.part(uploadId, 1, bytes.subarray(0, 4));
    expect(first.status).toBe(200);
    expect(await json(first)).toEqual({ n: 1, size: 4, digest: await digestOf(bytes.subarray(0, 4)) });
    expect((await s.alice.part(uploadId, 1, bytes.subarray(0, 4))).status).toBe(200);
    expect(s.working.calls.filter((c) => c.startsWith("part"))).toHaveLength(1);
  });

  it("refuses a part sent again with other bytes (409 part_conflict); the first stands", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    await s.alice.part(uploadId, 1, bytesOf(4, 1));
    const again = await s.alice.part(uploadId, 1, bytesOf(4, 9));
    expect(again.status).toBe(409);
    expect((await json(again)).code).toBe("part_conflict");
    expect(s.store.sessions.get(uploadId)!.parts[0]!.digest).toBe(await digestOf(bytesOf(4, 1)));
  });

  it("refuses a part that arrived changed (422), the wrong size (409, 413), no digest (400), or out of range", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    const changed = await s.alice.part(uploadId, 1, bytesOf(4, 1), await digestOf(bytesOf(4, 2)));
    expect(changed.status).toBe(422);
    expect((await json(changed)).code).toBe("digest_mismatch");
    expect(s.store.sessions.get(uploadId)!.parts).toEqual([]);
    expect((await s.alice.part(uploadId, 1, bytesOf(3))).status).toBe(409);
    expect((await s.alice.part(uploadId, 1, bytesOf(5))).status).toBe(413);
    expect((await s.alice.part(uploadId, 3, bytesOf(4))).status).toBe(409); // the last part is 2 bytes
    expect((await s.alice.part(uploadId, 4, bytesOf(2))).status).toBe(409);
    const noDigest = await s.handler(new Request(`${BASE}/${uploadId}/parts/1`, { method: "PUT", headers: { "x-test-owner": "alice" }, body: bytesOf(4) as Uint8Array<ArrayBuffer> }));
    expect(noDigest.status).toBe(400);
  });
});

describe("finalize and verification", () => {
  it("verifies a small upload inline: copies it to every target, reads each back, then locks it", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    const res = await s.alice.finalize(id);
    expect(res.status).toBe(200);
    const body = await json<UploadStatus>(res);
    expect(body.state).toBe("done");
    const sha = await sha256Hex(bytes);
    expect(body.copies).toEqual([
      { target: "working", tier: "working", key: `media/alice/${id}/a.bin`, size: 10, sha256: sha, verifiedAt: "2026-11-01T00:00:00.000Z" },
      { target: "archive", tier: "archive", key: `media/alice/${id}/a.bin`, size: 10, sha256: sha, lockMode: "COMPLIANCE", lockedUntil: "2036-10-29T00:00:00.000Z", verifiedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    expect([...s.archive.objects.get(`media/alice/${id}/a.bin`)!]).toEqual([...bytes]);
    // Locked only after its read-back.
    const calls = s.archive.calls;
    expect(calls.indexOf(`lock media/alice/${id}/a.bin`)).toBeGreaterThan(calls.indexOf(`read media/alice/${id}/a.bin`));
  });

  it("verifies a big upload in a job: 202 verifying, Resume says so, then done once the job ran", async () => {
    const s = setup();
    const bytes = bytesOf(40);
    const { id } = await sendAll(s, bytes);
    const res = await s.alice.finalize(id);
    expect(res.status).toBe(202);
    expect((await json(res)).state).toBe("verifying");
    expect(s.queued).toEqual([id]);
    expect(s.archive.locks.size).toBe(0);
    expect((await json(await s.alice.resume(id))).state).toBe("verifying");
    expect((await s.alice.finalize(id)).status).toBe(202);
    await s.verifyJob({ payload: { uploadId: id } });
    const done = await json<UploadStatus>(await s.alice.resume(id));
    expect(done.state).toBe("done");
    expect(done.copies).toHaveLength(2);
    expect(s.archive.locks.size).toBe(1);
    // The job running twice (a redelivery) changes nothing.
    await s.verifyJob({ payload: { uploadId: id } });
    expect(s.archive.calls.filter((c) => c.startsWith("lock"))).toHaveLength(1);
  });

  it("takes the SHA-256 at finalize when create had none, and checks it the same way", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { uploadId, partSize } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    for (const [i, p] of partsOf(bytes, partSize).entries()) await s.alice.part(uploadId, i + 1, p);
    const without = await s.alice.finalize(uploadId);
    expect(without.status).toBe(422);
    expect((await json(without)).code).toBe("sha256_required");
    expect((await s.alice.finalize(uploadId, { sha256: await sha256Hex(bytes) })).status).toBe(200);

    const wrong = setup();
    const w = await json<UploadStatus>(await wrong.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    for (const [i, p] of partsOf(bytes, w.partSize).entries()) await wrong.alice.part(w.uploadId, i + 1, p);
    const mismatch = await wrong.alice.finalize(w.uploadId, { sha256: "0".repeat(64) });
    expect(mismatch.status).toBe(422);
    expect((await json(mismatch)).code).toBe("identity_mismatch");
  });

  it("lists the missing parts (409) before it assembles anything", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    await s.alice.part(uploadId, 2, bytes.subarray(4, 8));
    const res = await s.alice.finalize(uploadId);
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "missing_parts", parts: [1, 3] });
    expect(s.working.calls.some((c) => c.startsWith("finish"))).toBe(false);
  });

  it("refuses parts once finalized (410), and a finished upload's finalize answers done again", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id, parts } = await sendAll(s, bytes);
    await s.alice.finalize(id);
    expect((await s.alice.part(id, 1, parts[0]!)).status).toBe(410);
    expect((await json(await s.alice.finalize(id))).state).toBe("done");
  });
});

describe("the failure and resume table", () => {
  it("the connection drops mid-part: nothing is recorded, Resume shows what's missing, the part goes again", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    const dropping = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.subarray(0, 2));
        c.error(new Error("connection reset"));
      },
    });
    const dropped = await s.handler(new Request(`${BASE}/${uploadId}/parts/1`, { method: "PUT", headers: { "x-test-owner": "alice", "content-digest": await digestOf(bytes.subarray(0, 4)) }, body: dropping, duplex: "half" } as RequestInit));
    expect(dropped.status).toBe(503);
    expect((await json<UploadStatus>(await s.alice.resume(uploadId))).parts).toEqual([]);
    expect((await s.alice.part(uploadId, 1, bytes.subarray(0, 4))).status).toBe(200);
  });

  it("the tab closes: Resume gives the parts the server has, and the upload carries on", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    await s.alice.part(uploadId, 1, bytes.subarray(0, 4));
    await s.alice.part(uploadId, 3, bytes.subarray(8));
    const resumed = await json<UploadStatus>(await s.alice.resume(uploadId));
    expect(resumed.parts.map((p) => p.n)).toEqual([1, 3]);
    await s.alice.part(uploadId, 2, bytes.subarray(4, 8));
    expect((await json(await s.alice.finalize(uploadId))).state).toBe("done");
  });

  it("the file changed after create: identity_mismatch, no copy recorded, nothing locked, the assembly removed", async () => {
    const s = setup();
    const declared = bytesOf(10, 1);
    const sent = bytesOf(10, 2);
    const res = await s.alice.create({ name: "a.bin", contentType: "a/b", size: 10, sha256: await sha256Hex(declared), purpose: "media" });
    const { uploadId, partSize } = await json<UploadStatus>(res);
    for (const [i, p] of partsOf(sent, partSize).entries()) await s.alice.part(uploadId, i + 1, p);
    const fin = await s.alice.finalize(uploadId);
    expect(fin.status).toBe(422);
    expect((await json(fin)).code).toBe("identity_mismatch");
    expect(s.working.objects.size).toBe(0);
    expect(s.archive.objects.size).toBe(0);
    expect(s.archive.locks.size).toBe(0);
    expect((await json<UploadStatus>(await s.alice.resume(uploadId))).state).toBe("identity_mismatch");
  });

  it("a big file that changed: the job finds it, and nothing is ever locked", async () => {
    const s = setup();
    const declared = bytesOf(40, 1);
    const { uploadId, partSize } = await json<UploadStatus>(await s.alice.create({ name: "a.bin", contentType: "a/b", size: 40, sha256: await sha256Hex(declared), purpose: "media" }));
    for (const [i, p] of partsOf(bytesOf(40, 2), partSize).entries()) await s.alice.part(uploadId, i + 1, p);
    expect((await s.alice.finalize(uploadId)).status).toBe(202);
    await s.verifyJob({ payload: { uploadId } });
    expect((await json<UploadStatus>(await s.alice.resume(uploadId))).state).toBe("identity_mismatch");
    expect(s.archive.calls.some((c) => c.startsWith("lock"))).toBe(false);
    expect(s.archive.objects.size).toBe(0);
  });

  it("another tab uploads the same file: Create resumes the one open session; other targets make a new one", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const body = { name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" };
    const first = await json<UploadStatus>(await s.alice.create(body));
    await s.alice.part(first.uploadId, 1, bytes.subarray(0, 4));
    const second = await s.alice.create(body);
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({ uploadId: first.uploadId, resumed: true, parts: [{ n: 1 }] });
    const otherTargets = await json<UploadStatus>(await s.alice.create({ ...body, targets: ["working"] }));
    expect(otherTargets.uploadId).not.toBe(first.uploadId);
    expect(otherTargets.targets).toEqual(["working"]);
    // Bob's identical file is his own session, never Alice's.
    expect((await json<UploadStatus>(await s.bob.create(body))).uploadId).not.toBe(first.uploadId);
  });

  it("one target fails at finalize: partial with the copies that verified; finalize again retries only that target", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    s.archive.fail();
    const res = await json<UploadStatus>(await s.alice.finalize(id));
    expect(res.state).toBe("partial");
    expect(res.copies!.map((c) => c.target)).toEqual(["working"]);
    expect(res.failed).toEqual([{ target: "archive", code: "target_error" }]);
    s.archive.heal();
    const readsBefore = s.working.calls.filter((c) => c.startsWith("read")).length;
    const retried = await json<UploadStatus>(await s.alice.finalize(id));
    expect(retried.state).toBe("done");
    expect(retried.copies!.map((c) => c.target)).toEqual(["working", "archive"]);
    // The working copy wasn't read back again for itself, only read once more as the source of the archive's copy.
    expect(s.working.calls.filter((c) => c.startsWith("read")).length - readsBefore).toBe(1);
    expect(s.archive.locks.size).toBe(1);
  });

  it("a store gives a copy back wrong: the read-back refuses that copy, removes it and reports it", async () => {
    const s = setup({ lock: false });
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    s.archive.corrupt(`media/alice/${id}/a.bin`, bytesOf(10, 99));
    const res = await json<UploadStatus>(await s.alice.finalize(id));
    expect(res.state).toBe("partial");
    expect(res.failed).toEqual([{ target: "archive", code: "readback_mismatch" }]);
    expect(s.archive.objects.has(`media/alice/${id}/a.bin`)).toBe(false);
  });

  it("the session expires: every operation is 404, and the sweep aborts it in its target", async () => {
    const s = setup({ sessionTtlSeconds: 60 });
    const bytes = bytesOf(10);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    s.tick(30_000);
    await s.alice.part(uploadId, 1, bytes.subarray(0, 4)); // a part renews the lease
    s.tick(45_000);
    expect((await s.alice.resume(uploadId)).status).toBe(200);
    s.tick(16_000);
    expect((await s.alice.resume(uploadId)).status).toBe(404);
    expect((await s.alice.part(uploadId, 2, bytes.subarray(4, 8))).status).toBe(404);
    expect(await sweepExpiredUploads({ store: s.store, targets: s.targets, now: s.now })).toBe(1);
    expect(s.working.calls.at(-1)).toMatch(/^abort /);
    expect(s.store.sessions.size).toBe(0);
    // A create again starts fresh.
    expect((await s.alice.create({ name: "a", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" })).status).toBe(201);
  });

  it("another owner guesses the id: 404 on every operation, the same answer as an unknown id", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id, parts } = await sendAll(s, bytes);
    const unknown = await (await s.bob.resume("A".repeat(22))).text();
    for (const res of [await s.bob.resume(id), await s.bob.part(id, 1, parts[0]!), await s.bob.finalize(id), await s.bob.abort(id)]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(unknown);
    }
    expect(s.store.sessions.get(id)!.state).toBe("open");
    expect(s.asked.filter((a) => a.owner.id === "bob")).toEqual([]);
    expect((await s.anon.resume(id)).status).toBe(401);
  });

  it("asks the app's rules on every operation, and holds a refusal", async () => {
    let allowFinalize = false;
    const s = setup({ authorize: (ctx) => (ctx.op === "finalize" && !allowFinalize ? { allow: false } : { allow: true, targets: ["working"] }) });
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    expect((await s.alice.finalize(id)).status).toBe(403);
    allowFinalize = true;
    expect((await s.alice.finalize(id)).status).toBe(200);
  });

  it("abort forgets an open session and aborts it in its target; verified copies stay", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const open = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 10, purpose: "media" }));
    expect((await s.alice.abort(open.uploadId)).status).toBe(204);
    expect(s.working.calls.at(-1)).toBe(`abort media/alice/${open.uploadId}/a`);
    expect((await s.alice.resume(open.uploadId)).status).toBe(404);
    const { id } = await sendAll(s, bytes);
    await s.alice.finalize(id);
    expect((await s.alice.abort(id)).status).toBe(204);
    expect(s.archive.objects.has(`media/alice/${id}/a.bin`)).toBe(true);
  });

  it("can't abort while a job is reading the copies back", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(40));
    await s.alice.finalize(id);
    expect((await s.alice.abort(id)).status).toBe(409);
  });
});

describe("recovery", () => {
  it("finalize on a session stuck verifying queues it again (a queue call that failed must not strand it)", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(40));
    // As if finalize assembled it and set verifying, then the queue call failed.
    const session = s.store.sessions.get(id)!;
    await s.working.finish(session.key, session.targetUploadId, session.parts.map((p) => ({ n: p.n, etag: p.etag! })));
    await s.store.update(id, { state: "verifying" });
    expect((await s.alice.finalize(id)).status).toBe(202);
    expect(s.queued).toEqual([id]);
    await s.verifyJob({ payload: { uploadId: id } });
    expect((await json(await s.alice.resume(id))).state).toBe("done");
  });

  it("finalize after an assembly whose answer was lost goes on to verify the object that is there", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    const session = s.store.sessions.get(id)!;
    await s.working.finish(session.key, session.targetUploadId, session.parts.map((p) => ({ n: p.n, etag: p.etag! })));
    const res = await s.alice.finalize(id);
    expect(res.status).toBe(200);
    expect((await json(res)).state).toBe("done");
  });

  it("refuses a storage key a URL would rewrite, and safeName keeps a client's name to one segment", async () => {
    const seen: unknown[] = [];
    const s = setup({ keyFor: ({ name }) => `media/${name}`, onError: (e) => void seen.push(e) });
    expect((await s.alice.create({ name: "../../escape", contentType: "a/b", size: 1, purpose: "media" })).status).toBe(503);
    expect(String(seen[0])).toMatch(/unsafe storage key/);
    expect(s.working.calls).toEqual([]);
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("C:\\photos\\a.jpg")).toBe("a.jpg");
    expect(safeName("..")).toBe("file");
    expect(isSafeKey("media/a/b.jpg")).toBe(true);
    for (const bad of ["", "/abs", "a//b", "a/./b", "a/../b", "a/b/", "a\u0000b"]) expect(isSafeKey(bad), JSON.stringify(bad)).toBe(false);
  });

  it("a part reserved with these bytes: the same bytes again write and complete it; other bytes are refused", async () => {
    const s = setup();
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 4, purpose: "media" }));
    const digest = await digestOf(bytesOf(4));
    expect(await s.store.reservePart(uploadId, { n: 1, size: 4, digest })).toBe("reserved");
    expect(await s.store.reservePart(uploadId, { n: 1, size: 4, digest })).toBe("same");
    expect(await s.store.reservePart(uploadId, { n: 1, size: 4, digest: await digestOf(bytesOf(4, 5)) })).toBe("conflict");
    expect(await s.store.completePart(uploadId, 1, digest, "e1")).toBe(true);
    expect(await s.store.reservePart(uploadId, { n: 1, size: 4, digest })).toBe("received");
    expect(s.store.sessions.get(uploadId)!.parts[0]!.etag).toBe("e1");
  });
});

describe("routing and errors", () => {
  it("answers 405 for a method a path doesn't take, and hides errors behind 503 with onError told", async () => {
    const seen: unknown[] = [];
    const s = setup({
      onError: (e) => {
        seen.push(e);
        throw new Error("logger down");
      },
    });
    expect((await s.handler(new Request(BASE, { headers: { "x-test-owner": "alice" } }))).status).toBe(405);
    expect((await s.handler(new Request("https://app.example.com/elsewhere", { headers: { "x-test-owner": "alice" } }))).status).toBe(404);
    s.working.fail();
    const res = await s.alice.create({ name: "a", contentType: "a/b", size: 1, purpose: "media" });
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe("server_error");
    expect(seen).toHaveLength(1);
  });
});
