// @feat:media-resumable-uploads
// Follow-ups from the re-reviews of #550: each of these failed before its fix.
import { describe, expect, it } from "vitest";
import { BASE, bytesOf, digestOf, sendAll, setup, sha256Hex } from "./helpers";

describe("a short part", () => {
  it("is 409 part_size when the store refuses the short body, not a 503", async () => {
    const s = setup();
    const bytes = bytesOf(10);
    const res = await s.alice.create({ name: "a.bin", contentType: "a/b", size: 10, sha256: await sha256Hex(bytes), purpose: "media" });
    const { uploadId, partSize } = (await res.json()) as { uploadId: string; partSize: number };
    // An S3-like store: it reads the whole body, then refuses one that isn't the length it was told.
    const part = s.working.part;
    s.working.part = async (key, id, n, body, meta) => {
      const got = body instanceof Uint8Array ? body.byteLength : (await new Response(body as ReadableStream<Uint8Array<ArrayBuffer>>).arrayBuffer()).byteLength;
      if (got !== meta.size) throw new Error("IncompleteBody");
      return part(key, id, n, new Response(new Uint8Array(got)).body!, meta);
    };
    const full = bytes.subarray(0, partSize);
    const short = full.subarray(0, full.byteLength - 1);
    // No content-length: the body just ends early (a dropped connection, a client bug).
    const r = await s.handler(new Request(`${BASE}/${uploadId}/parts/1`, { method: "PUT", headers: { "x-test-owner": "alice", "content-digest": await digestOf(full) }, body: short as Uint8Array<ArrayBuffer> }));
    expect(r.status).toBe(409);
    expect(((await r.json()) as { code: string }).code).toBe("part_size");
    // The reservation was given back: the right bytes go through.
    s.working.part = part;
    expect((await s.alice.part(uploadId, 1, full)).status).toBe(200);
  });
});

describe("finalize while verifying", () => {
  it("doesn't queue another verify while a run holds a live lease, and does once it lapses", async () => {
    const s = setup();
    const bytes = bytesOf(40);
    const { id } = await sendAll(s, bytes);
    expect((await s.alice.finalize(id)).status).toBe(202);
    expect(s.queued).toEqual([id]);
    // A run has the lease for the next minute.
    s.store.sessions.get(id)!.leaseUntil = new Date(s.now() + 60_000).toISOString();
    const again = await s.alice.finalize(id);
    expect(again.status).toBe(202);
    expect(((await again.json()) as { state: string }).state).toBe("verifying");
    expect(s.queued).toEqual([id]);
    // The run died and its lease lapsed: finalize queues it again.
    s.tick(61_000);
    expect((await s.alice.finalize(id)).status).toBe(202);
    expect(s.queued).toEqual([id, id]);
  });
});
