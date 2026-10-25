// @feat:chat
/**
 * A fetch handler that gives a composer a direct-upload URL for a video, after
 * the app confirms the person may post in that conversation.
 *
 *   POST { conversationId, attachmentId? }  →  { url, providerId, provider: "mux" }
 *
 * The client PUTs the file to `url` and sends its message with an attachment
 * `{ kind: "video", provider: "mux", provider_id: providerId, status: "pending" }`
 * (and `id: attachmentId` when it chose one: it becomes the upload's passthrough,
 * so the webhook finds the attachment by it).
 */
import type { VideoProvider } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VideoUploadHandlerOptions {
  /** `muxVideo(...)`. */
  video: Pick<VideoProvider, "name" | "createUpload">;
  /**
   * Must confirm the request's user may post in `conversationId` (verify their
   * session, then ask the database as them, e.g. a select on
   * `genesis_chat.members` under row level security). Resolve false to refuse.
   */
  authorize: (request: Request, context: { conversationId: string }) => Promise<boolean> | boolean;
  /** The upload's CORS origin: a fixed origin, or the request's `origin` header when it is in this list. Default: the `origin` header, else `*` (native apps send none). */
  corsOrigin?: string | readonly string[] | undefined;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createVideoUploadHandler(options: VideoUploadHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") return json(405, { error: "method not allowed" });
    let body: { conversationId?: unknown; attachmentId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json(400, { error: "bad json" });
    }
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    if (!UUID.test(conversationId)) return json(400, { error: "conversationId is required" });
    const attachmentId = typeof body.attachmentId === "string" && UUID.test(body.attachmentId) ? body.attachmentId : undefined;

    let allowed = false;
    try {
      allowed = (await options.authorize(request, { conversationId })) === true;
    } catch {
      allowed = false;
    }
    if (!allowed) return json(403, { error: "not allowed to post in this conversation" });

    const origin = request.headers.get("origin");
    const configured = options.corsOrigin;
    let corsOrigin: string;
    if (typeof configured === "string") corsOrigin = configured;
    else if (configured) {
      if (origin && !configured.includes(origin)) return json(403, { error: "origin not allowed" });
      corsOrigin = origin ?? "*";
    } else corsOrigin = origin ?? "*";

    try {
      const upload = await options.video.createUpload({ corsOrigin, passthrough: attachmentId });
      return json(200, { url: upload.url, providerId: upload.uploadId, provider: options.video.name });
    } catch (e) {
      return json(502, { error: e instanceof Error ? e.message.slice(0, 200) : "upload failed" });
    }
  };
}
