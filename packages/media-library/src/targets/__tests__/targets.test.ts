// @feat:media-resumable-uploads
import { describe, expect, it } from "vitest";
import { sha256Stream } from "../../hash";
import { toHex } from "../../protocol";
import { createR2Target, type R2BucketLike } from "../r2";
import { createS3Target } from "../s3";
import { copyBetweenTargets, type UploadTarget } from "../target";
import { createMemoryTarget } from "../memory";

const hex = async (b: Uint8Array) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>)));
const bytesOf = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + seed) & 0xff);

/** A small S3 in memory, over fetch: checks every request is signed, and that each body matches its x-amz-content-sha256. */
function fakeS3(options: { lockEnabled: boolean }) {
  const objects = new Map<string, Uint8Array>();
  const uploads = new Map<string, Map<number, Uint8Array>>();
  const retention = new Map<string, string>();
  const log: string[] = [];
  let next = 1;
  const fetch = async (input: URL | string | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? new Uint8Array(init.body as Uint8Array) : new Uint8Array(0);
    if (!/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/.test(headers.get("authorization") ?? "")) return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    if (headers.get("x-amz-content-sha256") !== (await hex(body))) return new Response("<Error><Code>XAmzContentSHA256Mismatch</Code></Error>", { status: 400 });
    const [, , ...keyParts] = url.pathname.split("/");
    const key = keyParts.map(decodeURIComponent).join("/");
    const q = url.searchParams;
    log.push(`${method} ${key || "(bucket)"}${[...q.keys()].length ? `?${[...q.keys()].join("&")}` : ""}`);
    if (q.has("object-lock")) return options.lockEnabled ? new Response("<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>") : new Response("<Error><Code>ObjectLockConfigurationNotFoundError</Code></Error>", { status: 404 });
    if (method === "POST" && q.has("uploads")) {
      const id = `u${next++}`;
      uploads.set(id, new Map());
      return new Response(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (method === "PUT" && q.has("partNumber")) {
      uploads.get(q.get("uploadId")!)!.set(Number(q.get("partNumber")), body);
      return new Response(null, { headers: { etag: `"etag-${q.get("partNumber")}"` } });
    }
    if (method === "POST" && q.has("uploadId")) {
      const parts = uploads.get(q.get("uploadId")!)!;
      const xml = new TextDecoder().decode(body);
      const numbers = [...xml.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
      const all = numbers.map((n) => parts.get(n)!);
      const out = new Uint8Array(all.reduce((a, b) => a + b.byteLength, 0));
      let at = 0;
      for (const p of all) out.set(p, (at += p.byteLength) - p.byteLength);
      objects.set(key, out);
      return new Response("<CompleteMultipartUploadResult/>");
    }
    if (method === "DELETE" && q.has("uploadId")) return new Response(null, { status: 204 });
    if (method === "PUT" && q.has("retention")) {
      if (!headers.get("x-amz-checksum-sha256")) return new Response("<Error><Code>InvalidRequest</Code></Error>", { status: 400 });
      retention.set(key, new TextDecoder().decode(body));
      return new Response(null);
    }
    if (method === "GET") return objects.has(key) ? new Response(objects.get(key)! as Uint8Array<ArrayBuffer>) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    if (method === "HEAD") return objects.has(key) ? new Response(null, { headers: { "content-length": String(objects.get(key)!.byteLength) } }) : new Response(null, { status: 404 });
    if (method === "DELETE") {
      if (retention.has(key)) return new Response("<Error><Code>AccessDenied</Code><Message>locked</Message></Error>", { status: 403 });
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response("<Error><Code>NotImplemented</Code></Error>", { status: 501 });
  };
  return { fetch: fetch as typeof globalThis.fetch, objects, retention, log };
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

async function roundTrip(target: UploadTarget, key: string, bytes: Uint8Array, partSize: number) {
  const id = await target.start(key, { contentType: "application/octet-stream" });
  const receipts = [];
  for (let n = 1, at = 0; at < bytes.byteLength; n++, at += partSize) receipts.push(await target.part(key, id, n, bytes.subarray(at, at + partSize)));
  await target.finish(key, id, receipts);
  return sha256Stream((await target.read(key))!);
}

describe("createS3Target", () => {
  it("uploads in signed parts, reads back, and sets the retention only when asked, after the fact", async () => {
    const fake = fakeS3({ lockEnabled: true });
    const target = s3(fake);
    const bytes = bytesOf(23);
    const got = await roundTrip(target, "media/a 1/x.bin", bytes, 10);
    expect(got).toEqual({ sha256: await hex(bytes), size: 23 });
    expect(await target.head("media/a 1/x.bin")).toEqual({ size: 23 });
    expect(fake.retention.size).toBe(0);
    expect(await target.lock!("media/a 1/x.bin")).toEqual({ mode: "COMPLIANCE", retainUntil: "2026-12-01T00:00:00Z" });
    expect(fake.retention.get("media/a 1/x.bin")).toContain("<Mode>COMPLIANCE</Mode><RetainUntilDate>2026-12-01T00:00:00Z</RetainUntilDate>");
    expect(fake.log.slice(0, 2)).toEqual(["GET (bucket)?object-lock", "POST media/a 1/x.bin?uploads"]);
    // Under retention, it can't be deleted.
    await expect(target.delete("media/a 1/x.bin")).rejects.toThrow(/403/);
  });

  it("refuses to start when the bucket has no Object Lock but the target is meant to lock", async () => {
    const target = s3(fakeS3({ lockEnabled: false }));
    await expect(target.start("k", { contentType: "a/b" })).rejects.toThrow(/Object Lock/);
  });

  it("locks nothing without objectLock, and reports a missing object as null", async () => {
    const fake = fakeS3({ lockEnabled: false });
    const target = s3(fake, false);
    await roundTrip(target, "k", bytesOf(5), 5);
    expect(await target.lock!("k")).toBeUndefined();
    expect(await target.read("nope")).toBeNull();
    expect(await target.head("nope")).toBeNull();
    await target.delete("k");
    expect(fake.objects.size).toBe(0);
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
        uploadPart: async (n, v) => (pending.get(`${key}#${id}`)!.set(n, v.slice()), { partNumber: n, etag: `e${n}` }),
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
    const a = await target.part("k", id, 1, bytesOf(3));
    const b = await target.part("k", id, 2, bytesOf(2, 9));
    await target.finish("k", id, [a, b]);
    expect(await target.head("k")).toEqual({ size: 5 });
    expect((await sha256Stream((await target.read("k"))!)).size).toBe(5);
    expect(target.lock).toBeUndefined();
  });
});

describe("copyBetweenTargets", () => {
  it("copies a part at a time into another store, at that store's part sizes", async () => {
    const from = createMemoryTarget({ minPart: 1 });
    const to = createMemoryTarget({ minPart: 4, maxPart: 4 });
    const bytes = bytesOf(10);
    await roundTrip(from, "k", bytes, 3);
    await copyBetweenTargets(from, to, "k", { contentType: "a/b", partSize: 3 });
    expect([...to.objects.get("k")!]).toEqual([...bytes]);
    expect(to.calls.filter((c) => c.startsWith("part"))).toEqual(["part k 1", "part k 2", "part k 3"]);
  });

  it("aborts the copy when the source is gone or the write fails", async () => {
    const from = createMemoryTarget();
    const to = createMemoryTarget();
    await expect(copyBetweenTargets(from, to, "missing", { contentType: "a/b", partSize: 4 })).rejects.toThrow(/missing/);
    await roundTrip(from, "k", bytesOf(4), 4);
    const failing = { ...to, part: async () => Promise.reject(new Error("down")) };
    await expect(copyBetweenTargets(from, failing, "k", { contentType: "a/b", partSize: 4 })).rejects.toThrow(/down/);
    expect(to.calls.at(-1)).toBe("abort k");
  });
});
