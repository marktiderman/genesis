import {
  parseForm,
  type FormDefinition,
  type FormEvent,
  type Json,
} from "@marktiderman/genesis-forms";
import { compactEvents } from "@marktiderman/genesis-forms/testing";
import { MAX_VALUE_DEPTH, exceedsDepth, isFormEvent, sensitiveHiddenNames, sensitiveIds } from "./util";

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
  /**
   * Keep each event's `at` timestamp. Off by default: timestamps say when and
   * how fast someone answered, and replay ignores them anyway.
   */
  includeTimestamps?: boolean;
}

/**
 * The largest payload, as JSON bytes, a share link may carry. `encodeShare`
 * throws above it and `decodeShare` rejects anything that inflates past it
 * (a decompression bomb guard).
 */
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

/**
 * Encode a payload for a URL hash (deflate-raw + base64url). Keystroke-level
 * answers are compacted (consecutive answers to one field keep the last),
 * answers to sensitive fields are blanked, and `at` timestamps, the server
 * context and `definition.meta` are left out unless asked for. Throws when
 * the JSON is larger than `MAX_SHARE_BYTES`, since `decodeShare` would refuse it.
 */
export async function encodeShare(
  payload: SharePayload,
  options: EncodeShareOptions = {},
): Promise<string> {
  const sensitive = sensitiveIds(payload.definition);
  const events = payload.events
    ? compactEvents(payload.events).map((e): FormEvent => {
        const blanked: FormEvent =
          e.type === "answer" && sensitive.has(e.field) ? { ...e, value: null } : e;
        if (options.includeTimestamps || blanked.at === undefined) return blanked;
        const { at: _at, ...rest } = blanked;
        return rest as FormEvent;
      })
    : undefined;
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
  if (options.includeContext && payload.context) {
    const secret = sensitiveHiddenNames(payload.definition);
    out.context = Object.fromEntries(
      Object.entries(payload.context).map(([name, value]) => [name, secret.has(name) ? null : value]),
    );
  }
  const json = new TextEncoder().encode(JSON.stringify(out));
  if (json.byteLength > MAX_SHARE_BYTES) {
    throw new Error(
      `This form is too large to share as a link (${Math.ceil(json.byteLength / 1000)} KB; the limit is ${MAX_SHARE_BYTES / 1000} KB).`,
    );
  }
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/**
 * Decode a share hash. Returns null for anything malformed, oversized or not a
 * valid form, or whose event values or context nest deeper than 32 levels.
 */
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
      (!Array.isArray(payload.events) ||
        !payload.events.every(isFormEvent) ||
        payload.events.some(
          (e) => e.type === "answer" && exceedsDepth(e.value, MAX_VALUE_DEPTH),
        ))
    ) {
      return null;
    }
    if (
      payload.context !== undefined &&
      (typeof payload.context !== "object" ||
        payload.context === null ||
        Array.isArray(payload.context) ||
        // The context object itself is one level; its values get 32.
        exceedsDepth(payload.context, MAX_VALUE_DEPTH + 1))
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
