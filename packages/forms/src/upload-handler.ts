/**
 * The upload handshake's server half: `createUploadHandler` answers the browser's
 * request for one signed upload (`UploadRequest`). It checks the form takes responses,
 * the field takes files, the file's type and size, the visit's attempt id (or the edit
 * link) and the rate limit, records the upload and signs it. The browser then sends the
 * bytes straight to storage; on submit, `checkUploads` checks each reference again.
 *
 * Moved up from Breakthrough's src/lib/feedback/uploads.server.ts (`handleFeedbackUpload`):
 * the same checks in the same order, the same JSON and status codes. What is the app's
 * own is passed in: finding the form, the store, the edit link's response, the counter.
 * Web APIs only (Request, Response, Web Crypto).
 */
import { verifyEditToken } from "./edit-link";
import { allow, clientIp, DEFAULT_TRUSTED_IP_HEADERS, RATE_LIMIT_DEFAULTS, rateLimitKey, type RateLimitStore } from "./rate-limit";
import { MAX_UPLOAD_REQUEST_BYTES } from "./upload-protocol";
import { attemptHash, uploadRules, type UploadStore } from "./uploads";
import type { FieldBlock, FormDefinition } from "./types";

/** The form an upload is for, as the app found it from the request. */
export interface UploadForm {
  /** The form's id, as the store keys uploads. */
  id: string;
  /** The published definition respondents answer. */
  definition: FormDefinition;
  /** Whether it takes responses now (not paused, closed, full…). */
  open: boolean;
  /** Whose rate-limit count this is: a practice, an account. */
  scope: string;
  /** Whether its edit links work. Default false: no uploads for an edit. */
  allowsEdits?: boolean | undefined;
  /** Names the form in logs, such as its slug. */
  label?: string | undefined;
}

/** A sent response an edit link may change, as the app loads it. */
export interface EditableResponse {
  id: string;
  /** The response's current nonce: only a link made with it works. */
  editNonce: string;
}

/** The handler's words; each default is what Breakthrough said. */
export interface UploadMessages {
  /** 415 / 400: not a JSON object. */
  notJson: string;
  /** 413: past `maxRequestBytes`. */
  tooLong: string;
  /** 400: no attempt id, or not a UUID. */
  reload: string;
  /** 404: `resolveForm` found no form. */
  unavailable: string;
  /** 409: the form isn't open. */
  notOpen: string;
  /** 409 (`code: "closed"`): an edit while the form isn't open. */
  notTakingChanges: string;
  /** 403 (`code: "bad_link"`): an edit link that doesn't check out, or a form without edits. */
  badEditLink: string;
  /** 400: the field isn't an upload field of this form. */
  notUploadField: string;
  /** 429: the rate limit. */
  rateLimited: string;
  /** 429 (`code: "too_many_photos"`): the store has as many uploads for this attempt or edit as it allows. */
  tooMany: string;
  /** 503 / 500: something failed on the server; nothing more is said. */
  failed: string;
}

export const UPLOAD_MESSAGES: UploadMessages = {
  notJson: "Send the request as JSON.",
  tooLong: "That request is too long.",
  reload: "Reload the page and try again.",
  unavailable: "This form isn't available.",
  notOpen: "This form isn't open right now.",
  notTakingChanges: "This form isn't taking changes now.",
  badEditLink:
    "This edit link doesn't work any more. Use the newest one: from your latest confirmation email, or the one shown after your last change.",
  notUploadField: "This question doesn't take photos.",
  rateLimited: "Too many photos from here. Try again in a few minutes.",
  tooMany: "That's as many photos as one response can take.",
  failed: "That photo couldn't be added. Please try again.",
};

type Secret = string | null | undefined;

