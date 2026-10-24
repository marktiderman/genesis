import type { FieldTypeManifest } from "./fields";
import { isWholeNumber } from "./props-check";
import type { FieldBlock, Json } from "./types";

/**
 * The `photo` field type: a respondent attaches up to a few photos, such as a
 * picture of broken equipment. The answer holds references the host's storage
 * handed back (`PhotoRef`), never the bytes: the renderer uploads through the
 * host (`onUpload` on genesis-forms-web's `Form`), so the engine and the
 * server stay storage-agnostic. A host's server should check that each
 * reference is a file it stored for this respondent before saving.
 *
 * Opt-in in a builder palette (`UPLOAD_FIELD_TYPES`), since a host must be
 * able to store the files.
 */
export const PHOTO_TYPE = "photo";

/** Field types that need the host to store files; a builder offers them only when the host names them. */
export const UPLOAD_FIELD_TYPES = [PHOTO_TYPE] as const;

/** One stored photo, as the host's upload returned it. */
export type PhotoRef = {
  /** The host's id for the stored file. */
  id: string;
  /** The file's name on the respondent's device. */
  name: string;
  /** Its MIME type, such as `image/jpeg`. */
  type: string;
  /** Bytes. */
  size: number;
};

export type PhotoFormat = "jpeg" | "png" | "heic" | "webp";

/** The MIME types each format covers. */
export const PHOTO_FORMATS: Record<PhotoFormat, readonly string[]> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  heic: ["image/heic", "image/heif"],
  webp: ["image/webp"],
};

const FORMAT_NAMES: Record<PhotoFormat, string> = { jpeg: "JPEG", png: "PNG", heic: "HEIC", webp: "WebP" };
const ALL_FORMATS = Object.keys(PHOTO_FORMATS) as PhotoFormat[];

export const DEFAULT_PHOTO_FILES = 3;
export const MAX_PHOTO_FILES = 5;
export const DEFAULT_PHOTO_SIZE_MB = 10;
export const MAX_PHOTO_SIZE_MB = 25;
/** The longest reference id and file name a photo answer may carry. */
export const MAX_PHOTO_ID_LENGTH = 200;
export const MAX_PHOTO_NAME_LENGTH = 255;

export const isPhotoFormat = (v: unknown): v is PhotoFormat =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(PHOTO_FORMATS, v);

const wholeIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export interface PhotoLimits {
  maxFiles: number;
  maxSizeMb: number;
  maxBytes: number;
  formats: PhotoFormat[];
  /** Every MIME type the formats cover. */
  mimeTypes: string[];
}

/** A photo field's limits; a prop that is missing or out of range uses its default. */
export function photoLimits(field: FieldBlock): PhotoLimits {
  const maxFiles = wholeIn(field.props?.maxFiles, 1, MAX_PHOTO_FILES) ? field.props.maxFiles : DEFAULT_PHOTO_FILES;
  const maxSizeMb = wholeIn(field.props?.maxSizeMb, 1, MAX_PHOTO_SIZE_MB) ? field.props.maxSizeMb : DEFAULT_PHOTO_SIZE_MB;
  const raw = field.props?.formats;
  const picked = Array.isArray(raw) ? ALL_FORMATS.filter((f) => raw.includes(f)) : [];
  const formats = picked.length ? picked : [...ALL_FORMATS];
  return {
    maxFiles,
    maxSizeMb,
    maxBytes: maxSizeMb * 1024 * 1024,
    formats,
    mimeTypes: formats.flatMap((f) => PHOTO_FORMATS[f]),
  };
}

/** Whether `v` has a photo reference's shape (any type and size). */
export function isPhotoRef(v: unknown): v is PhotoRef {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length <= MAX_PHOTO_ID_LENGTH &&
    typeof r.name === "string" &&
    r.name.length <= MAX_PHOTO_NAME_LENGTH &&
    typeof r.type === "string" &&
    typeof r.size === "number" &&
    Number.isInteger(r.size) &&
    r.size > 0
  );
}

/** The well-formed references in a photo answer, as `{ id, name, type, size }` only. */
export function photoRefs(value: Json | undefined): PhotoRef[] {
  if (!Array.isArray(value)) return [];
  const refs: PhotoRef[] = [];
  for (const r of value as unknown[]) if (isPhotoRef(r)) refs.push({ id: r.id, name: r.name, type: r.type, size: r.size });
  return refs;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "JPEG, PNG or WebP". */
export function photoFormatList(formats: readonly PhotoFormat[]): string {
  const names = formats.map((f) => FORMAT_NAMES[f]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
}

/** The message for a file of a type the field doesn't take. */
export const photoTypeMessage = (field: FieldBlock) => `Use a ${photoFormatList(photoLimits(field).formats)} photo.`;
/** The message for a file over the field's size limit. */
export const photoSizeMessage = (field: FieldBlock) => `Each photo must be ${photoLimits(field).maxSizeMb} MB or smaller.`;
/** The message for more photos than the field takes. */
export const photoCountMessage = (field: FieldBlock) => `Add at most ${plural(photoLimits(field).maxFiles, "photo")}.`;

export const photoFieldType: FieldTypeManifest = {
  type: PHOTO_TYPE,
  label: "Photo",
  category: "media",
  value: { json: true },
  operators: ["answered", "empty"],
  a11y: { semantics: "group" },
  checkProps: (props, check) => {
    if (props.maxFiles !== undefined && !(isWholeNumber(props.maxFiles) && props.maxFiles >= 1 && props.maxFiles <= MAX_PHOTO_FILES)) {
      check.issue("maxFiles", `Must be a whole number from 1 to ${MAX_PHOTO_FILES}.`);
    }
    if (props.maxSizeMb !== undefined && !(isWholeNumber(props.maxSizeMb) && props.maxSizeMb >= 1 && props.maxSizeMb <= MAX_PHOTO_SIZE_MB)) {
      check.issue("maxSizeMb", `Must be a whole number from 1 to ${MAX_PHOTO_SIZE_MB}.`);
    }
    if (props.formats !== undefined) {
      const formats = props.formats;
      if (!Array.isArray(formats) || formats.length === 0 || !formats.every(isPhotoFormat)) {
        check.issue("formats", "Must be a list of one or more of jpeg, png, heic and webp.");
      } else if (new Set(formats).size !== formats.length) {
        check.issue("formats", "Name each format once.");
      }
    }
  },
  isEmpty: (value) => value === undefined || value === null || (Array.isArray(value) && value.length === 0),
  validate: (value, field) => {
    if (!Array.isArray(value) || !value.every(isPhotoRef)) return "Add a photo.";
    const limits = photoLimits(field);
    if (value.length > limits.maxFiles) return photoCountMessage(field);
    const refs = value as unknown as PhotoRef[];
    if (new Set(refs.map((r) => r.id)).size !== refs.length) return "Each photo can be added once.";
    if (refs.some((r) => !limits.mimeTypes.includes(r.type.toLowerCase()))) return photoTypeMessage(field);
    if (refs.some((r) => r.size > limits.maxBytes)) return photoSizeMessage(field);
    return null;
  },
  normalize: (value) => (Array.isArray(value) && value.every(isPhotoRef) ? photoRefs(value) : value),
  summarize: (value) => photoRefs(value).map((r) => r.name || "Photo").join(", "),
  samples: () => [[{ id: "sample-photo", name: "photo.jpg", type: "image/jpeg", size: 1024 }]],
};
