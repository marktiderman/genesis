// Form rules both form renderers follow: a repeating group's add and remove limits, a wizard
// step's visible fields, and the file checks of an upload field. The web's FieldArrayRenderer,
// WizardForm and FileUploadField and the phone's twins all go through these.

import type { ResourceFormFieldDef } from "../form-types";

/** Whether a repeating group with `count` items may add one, and may remove one. */
export function fieldArrayLimits(count: number, field: Pick<ResourceFormFieldDef, "arrayMin" | "arrayMax">): { canAdd: boolean; canRemove: boolean } {
  return {
    canAdd: field.arrayMax == null || count < field.arrayMax,
    canRemove: field.arrayMin == null || count > field.arrayMin,
  };
}

/**
 * The add button's words for a group: "Add Contact" for "Contacts", "Add Address" for
 * "Addresses", "Add Status" for "Status". The field's `arrayItemLabel` (its one item's name)
 * wins over the guess, for a plural English doesn't make with an "s".
 */
export function fieldArrayAddLabel(label: string, itemLabel?: string | undefined): string {
  return `Add ${itemLabel ?? singularOf(label)}`;
}

/** An English plural's singular, for the usual endings; anything else is kept as it is. */
function singularOf(word: string): string {
  if (/[^aeiou]ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/i.test(word)) return word.slice(0, -2);
  if (/(?:ss|us|is)$/i.test(word)) return word;
  return word.replace(/s$/i, "");
}

/** A wizard step's fields, in the form's order, without those hidden for these values. */
export function wizardStepFields<F extends Pick<ResourceFormFieldDef, "key" | "visible">>(
  fields: readonly F[],
  stepFields: readonly string[],
  values: Record<string, unknown>,
): F[] {
  const keys = new Set(stepFields);
  return fields.filter((f) => keys.has(f.key) && f.visible?.(values) !== false);
}

/** The progress line over a wizard, from `useWizard()`'s state: "Step 2 of 4" and its `progress` as a percent. */
export function wizardProgressLabel(wizard: { currentStep: number; totalSteps: number; progress: number }): { step: string; percent: string } {
  return { step: `Step ${wizard.currentStep + 1} of ${wizard.totalSteps}`, percent: `${Math.round(wizard.progress * 100)}%` };
}

/** Default most a file may weigh: 10 MB. */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** A file's size in words: "512 B", "1.5 KB", "3.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What an upload field needs to know about a picked file, on either platform. */
export interface PickedFileInfo {
  name: string;
  /** MIME type, e.g. "image/png". Empty when unknown. */
  type?: string | undefined;
  /** Bytes, when known. */
  size?: number | undefined;
}

/** The MIME type a file's extension says it is, for the common kinds and for programs. */
const TYPE_OF_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", ico: "image/vnd.microsoft.icon",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", md: "text/markdown", json: "application/json",
  html: "text/html", htm: "text/html", xml: "application/xml", zip: "application/zip",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  exe: "application/x-msdownload", msi: "application/x-msi", dmg: "application/x-apple-diskimage",
  apk: "application/vnd.android.package-archive", bat: "application/x-bat", cmd: "application/x-bat",
  com: "application/x-msdownload", scr: "application/x-msdownload", sh: "application/x-sh",
  js: "text/javascript", jar: "application/java-archive",
};

/** A MIME type without its parameters, in lower case: "text/plain;charset=utf-8" is "text/plain". */
function bareType(type: string | undefined): string {
  return ((type ?? "").split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * Whether `file` matches an `accept` list ("image/*", ".pdf,.doc", "application/pdf"). No list
 * accepts everything.
 *
 * A MIME entry checks the type the picker reported (parameters dropped) and the type the name's
 * extension says, and every one that is known must match: "a.exe" sent as "image/png" fails
 * "image/*", and "PHOTO.PNG" with no type (as native pickers often send it) passes. An extension
 * entry checks the name.
 *
 * This is a check for the person picking, so a wrong file is turned away with a reason. It is
 * not a security boundary: a name and a type are whatever the sender says. Check what is stored
 * on the server.
 */
function fileAccepted(file: PickedFileInfo, accept: string | undefined): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  const types = [bareType(file.type), dot === -1 ? "" : (TYPE_OF_EXTENSION[name.slice(dot + 1)] ?? "")].filter(Boolean);
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => {
      if (part.startsWith(".")) return name.endsWith(part);
      const wanted = bareType(part);
      if (types.length === 0) return false;
      return types.every((type) => (wanted.endsWith("/*") ? type.startsWith(wanted.slice(0, -1)) : type === wanted));
    });
}

/**
 * Why `file` can't be added, in words, or `null` when it can: too heavy for `maxSize`, or not a
 * type `accept` lists.
 */
export function fileProblem(file: PickedFileInfo, options: { accept?: string | undefined; maxSize?: number | undefined }): string | null {
  const maxSize = options.maxSize ?? DEFAULT_MAX_FILE_SIZE;
  if (file.size != null && file.size > maxSize) return `"${file.name}" exceeds ${formatFileSize(maxSize)} limit`;
  if (!fileAccepted(file, options.accept)) return `"${file.name}" is not an accepted file type`;
  return null;
}

/** An upload field's `accept`: the field's, else images for an image field. */
export function fieldAccept(field: Pick<ResourceFormFieldDef, "accept" | "type">): string | undefined {
  return field.accept ?? (field.type === "image" ? "image/*" : undefined);
}
