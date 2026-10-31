/** The Web Worker's work, apart from the worker, so it can be tested anywhere. */
import { createNobleSha256 } from "../hash";
import { toHex } from "../protocol";

/** What the page sends the hash worker. */
export interface HashRequest {
  id: number;
  blob: Blob;
}
/** What the hash worker sends back: progress, then the digest or an error. */
export type HashReply = { id: number; bytes: number } | { id: number; sha256: string } | { id: number; error: string };

/** Hashes a blob a slice at a time, telling `post` how far it got. */
export async function hashBlob(request: HashRequest, post: (reply: HashReply) => void, chunk = 4 * 1024 * 1024): Promise<void> {
  try {
    const h = createNobleSha256();
    for (let at = 0; at < request.blob.size; at += chunk) {
      const bytes = new Uint8Array(await request.blob.slice(at, at + chunk).arrayBuffer());
      h.update(bytes);
      post({ id: request.id, bytes: at + bytes.byteLength });
    }
    post({ id: request.id, sha256: toHex(h.digest()) });
  } catch (e) {
    post({ id: request.id, error: e instanceof Error ? e.message : String(e) });
  }
}
