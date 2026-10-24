/**
 * Upload fields on the server: what the app's store keeps for each upload, and
 * the check a submit runs before it saves answers that name uploaded files
 * (`checkUploads`). Pure: it works on any `UploadStore`, so tests run it on a
 * fake, and the handshake that records uploads is `createUploadHandler`
 * (upload-handler.ts).
 *
 * Moved up from the host app's src/lib/feedback/uploads.ts (`checkPhotoAnswers`).
 * Written for every upload field type (`UPLOAD_FIELD_TYPES`); `photo` is the only one.
 */
import {
  PHOTO_TYPE,
  photoCountMessage,
  photoLimits,
  photoRefs,
  photoSizeMessage,
  photoTypeMessage,
  UPLOAD_FIELD_TYPES,
  type PhotoRef,
} from "./photo";
import type { SignedUpload } from "./upload-protocol";
import type { FieldBlock, FormDefinition, Json } from "./types";

/** What the store records when an upload begins. */
export interface BeginUploadInput {
  formId: string;
  fieldId: string;
  name: string;
  contentType: string;
  size: number;
  /** A new response's attempt (`attemptHash` of its attempt id), or… */
  attemptHash: string | null;
  /** …the id of the sent response an edit link is changing. Exactly one of the two. */
  editOf: string | null;
}

/** One upload as the store reads it back, with what storage holds for it. */
export interface StoredUpload {
  id: string;
  fieldId: string;
  attemptHash: string | null;
  editOf: string | null;
  /** The response that took it, once one did. */
  responseId: string | null;
  name: string;
  contentType: string;
  size: number;
  /** Whether the file is in storage (the respondent's browser finished sending it). */
  stored: boolean;
  /** The type and size storage holds, which are trusted over what the browser said. */
  storedType: string | null;
  storedSize: number | null;
}

/** What uploads need from the app's database and storage; the app's service-role client, say. */
export interface UploadStore {
  /**
   * Records one upload and names its object in storage; `{ tooMany: true }` once the
   * attempt or edit has as many as the app allows (the host app: 20).
   */
  beginUpload(input: BeginUploadInput): Promise<{ id: string; objectName: string } | { tooMany: true }>;
  /** Signs an upload of that object, sent to the browser as `upload` (`SignedUpload`). */
  signUpload(objectName: string): Promise<SignedUpload>;
  /** This form's uploads with these ids; others are left out. */
  uploadRefs(formId: string, ids: string[]): Promise<StoredUpload[]>;
}

/** Who may use an upload: a new response's attempt, or an edit of a sent response. */
export type UploadOwner = { attemptHash: string } | { responseId: string };

/** The form's upload fields (`UPLOAD_FIELD_TYPES`: photo). */
export function uploadFields(definition: FormDefinition): FieldBlock[] {
  return definition.blocks.filter(
    (b): b is FieldBlock => b.kind === "field" && (UPLOAD_FIELD_TYPES as readonly string[]).includes(b.type),
  );
}

/** An upload field type's limits and its words for a file it doesn't take. */
export interface UploadRules {
  maxFiles: number;
  maxBytes: number;
  mimeTypes: readonly string[];
  typeMessage: string;
  sizeMessage: string;
  countMessage: string;
}

/** The rules for an upload field, or null when the field doesn't take files. */
export function uploadRules(field: FieldBlock): UploadRules | null {
  if (field.type !== PHOTO_TYPE) return null;
  const limits = photoLimits(field);
  return {
    maxFiles: limits.maxFiles,
    maxBytes: limits.maxBytes,
    mimeTypes: limits.mimeTypes,
    typeMessage: photoTypeMessage(field),
    sizeMessage: photoSizeMessage(field),
    countMessage: photoCountMessage(field),
  };
}

/** Said when a reference isn't a file this respondent finished uploading here. */
export const NOT_UPLOADED_MESSAGE = "A photo didn't finish uploading. Remove it and add it again.";

function owns(upload: StoredUpload, owner: UploadOwner): boolean {
  if ("attemptHash" in owner) return upload.responseId === null && upload.attemptHash === owner.attemptHash;
  // An edit keeps the response's own files and may add ones uploaded for it.
  return upload.responseId === owner.responseId || (upload.responseId === null && upload.editOf === owner.responseId);
}

export interface CheckUploadsOptions {
  /** The form's id, as the store keys its uploads. */
  formId: string;
  owner: UploadOwner;
  /** Needed only when the answers name a file. */
  store?: Pick<UploadStore, "uploadRefs"> | undefined;
}

export type CheckedUploads =
  | { ok: true; answers: Record<string, Json> }
  | { ok: false; errors: Record<string, string> };

/**
 * Checks every file the answers name: uploaded by this attempt (or for this edit) to this
 * form's field, in storage, of a type and size the field takes, and no more files than it
 * takes. The stored name, type and size replace what the browser sent. Answers without
 * files are returned as they are, without asking the store. Errors are keyed by field id;
 * a store that throws throws (answer 503: nothing can be checked).
 */
export async function checkUploads(
  definition: FormDefinition,
  answers: Record<string, Json>,
  options: CheckUploadsOptions,
): Promise<CheckedUploads> {
  const asked = uploadFields(definition).filter((f) => photoRefs(answers[f.id]).length > 0);
  if (!asked.length) return { ok: true, answers };
  const { store, formId, owner } = options;
  if (!store) throw new Error("Answers that name uploaded files need an upload store.");

  const ids = asked.flatMap((f) => photoRefs(answers[f.id]).map((r) => r.id));
  const stored = new Map((await store.uploadRefs(formId, ids)).map((u) => [u.id, u]));
  const out: Record<string, Json> = { ...answers };
  const errors: Record<string, string> = {};
  for (const field of asked) {
    const rules = uploadRules(field)!;
    const refs = photoRefs(answers[field.id]);
    if (refs.length > rules.maxFiles) {
      errors[field.id] = rules.countMessage;
      continue;
    }
    const checked: PhotoRef[] = [];
    for (const ref of refs) {
      const upload = stored.get(ref.id);
      if (!upload || upload.fieldId !== field.id || !owns(upload, owner) || !upload.stored) {
        errors[field.id] = NOT_UPLOADED_MESSAGE;
        break;
      }
      const type = (upload.storedType ?? "").toLowerCase();
      const size = upload.storedSize ?? 0;
      if (!rules.mimeTypes.includes(type)) {
        errors[field.id] = rules.typeMessage;
        break;
      }
      if (size < 1 || size > rules.maxBytes) {
        errors[field.id] = rules.sizeMessage;
        break;
      }
      checked.push({ id: upload.id, name: upload.name, type, size });
    }
    out[field.id] = checked;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers: out };
}

/**
 * The stored hash of a visit's attempt id: hex SHA-256 (Web Crypto). It equals
 * The host app's `resumeTokenHash`, so uploads recorded before the move still match.
 */
export async function attemptHash(attemptId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attemptId)));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}
