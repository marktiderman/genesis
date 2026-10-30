import { toBase64, toHex, type UploadOwner } from "../../protocol";
import { createMemoryTarget, type MemoryTarget } from "../../targets/memory";
import { createUploadHandler, type ReadableObject, type UploadAuthorizeContext, type UploadHandlerOptions } from "../handler";
import { createMemorySessionStore } from "../store";
import { createUploadVerifyJob } from "../verify";

export const BASE = "https://app.example.com/uploads";
export const ALICE: UploadOwner = { kind: "person", id: "alice" };
export const BOB: UploadOwner = { kind: "person", id: "bob" };

export const bytesOf = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 0xff);

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)));
}
export async function digestOf(bytes: Uint8Array): Promise<string> {
  return `sha-256=:${toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)))}:`;
}

/** A handler over memory targets and a memory store, with a clock and a queue the test drives. */
export function setup(over: Partial<UploadHandlerOptions> & { lock?: boolean; readableObjects?: ReadableObject[] } = {}) {
  let clock = Date.parse("2026-11-01T00:00:00Z");
  const now = () => clock;
  const working = createMemoryTarget({ minPart: 4, now });
  const archive = createMemoryTarget({ minPart: 4, now, tier: "archive", ...(over.lock === false ? {} : { lock: { mode: "COMPLIANCE", days: 3650 } }) });
  const targets: Record<string, MemoryTarget> = { working, archive };
  const store = createMemorySessionStore();
  const queued: string[] = [];
  const asked: UploadAuthorizeContext[] = [];
  const readableCalls: { owner: UploadOwner; sha256: string }[] = [];
  const handler = createUploadHandler({
    store,
    targets,
    now,
    owner: (request) => {
      const who = request.headers.get("x-test-owner");
      return who ? { kind: "person", id: who } : null;
    },
    authorize: (ctx) => {
      asked.push(ctx);
      return { allow: true, targets: ["working", "archive"] };
    },
    keyFor: ({ owner, uploadId, name }) => `media/${owner.id}/${uploadId}/${name}`,
    readable: async ({ owner, sha256 }) => {
      readableCalls.push({ owner, sha256 });
      return owner.id === "alice" ? (over.readableObjects ?? []) : [];
    },
    enqueueVerify: async (id) => void queued.push(id),
    verifyInlineBytes: 16,
    ...over,
  });
  const verifyJob = createUploadVerifyJob({ store, targets, now });
  const as = (owner: UploadOwner | null) => ({
    create: (body: Record<string, unknown>) => handler(new Request(BASE, { method: "POST", headers: hdr(owner, { "content-type": "application/json" }), body: JSON.stringify(body) })),
    resume: (id: string) => handler(new Request(`${BASE}/${id}`, { headers: hdr(owner) })),
    part: async (id: string, n: number, bytes: Uint8Array, digest?: string) =>
      handler(new Request(`${BASE}/${id}/parts/${n}`, { method: "PUT", headers: hdr(owner, { "content-digest": digest ?? (await digestOf(bytes)), "content-length": String(bytes.byteLength) }), body: bytes as Uint8Array<ArrayBuffer> })),
    finalize: (id: string, body: Record<string, unknown> = {}) => handler(new Request(`${BASE}/${id}/finalize`, { method: "POST", headers: hdr(owner, { "content-type": "application/json" }), body: JSON.stringify(body) })),
    abort: (id: string) => handler(new Request(`${BASE}/${id}`, { method: "DELETE", headers: hdr(owner) })),
  });
  return {
    handler,
    store,
    targets,
    working,
    archive,
    queued,
    asked,
    readableCalls,
    verifyJob,
    tick: (ms: number) => void (clock += ms),
    now,
    alice: as(ALICE),
    bob: as(BOB),
    anon: as(null),
  };
}

function hdr(owner: UploadOwner | null, extra: Record<string, string> = {}): Record<string, string> {
  return { ...(owner ? { "x-test-owner": owner.id } : {}), ...extra };
}

/** Splits bytes as the server's part plan does. */
export function partsOf(bytes: Uint8Array, partSize: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength || out.length === 0; at += partSize) out.push(bytes.subarray(at, at + partSize));
  return out;
}

/** Creates, sends every part and returns the session id. */
export async function sendAll(s: ReturnType<typeof setup>, bytes: Uint8Array, over: Record<string, unknown> = {}) {
  const res = await s.alice.create({ name: "a.bin", contentType: "application/octet-stream", size: bytes.byteLength, sha256: await sha256Hex(bytes), purpose: "media", ...over });
  const status = (await res.json()) as { uploadId: string; partSize: number };
  const parts = partsOf(bytes, status.partSize);
  for (const [i, p] of parts.entries()) {
    const r = await s.alice.part(status.uploadId, i + 1, p);
    if (r.status !== 200) throw new Error(`part ${i + 1}: ${r.status} ${await r.text()}`);
  }
  return { id: status.uploadId, partSize: status.partSize, parts };
}
