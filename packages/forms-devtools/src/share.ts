import type { FormDefinition, FormEvent, Json } from "@marktiderman/genesis-forms";

/** What a share link carries. It lives in the URL hash, so it never reaches a server. */
export interface SharePayload {
  v: 1;
  definition: FormDefinition;
  events?: FormEvent[];
  context?: Record<string, Json>;
  layout?: "focus" | "classic";
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * Encode a payload for a URL hash (deflate-raw + base64url). Answers to fields
 * marked `sensitive` in their props are replaced with null before encoding.
 */
export async function encodeShare(payload: SharePayload): Promise<string> {
  const sensitive = new Set(
    payload.definition.blocks.filter((b) => b.kind === "field" && b.props?.sensitive === true).map((b) => b.id),
  );
  const events = payload.events?.map((e) =>
    e.type === "answer" && sensitive.has(e.field) ? { ...e, value: null } : e,
  );
  const json = new TextEncoder().encode(JSON.stringify({ ...payload, events }));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeShare(hash: string): Promise<SharePayload | null> {
  try {
    const bytes = await pipe(fromBase64Url(hash.replace(/^#?d=/, "")), new DecompressionStream("deflate-raw"));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    return payload?.v === 1 && payload.definition ? payload : null;
  } catch {
    return null;
  }
}
