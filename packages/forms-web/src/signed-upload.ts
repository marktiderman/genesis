import type { FieldBlock, PhotoRef, SignedUpload, UploadGrant, UploadRequest } from "@marktiderman/genesis-forms";
import { photoFileType } from "./photo";
import type { UploadHost } from "./upload";

/**
 * Who is uploading: a new response's visit (`attemptId`, a UUID the page keeps for the
 * visit), or an edit link's token while changing a sent response.
 */
export type UploadClaim = { attemptId: string } | { edit: string };

export interface SignedUploadHostOptions {
  /** The app's upload endpoint (`createUploadHandler`'s route), or one per field. */
  endpoint: string | ((field: FieldBlock) => string);
  /** Who is uploading, read at each upload. */
  claim: UploadClaim | (() => UploadClaim);
  /**
   * Sends the bytes where the server signed. Default: PUT the file to `upload.url`
   * (with its type), which a store that signs plain URLs sets. Supabase Storage:
   * `supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, { contentType })`.
   * A throw (or rejection) is the upload failing.
   */
  send?: ((file: File, upload: SignedUpload, contentType: string) => Promise<void>) | undefined;
  /**
   * A link to read a stored file, for thumbnails and staff views: the app's storage signs
   * it. Null when the reader can't open it. Without it, `url` resolves null.
   */
  readUrl?: ((ref: PhotoRef, field?: FieldBlock) => Promise<string | null>) | undefined;
  /** Default the global `fetch`. */
  fetch?: typeof fetch | undefined;
}

/** An `UploadHost` that always has `url`. */
export interface SignedUploadHost extends UploadHost {
  url(ref: PhotoRef, field?: FieldBlock): Promise<string | null>;
}

async function putToUrl(file: File, upload: SignedUpload, contentType: string, fetcher: typeof fetch) {
  if (!upload.url) throw new Error("The server signed no URL to send the file to; pass `send`.");
  const res = await fetcher(upload.url, { method: "PUT", headers: { "content-type": contentType }, body: file });
  if (!res.ok) throw new Error(`The file wasn't stored (${res.status}).`);
}

/**
 * The browser half of the upload handshake (genesis-forms/server's `createUploadHandler`):
 * for each file it asks `endpoint` for a signed upload (`UploadRequest` as JSON), sends
 * the bytes with `send`, and resolves to the reference the server handed back, which is
 * all the answer keeps. A refusal rejects with the server's words. Pass it as `<Form
 * onUpload={host.upload}>` or in an `UploadContext`.
 *
 * @deprecated For new uploads use genesis-media-library's `createUploader`
 * (`@marktiderman/genesis-media-library/client`). This stays, unchanged in behaviour,
 * until the next major.
 */
export function signedUploadHost(options: SignedUploadHostOptions): SignedUploadHost {
  const fetcher = (...args: Parameters<typeof fetch>) => (options.fetch ?? fetch)(...args);
  return {
    async upload(file, field) {
      const type = photoFileType(file);
      const claim = typeof options.claim === "function" ? options.claim() : options.claim;
      const endpoint = typeof options.endpoint === "function" ? options.endpoint(field) : options.endpoint;
      const request: UploadRequest = { fieldId: field.id, name: file.name, type, size: file.size, ...claim };
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<UploadGrant> & { error?: unknown };
      if (!response.ok || !body.ref || !body.upload) {
        throw new Error(typeof body.error === "string" ? body.error : `The photo wasn't accepted (${response.status}).`);
      }
      if (options.send) await options.send(file, body.upload, type);
      else await putToUrl(file, body.upload, type, fetcher);
      return body.ref;
    },
    async url(ref, field) {
      if (!options.readUrl) return null;
      try {
        return await options.readUrl(ref, field);
      } catch {
        return null;
      }
    },
  };
}
