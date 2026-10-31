/**
 * @marktiderman/genesis-media/forms: an adapter for genesis-forms'
 * upload port (`UploadAdapter`), so a form's `photo` answers upload through
 * this package's resumable, checksummed protocol instead of forms' built-in
 * signed single upload. A host opts in by passing it:
 *
 *   <Form uploads={createFormsUploadAdapter({ uploader, readUrl })} …>
 *
 * It fits the port by shape, so neither package depends on the other. The
 * app's upload route decides who the respondent is (the visit's attempt id or
 * an edit link, through the uploader's `headers`) and what each field may take
 * (`authorize`); the reference it resolves to is what the answer keeps, and
 * what the app's submit check looks up.
 *
 * @packageDocumentation
 */
import { fromBlob } from "../uploads/client/sources";
import type { Uploader } from "../uploads/client/uploader";

/** The field, as forms passes it: only its id is read. */
export interface FormsUploadField {
  id: string;
}

/** The reference a form answer keeps (genesis-forms' `PhotoRef`). */
export interface FormsFileRef {
  /** The upload's id, or the app's own id for an identical file it already holds (`readable`'s `ref`). */
  id: string;
  name: string;
  type: string;
  size: number;
}

/** @stability Experimental */
export interface FormsUploadAdapterOptions {
  /** `createUploader` from `/client`, pointed at the app's upload route. */
  uploader: Pick<Uploader, "upload">;
  /** The upload's purpose, for the route's rules. Default `"forms"`. */
  purpose?: string | ((field: FormsUploadField) => string) | undefined;
  /** The type to declare. Default the file's own (forms-web's `photoFileType` also names HEIC from its extension). */
  contentType?: ((file: Blob & { name: string; type: string }) => string) | undefined;
  /** A link to read a stored file, for thumbnails and staff views; null when it can't be read. */
  readUrl?: ((ref: FormsFileRef, field?: FormsUploadField) => Promise<string | null>) | undefined;
}

/** What `createFormsUploadAdapter` returns: an object that fits genesis-forms' `UploadAdapter`. */
export interface FormsUploadAdapter {
  upload(file: Blob & { name: string; type: string }, field: FormsUploadField): Promise<FormsFileRef>;
  url(ref: FormsFileRef, field?: FormsUploadField): Promise<string | null>;
}

/** @stability Experimental */
export function createFormsUploadAdapter(options: FormsUploadAdapterOptions): FormsUploadAdapter {
  return {
    async upload(file, field) {
      const contentType = options.contentType?.(file) || file.type || "application/octet-stream";
      const purpose = typeof options.purpose === "function" ? options.purpose(field) : (options.purpose ?? "forms");
      const result = await options.uploader.upload(fromBlob(file), { name: file.name, contentType, purpose }).done;
      // A copy that didn't verify everywhere isn't stored yet: the respondent tries again.
      if (result.state === "partial") throw new Error("The file wasn't stored. Try again.");
      const id = result.ref ?? result.uploadId;
      if (!id) throw new Error("The upload route gave no reference for the file.");
      return { id, name: file.name, type: contentType, size: file.size };
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
