// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import type { UploadStatus } from "../../protocol";
import { bytesOf, partsOf, setup, sha256Hex } from "./helpers";

const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

/** Alice uploads under a content-addressed key; the test returns her key and copies. */
async function aliceUploads(s: ReturnType<typeof setup>, bytes: Uint8Array) {
  const created = await json<UploadStatus>(await s.alice.create({ name: "a.jpg", contentType: "image/jpeg", size: bytes.byteLength, sha256: await sha256Hex(bytes), purpose: "media" }));
  for (const [i, p] of partsOf(bytes, created.partSize).entries()) await s.alice.part(created.uploadId, i + 1, p);
  const done = await json<UploadStatus>(await s.alice.finalize(created.uploadId));
  expect(done.state).toBe("done");
  return done;
}

describe("storage keys are one upload's own (content-addressed keyFor)", () => {
  it("Bob declaring Alice's SHA-256 and size and sending junk gets identity_mismatch, and Alice's object stays", async () => {
    const s = setup({ keyFor: ({ sha256 }) => `media/${sha256 ?? "unknown"}` });
    const bytes = bytesOf(10, 1);
    const alice = await aliceUploads(s, bytes);
    const aliceKey = alice.copies![0]!.key;
    const bob = await json<UploadStatus>(await s.bob.create({ name: "x.jpg", contentType: "image/jpeg", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    for (const [i, p] of partsOf(bytesOf(10, 99), bob.partSize).entries()) await s.bob.part(bob.uploadId, i + 1, p);
    const fin = await s.bob.finalize(bob.uploadId);
    expect(fin.status).toBe(422);
    expect([...s.working.objects.get(aliceKey)!]).toEqual([...bytes]);
    expect([...s.archive.objects.get(aliceKey)!]).toEqual([...bytes]);
    expect(s.store.sessions.get(bob.uploadId)!.key).not.toBe(aliceKey);
  });

  it("Bob can't get `done` by a finish whose answer was 'lost' while Alice's object sits at the key", async () => {
    const s = setup({ keyFor: ({ sha256 }) => `media/${sha256 ?? "unknown"}` });
    const bytes = bytesOf(10, 1);
    await aliceUploads(s, bytes);
    const bob = await json<UploadStatus>(await s.bob.create({ name: "x.jpg", contentType: "image/jpeg", size: 10, sha256: await sha256Hex(bytes), purpose: "media" }));
    for (const [i, p] of partsOf(bytesOf(10, 99), bob.partSize).entries()) await s.bob.part(bob.uploadId, i + 1, p);
    // The store's answer to Bob's finish is lost.
    const finish = s.working.finish;
    s.working.finish = async () => {
      throw new Error("connection reset");
    };
    const fin = await s.bob.finalize(bob.uploadId);
    s.working.finish = finish;
    expect(fin.status).not.toBe(200);
    expect((await json<UploadStatus>(await s.bob.resume(bob.uploadId))).state).not.toBe("done");
    expect(s.archive.locks.size).toBe(1); // Alice's only
  });
});
