// @feat:media-resumable-uploads
// The races from the re-review of #550: an abort during a finalize, and a part written twice.
import { describe, expect, it } from "vitest";
import type { UploadStatus } from "../../protocol";
import type { PartReceipt } from "../../targets/target";
import { sweepExpiredUploads } from "../verify";
import { bytesOf, digestOf, sendAll, setup, sha256Hex } from "./helpers";

const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

/** A promise the test resolves: `wait` until `open()` is called. */
function gate() {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

/** Resolves once `check` is true, giving the handler's awaits a turn each time. */
async function until(check: () => boolean) {
  for (let i = 0; i < 1000 && !check(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!check()) throw new Error("timed out");
}

describe("an abort racing a finalize never leaves an object without its session", () => {
  it("an abort while the object is being assembled is refused, and the upload finishes", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const finish = s.working.finish;
    const g = gate();
    let assembling = false;
    s.working.finish = async (key, uploadId, parts) => {
      assembling = true;
      await g.wait;
      return finish(key, uploadId, parts);
    };
    const finalizing = s.alice.finalize(id);
    await until(() => assembling);
    expect((await s.alice.abort(id)).status).toBe(409);
    g.open();
    expect((await json<UploadStatus>(await finalizing)).state).toBe("done");
    expect(s.store.sessions.get(id)!.state).toBe("done");
  });

  it("the store's answer to the assembly comes back after an abort: the object goes too", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const { id } = await sendAll(s, bytes);
    const finish = s.working.finish;
    const g = gate();
    let assembled = false;
    s.working.finish = async (key, uploadId, parts) => {
      const made = await finish(key, uploadId, parts);
      assembled = true;
      // The object exists; the answer is slow, long enough for the run's lease to lapse.
      await g.wait;
      return made;
    };
    const finalizing = s.alice.finalize(id);
    await until(() => assembled);
    s.tick(2 * 3600_000);
    // Stuck by now (no live lease for over an hour): the abort may remove it.
    expect((await s.alice.abort(id)).status).toBe(204);
    g.open();
    expect((await finalizing).status).toBe(404);
    expect(s.store.sessions.size).toBe(0);
    expect(s.working.objects.size).toBe(0);
    expect(s.working.openUploads.size).toBe(0);
    expect(s.archive.locks.size).toBe(0);
  });

  it("an abort that removes the session just before finalize leaves it: nothing is assembled, and finalize is 404", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const update = s.store.update;
    s.store.update = async (uploadId, patch, when, holder) => {
      // The abort lands between finalize's load and its move out of `open`.
      if (patch.state === "verifying" && when?.includes("open")) expect((await s.alice.abort(uploadId)).status).toBe(204);
      return update(uploadId, patch, when, holder);
    };
    const res = await s.alice.finalize(id);
    expect(res.status).toBe(404);
    expect(s.working.calls.some((c) => c.startsWith("finish"))).toBe(false);
    expect(s.working.objects.size).toBe(0);
    expect(s.working.openUploads.size).toBe(0);
    expect(s.store.sessions.size).toBe(0);
  });

  it("an assembly that fails leaves the session verifying, and the next finalize assembles it", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    s.working.fail();
    expect((await s.alice.finalize(id)).status).toBe(503);
    expect(s.store.sessions.get(id)!.state).toBe("verifying");
    // The failed run gave its lease back, so a retry needn't wait for it.
    expect(s.store.sessions.get(id)!.leaseUntil).toBeUndefined();
    s.working.heal();
    expect((await json<UploadStatus>(await s.alice.finalize(id))).state).toBe("done");
  });

  it("the sweep removes the object a dead run assembled and never recorded", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const session = s.store.sessions.get(id)!;
    // As if a run assembled it and died before it saved that.
    await s.working.finish(session.key, session.targetUploadId, session.parts.map((p) => ({ n: p.n, etag: p.etag! })));
    await s.store.update(id, { state: "verifying", verifyingSince: new Date(s.now()).toISOString() });
    s.tick(2 * 3600_000);
    expect(await sweepExpiredUploads({ store: s.store, targets: s.targets, now: s.now })).toBe(1);
    expect(s.working.objects.size).toBe(0);
  });
});

describe("a part written by two requests at once with the same bytes", () => {
  it("the second writer failing doesn't release the first writer's reservation", async () => {
    const s = setup();
    const bytes = bytesOf(4);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 4, purpose: "media" }));
    const part = s.working.part;
    const g = gate();
    let calls = 0;
    s.working.part = async (key, mpu, n, body, info): Promise<PartReceipt> => {
      calls++;
      if (calls === 1) {
        // The first writer (it reserved the part) is slow.
        const receipt = await part(key, mpu, n, body, info);
        await g.wait;
        return receipt;
      }
      throw new Error("connection reset"); // the second writer ("same") fails
    };
    const first = s.alice.part(uploadId, 1, bytes);
    await until(() => calls === 1);
    expect((await s.alice.part(uploadId, 1, bytes)).status).toBe(503);
    // The reservation is still there for the first writer.
    expect(s.store.sessions.get(uploadId)!.parts).toEqual([{ n: 1, size: 4, digest: await digestOf(bytes), etag: null }]);
    g.open();
    expect((await first).status).toBe(200);
    expect(s.store.sessions.get(uploadId)!.parts[0]!.etag).not.toBeNull();
  });

  it("the first writer failing gives the reservation back; the second answers 409 part_conflict, not 410, and the part can go again", async () => {
    const s = setup();
    const bytes = bytesOf(4);
    const { uploadId } = await json<UploadStatus>(await s.alice.create({ name: "a", contentType: "a/b", size: 4, purpose: "media" }));
    const part = s.working.part;
    const first = gate();
    const second = gate();
    let calls = 0;
    s.working.part = async (key, mpu, n, body, info): Promise<PartReceipt> => {
      calls++;
      if (calls === 1) {
        await first.wait;
        throw new Error("connection reset"); // the writer that reserved it fails
      }
      if (calls === 2) {
        const receipt = await part(key, mpu, n, body, info);
        await second.wait; // the "same" writer finishes writing after the release
        return receipt;
      }
      return part(key, mpu, n, body, info);
    };
    const w1 = s.alice.part(uploadId, 1, bytes);
    await until(() => calls === 1);
    const w2 = s.alice.part(uploadId, 1, bytes);
    await until(() => calls === 2);
    first.open();
    expect((await w1).status).toBe(503);
    expect(s.store.sessions.get(uploadId)!.parts).toEqual([]);
    second.open();
    const res = await w2;
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("part_conflict");
    expect(s.store.sessions.get(uploadId)!.state).toBe("open");
    // Sent again, the part is recorded, and the upload finishes.
    expect((await s.alice.part(uploadId, 1, bytes)).status).toBe(200);
    expect((await json<UploadStatus>(await s.alice.finalize(uploadId, { sha256: await sha256Hex(bytes) }))).state).toBe("done");
  });
});
