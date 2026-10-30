/**
 * Incremental SHA-256. WebCrypto's `digest` takes the whole input at once,
 * so a file or a stored object is hashed piece by piece here: with
 * `@noble/hashes` by default (audited, plain JS, runs on Hermes, no wasm),
 * Node's `node:crypto` when it is there, and a Worker's `DigestStream` for a
 * stream on Workers.
 */
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { toHex } from "./protocol";

/** An incremental SHA-256: feed it bytes, then read the digest once. */
export interface Sha256 {
  update(bytes: Uint8Array): void;
  digest(): Uint8Array;
}

/** Makes a fresh incremental SHA-256. Pass another (hash-wasm, say) through a client's `hash` option. */
export type CreateSha256 = () => Sha256;

/** The default: `@noble/hashes`. */
export const createNobleSha256: CreateSha256 = () => {
  const h = nobleSha256.create();
  return { update: (b) => void h.update(b), digest: () => h.digest() };
};

type NodeCrypto = { createHash(algo: "sha256"): { update(b: Uint8Array): unknown; digest(): Uint8Array } };

/** Node's `node:crypto`, when this runs on Node (found without importing it, so bundles for other runtimes don't break). */
function nodeCrypto(): NodeCrypto | undefined {
  const p = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  try {
    return p?.getBuiltinModule?.("node:crypto") as NodeCrypto | undefined;
  } catch {
    return undefined;
  }
}

/** The fastest incremental SHA-256 on this runtime: Node's, else `@noble/hashes`. */
export const createSha256: CreateSha256 = () => {
  const node = nodeCrypto();
  if (!node) return createNobleSha256();
  const h = node.createHash("sha256");
  return { update: (b) => void h.update(b), digest: () => new Uint8Array(h.digest()) };
};

/** A digest of bytes already in memory (one part): WebCrypto, everywhere. */
export async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
}

type DigestStreamCtor = new (algorithm: string) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };

/**
 * Reads a stream to its end and returns its SHA-256 (hex) and its length:
 * a Worker's `DigestStream` when there is one, else `createHash` (default
 * the fastest here). Memory stays at one chunk.
 */
export async function sha256Stream(stream: ReadableStream<Uint8Array>, hash: CreateSha256 = createSha256): Promise<{ sha256: string; size: number }> {
  let size = 0;
  const DigestStream = (crypto as unknown as { DigestStream?: DigestStreamCtor }).DigestStream;
  if (DigestStream) {
    const sink = new DigestStream("SHA-256");
    const counted = stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, c) {
          size += chunk.byteLength;
          c.enqueue(chunk);
        },
      }),
    );
    await counted.pipeTo(sink);
    return { sha256: toHex(new Uint8Array(await sink.digest)), size };
  }
  const h = hash();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    h.update(value);
  }
  return { sha256: toHex(h.digest()), size };
}
