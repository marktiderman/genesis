import {
  parseForm,
  type FormDefinition,
  type FormEvent,
  type Json,
} from "@marktiderman/genesis-forms";

/** What a share link carries. It lives in the URL hash, so it never reaches a server. */
export interface SharePayload {
  v: 1;
  definition: FormDefinition;
  events?: FormEvent[];
  context?: Record<string, Json>;
  layout?: "focus" | "classic";
}

export interface EncodeShareOptions {
  /**
   * Include the server context (it can hold names or ids). Off by default:
   * a link still ends up in browser history, clipboards and chats.
   */
  includeContext?: boolean;
  /** Include `definition.meta`. Off by default for the same reason. */
  includeMeta?: boolean;
}

/** Decoded payloads larger than this are rejected (a decompression bomb guard). */
export const MAX_SHARE_BYTES = 1_000_000;

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(stream)
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Share payload is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const isFormEvent = (event: unknown): event is FormEvent => {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const e = event as Record<string, unknown>;
  if (e.at !== undefined && typeof e.at !== "number") return false;
  if (e.type === "answer") return typeof e.field === "string";
  return e.type === "next" || e.type === "back" || e.type === "submit";
};

/**
 * Encode a payload for a URL hash (deflate-raw + base64url). Answers to fields
 * marked `sensitive` in their props are blanked; the server context and
 * `definition.meta` are left out unless asked for.
 */
export async function encodeShare(
  payload: SharePayload,
  options: EncodeShareOptions = {},
): Promise<string> {
  const sensitive = new Set(
    payload.definition.blocks
      .filter((b) => b.kind === "field" && b.props?.sensitive === true)
      .map((b) => b.id),
  );
  const events = payload.events?.map((e) =>
    e.type === "answer" && sensitive.has(e.field) ? { ...e, value: null } : e,
  );
  const { meta, ...definitionWithoutMeta } = payload.definition;
  const definition =
    options.includeMeta && meta
      ? { ...definitionWithoutMeta, meta }
      : definitionWithoutMeta;
  const out: SharePayload = {
    v: 1,
    definition,
    events,
    layout: payload.layout,
  };
  if (options.includeContext && payload.context) out.context = payload.context;
  const json = new TextEncoder().encode(JSON.stringify(out));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Decode a share hash. Returns null for anything malformed, oversized or not a valid form. */
export async function decodeShare(hash: string): Promise<SharePayload | null> {
  try {
    const bytes = await pipe(
      fromBase64Url(hash.replace(/^#?d=/, "")),
      new DecompressionStream("deflate-raw"),
      MAX_SHARE_BYTES,
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (payload?.v !== 1 || !parseForm(payload.definition).ok) return null;
    if (
      payload.events !== undefined &&
      (!Array.isArray(payload.events) || !payload.events.every(isFormEvent))
    ) {
      return null;
    }
    if (
      payload.context !== undefined &&
      (typeof payload.context !== "object" ||
        payload.context === null ||
        Array.isArray(payload.context))
    ) {
      return null;
    }
    if (
      payload.layout !== undefined &&
      payload.layout !== "focus" &&
      payload.layout !== "classic"
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}
