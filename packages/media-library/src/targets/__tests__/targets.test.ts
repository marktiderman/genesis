// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import { sha256Stream } from "../../hash";
import { md5 } from "@noble/hashes/legacy.js";
import { toHex } from "../../protocol";
import { createR2Target, type R2BucketLike } from "../r2";
import { createS3Target } from "../s3";
import { copyBetweenTargets, type UploadTarget } from "../target";
import { createMemoryTarget } from "../memory";

const hex = async (b: Uint8Array) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>)));
const bytesOf = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + seed) & 0xff);

/**
 * A small versioned S3 in memory, over fetch: checks every request is signed and that each body
 * matches its x-amz-content-sha256, keeps object versions, and gives multipart ETags as S3 does.
 */
function fakeS3(options: { lockEnabled: boolean; defaultRetention?: boolean }) {
  const versions = new Map<string, Uint8Array>(); // key#version
  const current = new Map<string, string>();
  const markers = new Set<string>();
  const etags = new Map<string, string>(); // key#version
  const uploads = new Map<string, Map<number, Uint8Array>>();
  const retention = new Map<string, string>(); // key#version
  const log: string[] = [];
  let next = 1;
  const readBody = async (body: unknown): Promise<Uint8Array> => {
    if (!body) return new Uint8Array(0);
    if (body instanceof ReadableStream) return new Uint8Array(await new Response(body).arrayBuffer());
    return new Uint8Array(body as Uint8Array);
  };
  const fetch = async (input: URL | string | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = await readBody(init?.body);
    if (!/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/.test(headers.get("authorization") ?? "")) return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    if (headers.get("x-amz-content-sha256") !== (await hex(body))) return new Response("<Error><Code>XAmzContentSHA256Mismatch</Code></Error>", { status: 400 });
    const [, , ...keyParts] = url.pathname.split("/");
    const key = keyParts.map(decodeURIComponent).join("/");
    const q = url.searchParams;
    const v = q.get("versionId") ?? current.get(key);
    log.push(`${method} ${key || "(bucket)"}${[...q.keys()].length ? `?${[...q.keys()].join("&")}` : ""}`);
    if (q.has("object-lock")) {
      if (!options.lockEnabled) return new Response("<Error><Code>ObjectLockConfigurationNotFoundError</Code></Error>", { status: 404 });
      const rule = options.defaultRetention ? "<Rule><DefaultRetention><Mode>COMPLIANCE</Mode><Days>30</Days></DefaultRetention></Rule>" : "";
      return new Response(`<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled>${rule}</ObjectLockConfiguration>`);
    }
    if (method === "POST" && q.has("uploads")) {
      const id = `u${next++}`;
      uploads.set(id, new Map());
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (method === "PUT" && q.has("partNumber")) {
      uploads.get(q.get("uploadId")!)!.set(Number(q.get("partNumber")), body);
      return new Response(null, { headers: { etag: `"${toHex(md5(body))}"` } });
    }
    if (method === "POST" && q.has("uploadId")) {
      const parts = uploads.get(q.get("uploadId")!);
      if (!parts) return new Response("<Error><Code>NoSuchUpload</Code></Error>", { status: 404 });
      const xml = new TextDecoder().decode(body);
      const numbers = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
      const all = numbers.map((n) => parts.get(n)!);
      const out = new Uint8Array(all.reduce((a, b) => a + b.byteLength, 0));
      let at = 0;
      for (const p of all) out.set(p, (at += p.byteLength) - p.byteLength);
      const md5s = new Uint8Array(all.length * 16);
      all.forEach((p, i) => md5s.set(md5(p), i * 16));
      const etag = `"${toHex(md5(md5s))}-${all.length}"`;
      const version = `v${next++}`;
      versions.set(`${key}#${version}`, out);
      etags.set(`${key}#${version}`, etag);
      current.set(key, version);
      markers.delete(key);
      uploads.delete(q.get("uploadId")!);
      return new Response(`<CompleteMultipartUploadResult><ETag>${etag.replace(/"/g, "&quot;")}</ETag></CompleteMultipartUploadResult>`, { headers: { "x-amz-version-id": version } });
    }
    if (method === "DELETE" && q.has("uploadId")) return new Response(null, { status: 204 });
    if (method === "PUT" && q.has("retention")) {
      if (!headers.get("x-amz-checksum-sha256")) return new Response("<Error><Code>InvalidRequest</Code></Error>", { status: 400 });
      retention.set(`${key}#${v}`, new TextDecoder().decode(body));
      return new Response(null);
    }
    const there = v && !(markers.has(key) && !q.get("versionId")) ? versions.get(`${key}#${v}`) : undefined;
    if (method === "GET") return there ? new Response(there as Uint8Array<ArrayBuffer>) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    if (method === "HEAD") return there ? new Response(null, { headers: { "content-length": String(there.byteLength), etag: etags.get(`${key}#${v}`)!, "x-amz-version-id": v! } }) : new Response(null, { status: 404 });
    if (method === "DELETE") {
      if (q.get("versionId")) {
        if (retention.has(`${key}#${v}`)) return new Response("<Error><Code>AccessDenied</Code><Message>locked</Message></Error>", { status: 403 });
        versions.delete(`${key}#${v}`);
        if (current.get(key) === v) current.delete(key);
      } else markers.add(key); // a plain delete on a versioned bucket only adds a delete marker
      return new Response(null, { status: 204 });
    }
    return new Response("<Error><Code>NotImplemented</Code></Error>", { status: 501 });
  };
  return { fetch: fetch as typeof globalThis.fetch, versions, retention, log, markers };
}

const s3 = (fake: ReturnType<typeof fakeS3>, lock = true) =>
  createS3Target({
    endpoint: "https://s3.example.test",
    region: "us-east-1",
    bucket: "media",
    accessKeyId: "AKID",
    secretAccessKey: "secret",
    fetch: fake.fetch,
    now: () => Date.parse("2026-11-01T00:00:00Z"),
    ...(lock ? { objectLock: { mode: "COMPLIANCE", days: 30 } } : {}),
  });

async function sendParts(target: UploadTarget, key: string, bytes: Uint8Array, partSize: number) {
  const id = await target.start(key, { contentType: "application/octet-stream" });
  const receipts = [];
  for (let n = 1, at = 0; at < bytes.byteLength; n++, at += partSize) {
    const p = bytes.subarray(at, at + partSize);
    receipts.push(await target.part(key, id, n, new Response(p as Uint8Array<ArrayBuffer>).body!, { size: p.byteLength, sha256: await hex(p) }));
  }
  return { id, receipts };
}

async function roundTrip(target: UploadTarget, key: string, bytes: Uint8Array, partSize: number) {
  const { id, receipts } = await sendParts(target, key, bytes, partSize);
  const made = await target.finish(key, id, receipts);
  return { ...(await sha256Stream((await target.read(key, made ? made.versionId : undefined))!)), made: made ?? undefined };
}

describe("createS3Target", () => {
  it("streams signed parts, and reads back, locks and deletes the exact version it assembled", async () => {
    const fake = fakeS3({ lockEnabled: true });
    const target = s3(fake);
    const bytes = bytesOf(23);
    const got = await roundTrip(target, "media/a 1/x.bin", bytes, 10);
    expect({ sha256: got.sha256, size: got.size }).toEqual({ sha256: await hex(bytes), size: 23 });
    expect(got.made!.versionId).toMatch(/^v\d+$/);
    expect(got.made!.etag).toMatch(/^"[0-9a-f]{32}-3"$/);
    expect(target.tier).toBe("archive");
    expect(await target.head("media/a 1/x.bin")).toEqual({ size: 23 });
    expect(fake.retention.size).toBe(0);
    expect(await target.lock!("media/a 1/x.bin", got.made!.versionId)).toEqual({ mode: "COMPLIANCE", retainUntil: "2026-12-01T00:00:00Z" });
    expect(fake.retention.get(`media/a 1/x.bin#${got.made!.versionId}`)).toContain("<Mode>COMPLIANCE</Mode><RetainUntilDate>2026-12-01T00:00:00Z</RetainUntilDate>");
    expect(fake.log.slice(0, 2)).toEqual(["GET (bucket)?object-lock", "POST media/a 1/x.bin?uploads"]);
    expect(fake.log).toContain("PUT media/a 1/x.bin?retention&versionId");
    // Under retention, that version can't be deleted.
    await expect(target.delete("media/a 1/x.bin", got.made!.versionId)).rejects.toThrow(/403/);
  });

  it("deletes an unverified assembly by its version, not with a delete marker", async () => {
    const fake = fakeS3({ lockEnabled: true });
    const target = s3(fake);
    const got = await roundTrip(target, "k", bytesOf(6), 6);
    await target.delete("k", got.made!.versionId);
    expect(fake.versions.size).toBe(0);
    expect(fake.markers.size).toBe(0);
  });

  it("refuses a bucket with a default retention, which would lock unverified assemblies", async () => {
    const target = s3(fakeS3({ lockEnabled: true, defaultRetention: true }));
    await expect(target.start("k", { contentType: "a/b" })).rejects.toThrow(/default retention/);
  });

  it("says a key holds this upload's assembly only when its ETag is exactly these parts'", async () => {
    const fake = fakeS3({ lockEnabled: false });
    const target = s3(fake, false);
    const mine = await sendParts(target, "k", bytesOf(12, 1), 6);
    await target.finish("k", mine.id, mine.receipts);
    expect(await target.assembled!("k", mine.id, mine.receipts)).toMatchObject({ versionId: expect.any(String) });
    const other = await sendParts(target, "k2", bytesOf(12, 2), 6);
    await target.finish("k2", other.id, other.receipts);
    expect(await target.assembled!("k", mine.id, other.receipts)).toBeUndefined();
    expect(await target.assembled!("nothing-here", mine.id, mine.receipts)).toBeUndefined();
  });

  it("refuses a part whose bytes don't match the SHA-256 it was signed with", async () => {
    const target = s3(fakeS3({ lockEnabled: false }), false);
    const id = await target.start("k", { contentType: "a/b" });
    await expect(target.part("k", id, 1, bytesOf(4, 1), { size: 4, sha256: await hex(bytesOf(4, 2)) })).rejects.toThrow(/400/);
  });

  it("refuses a key with an empty, . or .. segment (URL parsing would address another object)", async () => {
    const target = s3(fakeS3({ lockEnabled: false }), false);
    for (const key of ["a/../b", "a/./b", "a//b", "/a"]) await expect(target.read(key), key).rejects.toThrow(/segment/);
  });

  it("refuses to start when the bucket has no Object Lock but the target is meant to lock", async () => {
    const target = s3(fakeS3({ lockEnabled: false }));
    await expect(target.start("k", { contentType: "a/b" })).rejects.toThrow(/Object Lock/);
  });

  it("locks nothing without objectLock, and reports a missing object as null", async () => {
    const fake = fakeS3({ lockEnabled: false });
    const target = s3(fake, false);
    const got = await roundTrip(target, "k", bytesOf(5), 5);
    expect(await target.lock!("k")).toBeUndefined();
    expect(await target.read("nope")).toBeNull();
    expect(await target.head("nope")).toBeNull();
    await target.delete("k", got.made!.versionId);
    expect(fake.versions.size).toBe(0);
  });
});

describe("createR2Target", () => {
  it("drives the binding's multipart upload", async () => {
    const stored = new Map<string, Uint8Array>();
    const pending = new Map<string, Map<number, Uint8Array>>();
    const bucket: R2BucketLike = {
      createMultipartUpload: async (key, o) => {
        expect(o?.httpMetadata?.contentType).toBe("image/jpeg");
        pending.set(`${key}#1`, new Map());
        return { uploadId: "1" };
      },
      resumeMultipartUpload: (key, id) => ({
        uploadPart: async (n, v) => (pending.get(`${key}#${id}`)!.set(n, v instanceof Uint8Array ? v.slice() : new Uint8Array(await new Response(v).arrayBuffer())), { partNumber: n, etag: `e${n}` }),
        complete: async (parts) => {
          const p = pending.get(`${key}#${id}`)!;
          const all = parts.map((x) => p.get(x.partNumber)!);
          const out = new Uint8Array(all.reduce((a, b) => a + b.byteLength, 0));
          let at = 0;
          for (const c of all) out.set(c, (at += c.byteLength) - c.byteLength);
          stored.set(key, out);
        },
        abort: async () => void pending.delete(`${key}#${id}`),
      }),
      get: async (key) => (stored.has(key) ? { body: new Response(stored.get(key)! as Uint8Array<ArrayBuffer>).body! } : null),
      head: async (key) => (stored.has(key) ? { size: stored.get(key)!.byteLength } : null),
      delete: async (key) => void stored.delete(key),
    };
    const target = createR2Target(bucket);
    expect(target.minPart).toBe(5 * 1024 * 1024);
    const id = await target.start("k", { contentType: "image/jpeg" });
    const a = await target.part("k", id, 1, bytesOf(3), { size: 3, sha256: await hex(bytesOf(3)) });
    const b = await target.part("k", id, 2, bytesOf(2, 9), { size: 2, sha256: await hex(bytesOf(2, 9)) });
    await target.finish("k", id, [a, b]);
    expect(await target.head("k")).toEqual({ size: 5 });
    expect((await sha256Stream((await target.read("k"))!)).size).toBe(5);
    expect(target.lock).toBeUndefined();
  });
});

describe("copyBetweenTargets", () => {
  it("copies that version a part at a time into another store, at that store's part sizes", async () => {
    const from = createMemoryTarget({ minPart: 1 });
    const to = createMemoryTarget({ minPart: 4, maxPart: 4 });
    const bytes = bytesOf(10);
    const got = await roundTrip(from, "k", bytes, 3);
    const uploadId = await to.start("k", { contentType: "a/b" });
    const made = await copyBetweenTargets(from, to, "k", { partSize: 3, uploadId, versionId: got.made!.versionId });
    expect([...to.objects.get("k")!]).toEqual([...bytes]);
    expect(made).toMatchObject({ versionId: expect.any(String) });
    expect(to.calls.filter((c) => c.startsWith("part"))).toEqual(["part k 1", "part k 2", "part k 3"]);
  });

  it("aborts the copy when the source is gone or the write fails", async () => {
    const from = createMemoryTarget();
    const to = createMemoryTarget();
    await expect(copyBetweenTargets(from, to, "missing", { partSize: 4, uploadId: await to.start("missing", { contentType: "a/b" }) })).rejects.toThrow(/missing/);
    await roundTrip(from, "k", bytesOf(4), 4);
    const failing = { ...to, part: async () => Promise.reject(new Error("down")) };
    await expect(copyBetweenTargets(from, failing, "k", { partSize: 4, uploadId: await to.start("k", { contentType: "a/b" }) })).rejects.toThrow(/down/);
    expect(to.calls.at(-1)).toBe("abort k");
  });
});
