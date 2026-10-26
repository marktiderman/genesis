// @feat:chat
/**
 * A fetch handler that gives a composer a direct-upload URL for a video, after
 * the app confirms the person may post in that conversation.
 *
 *   POST { conversationId }  →  { url, providerId, provider: "mux" }
 *   OPTIONS                  →  204 with CORS headers, for an allowed origin
 *
 * The client PUTs the file to `url` and sends its message with an attachment
 * `{ kind: "video", provider: "mux", provider_id: providerId, status: "pending" }`.
 *
 * The caller chooses nothing the webhook trusts. The server sets the upload's
 * passthrough to the conversation (and the uploader, when `authorize` names
 * them); the webhook finds the attachment only by the upload id the client sent
 * with its message, and applies an event only when the passthrough names that
 * attachment's conversation (and its sender). So nobody can aim their upload at
 * another conversation's video.
 */
import type { VideoProvider } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASSTHROUGH_PREFIX = "gc1";

/** Who an upload is for: written by the server into the upload's passthrough, never by the client. */
export interface ChatUploadBinding {
  conversationId: string;
  /** The uploader, when the app's `authorize` named them. */
  userId?: string | undefined;
}

/** `gc1:<conversation id>:<user id or empty>`: the passthrough the upload handler sets. */
export function chatUploadPassthrough(binding: ChatUploadBinding): string {
  return `${PASSTHROUGH_PREFIX}:${binding.conversationId}:${binding.userId ?? ""}`;
}

/** Reads a passthrough the upload handler set, or null for anything else. */
export function parseChatUploadPassthrough(value: string | null | undefined): ChatUploadBinding | null {
  if (!value) return null;
  const [prefix, conversationId, userId, ...rest] = value.split(":");
  if (prefix !== PASSTHROUGH_PREFIX || rest.length > 0 || !conversationId || !UUID.test(conversationId)) return null;
  if (userId && !UUID.test(userId)) return null;
  return { conversationId: conversationId.toLowerCase(), ...(userId ? { userId: userId.toLowerCase() } : {}) };
}

export interface VideoUploadHandlerOptions {
  /** `muxVideo(...)`. */
  video: Pick<VideoProvider, "name" | "createUpload">;
  /**
   * Must confirm the request's user may post in `conversationId` (verify their
   * session, then ask the database as them, e.g. a select on
   * `genesis_chat.members` under row level security). Resolve false to refuse.
   * Resolve `{ userId }` to also bind the upload to its uploader: the webhook
   * then applies it only to a message they sent.
   */
  authorize: (
    request: Request,
    context: { conversationId: string },
  ) => Promise<boolean | { userId: string }> | boolean | { userId: string };
  /**
   * Required. The web origin(s) allowed to upload: one origin, or a list that
   * the request's `origin` header must be in. Native apps send no origin; they
   * get the first. `"*"` allows any origin (only for an app with no web client).
   */
  corsOrigin: string | readonly string[];
  /**
   * A per-user cap on minting uploads (each one can cost money). Resolve false
   * to answer 429. Called after `authorize`, with the user it named.
   */
  rateLimit?:
    | ((request: Request, context: { conversationId: string; userId: string | undefined }) => Promise<boolean> | boolean)
    | undefined;
}

export function createVideoUploadHandler(options: VideoUploadHandlerOptions): (request: Request) => Promise<Response> {
  const configured = options.corsOrigin;
  if (!configured || (typeof configured !== "string" && configured.length === 0)) {
    throw new Error("createVideoUploadHandler: `corsOrigin` is required (an origin, a list of origins, or \"*\")");
  }

  /** The origin to allow for this request, or null when its origin isn't allowed. */
  function allowedOrigin(request: Request): string | null {
    const origin = request.headers.get("origin");
    if (typeof configured === "string") {
      if (configured === "*") return origin ?? "*";
      return !origin || origin === configured ? configured : null;
    }
    if (!origin) return configured[0]!;
    return configured.includes(origin) ? origin : null;
  }

  const respond = (status: number, body: unknown, origin: string | null) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: {
        ...(body === null ? {} : { "content-type": "application/json" }),
        "cache-control": "no-store",
        vary: "origin",
        ...(origin ? { "access-control-allow-origin": origin } : {}),
      },
    });

  return async (request) => {
    const origin = allowedOrigin(request);
    if (request.method === "OPTIONS") {
      if (!origin) return respond(403, { error: "origin not allowed" }, null);
      const preflight = respond(204, null, origin);
      preflight.headers.set("access-control-allow-methods", "POST, OPTIONS");
      preflight.headers.set("access-control-allow-headers", request.headers.get("access-control-request-headers") ?? "authorization, content-type");
      preflight.headers.set("access-control-max-age", "600");
      return preflight;
    }
    if (request.method !== "POST") return respond(405, { error: "method not allowed" }, origin);
    if (!origin) return respond(403, { error: "origin not allowed" }, null);

    let body: { conversationId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return respond(400, { error: "bad json" }, origin);
    }
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.toLowerCase() : "";
    if (!UUID.test(conversationId)) return respond(400, { error: "conversationId is required" }, origin);

    let userId: string | undefined;
    let allowed = false;
    try {
      const verdict = await options.authorize(request, { conversationId });
      if (verdict === true) allowed = true;
      else if (verdict && typeof verdict === "object" && typeof verdict.userId === "string" && UUID.test(verdict.userId)) {
        allowed = true;
        userId = verdict.userId.toLowerCase();
      }
    } catch {
      allowed = false;
    }
    if (!allowed) return respond(403, { error: "not allowed to post in this conversation" }, origin);

    if (options.rateLimit) {
      let underCap = false;
      try {
        underCap = (await options.rateLimit(request, { conversationId, userId })) === true;
      } catch {
        underCap = false;
      }
      if (!underCap) return respond(429, { error: "too many uploads; try again later" }, origin);
    }

    try {
      const upload = await options.video.createUpload({
        corsOrigin: origin,
        passthrough: chatUploadPassthrough({ conversationId, userId }),
      });
      return respond(200, { url: upload.url, providerId: upload.uploadId, provider: options.video.name }, origin);
    } catch (e) {
      return respond(502, { error: e instanceof Error ? e.message.slice(0, 200) : "upload failed" }, origin);
    }
  };
}