export interface UploadHandlerOptions<P = void> {
  /**
   * The form the request is for (from its host, path or `params`), or null (404). A throw
   * answers 503 and logs the error's message.
   */
  resolveForm(request: Request, params: P): Promise<UploadForm | null>;
  store: UploadStore;
  /**
   * Uploads for an edit link (`edit` in the request). Without it, or without a usable
   * secret, every edit link is refused (403).
   */
  edit?:
    | {
        /** The edit-link secret, or a reader of it (`createEditSecretReader`). */
        secret: Secret | (() => Secret);
        /**
         * The sent response with this id, of this form (and its scope), or null (403).
         * A throw answers 503.
         */
        response(id: string, form: UploadForm): Promise<EditableResponse | null>;
      }
    | undefined;
  /** Counted per scope and client address, as `kind: "upload"`. Without it, nothing is counted. */
  rateLimit?:
    | {
        store: RateLimitStore;
        /** The server secret the address is hashed with (`rateLimitKey`). */
        secret: string;
        /** Default `RATE_LIMIT_DEFAULTS.upload`: 120 per 600 seconds. */
        limit?: number | undefined;
        windowSeconds?: number | undefined;
        /** Default `DEFAULT_TRUSTED_IP_HEADERS`. */
        trustedIpHeaders?: readonly string[] | undefined;
      }
    | undefined;
  /** The stored hash of an attempt id. Default `attemptHash` (hex SHA-256). */
  hashAttempt?: ((attemptId: string) => string | Promise<string>) | undefined;
  /** Default `MAX_UPLOAD_REQUEST_BYTES` (4,000). */
  maxRequestBytes?: number | undefined;
  /** The current time (tests): edit links expire. */
  now?: (() => Date) | undefined;
  /** Where failures are said; `console.error` with an `[upload]` prefix by default. Never sent to the browser. */
  log?: ((message: string) => void) | undefined;
  messages?: Partial<UploadMessages> | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The body as text, or null once it is over `max` bytes: read as it streams in and
 * abandoned at the cap, so a body without (or lying in) Content-Length is never
 * buffered whole.
 */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The upload endpoint: `(request, params) => Response`, for a POST route. `params` is
 * whatever the route has (a form slug, say), passed to `resolveForm`. See the README's
 * "Uploads" for the JSON and every status.
 */
export function createUploadHandler<P = void>(
  options: UploadHandlerOptions<P>,
): (request: Request, params: P) => Promise<Response> {
  const say: UploadMessages = { ...UPLOAD_MESSAGES, ...options.messages };
  const log = options.log ?? ((m: string) => console.error(`[upload] ${m}`));
  const hash = options.hashAttempt ?? attemptHash;
  const maxBytes = options.maxRequestBytes ?? MAX_UPLOAD_REQUEST_BYTES;

  return async (request, params) => {
    const contentType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (contentType !== "application/json") return json({ error: say.notJson }, 415);
    const text = await readCapped(request, maxBytes);
    if (text === null) return json({ error: say.tooLong }, 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: say.notJson }, 400);
    }
    const fieldId = typeof body["fieldId"] === "string" ? body["fieldId"] : "";
    const name = typeof body["name"] === "string" ? body["name"].trim().slice(0, 255) : "";
    const type = typeof body["type"] === "string" ? body["type"].trim().toLowerCase() : "";
    const size = body["size"];
    const editing = body["edit"] !== undefined;
    const attemptId = body["attemptId"];
    if (!editing && (typeof attemptId !== "string" || !UUID.test(attemptId))) {
      return json({ error: say.reload }, 400);
    }

    let form: UploadForm | null;
    try {
      form = await options.resolveForm(request, params);
    } catch (error) {
      log(error instanceof Error ? error.message : "Loading the form failed.");
      return json({ error: say.failed }, 503);
    }
    if (!form) return json({ error: say.unavailable }, 404);
    if (!form.open) {
      return editing ? json({ error: say.notTakingChanges, code: "closed" }, 409) : json({ error: say.notOpen }, 409);
    }

    const block = form.definition.blocks.find((b) => b.kind === "field" && b.id === fieldId);
    const field = block?.kind === "field" ? (block as FieldBlock) : null;
    const rules = field ? uploadRules(field) : null;
    if (!field || !rules) return json({ error: say.notUploadField }, 400);
    if (!rules.mimeTypes.includes(type)) return json({ error: rules.typeMessage }, 415);
    if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > rules.maxBytes) {
      return json({ error: rules.sizeMessage }, 413);
    }

    // From an edit link: only its newest link, for a sent response of this form, while
    // the form allows changes (the same checks as saving the change).
    let editOf: string | null = null;
    if (editing) {
      const secret = typeof options.edit?.secret === "function" ? options.edit.secret() : options.edit?.secret;
      const claims = options.edit
        ? await verifyEditToken(
            typeof body["edit"] === "string" ? body["edit"] : null,
            secret,
            options.now ? { now: options.now().getTime() } : {},
          )
        : null;
      if (!claims || form.allowsEdits !== true) return json({ error: say.badEditLink, code: "bad_link" }, 403);
      let stored: EditableResponse | null;
      try {
        stored = await options.edit!.response(claims.id, form);
      } catch {
        log(`Loading response ${claims.id} for an upload failed.`);
        return json({ error: say.failed }, 503);
      }
      if (!stored || stored.editNonce !== claims.nonce) return json({ error: say.badEditLink, code: "bad_link" }, 403);
      editOf = stored.id;
    }

    if (options.rateLimit) {
      const limit = options.rateLimit;
      const key = await rateLimitKey({
        kind: "upload",
        scope: form.scope,
        ip: clientIp(request.headers, limit.trustedIpHeaders ?? DEFAULT_TRUSTED_IP_HEADERS),
        secret: limit.secret,
      });
      const allowed = await allow(
        limit.store,
        {
          key,
          limit: limit.limit ?? RATE_LIMIT_DEFAULTS.upload.limit,
          windowSeconds: limit.windowSeconds ?? RATE_LIMIT_DEFAULTS.upload.windowSeconds,
        },
        { log, message: "The upload rate limit could not be checked; letting the upload through." },
      );
      if (!allowed) return json({ error: say.rateLimited }, 429);
    }

    const fileName = name || "photo";
    try {
      const begun = await options.store.beginUpload({
        formId: form.id,
        fieldId: field.id,
        name: fileName,
        contentType: type,
        size,
        attemptHash: editOf ? null : await hash(attemptId as string),
        editOf,
      });
      if ("tooMany" in begun) return json({ error: say.tooMany, code: "too_many_photos" }, 429);
      const signed = await options.store.signUpload(begun.objectName);
      return json({ ref: { id: begun.id, name: fileName, type, size }, upload: signed });
    } catch (error) {
      log(
        `Starting an upload on ${form.label ?? form.id} for ${form.scope} failed: ${error instanceof Error ? error.message : "unexpected error"}`,
      );
      return json({ error: say.failed }, 500);
    }
  };
}
