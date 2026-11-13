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

/** The add button's words for a group labelled "Contacts": "Add Contact". */
export function fieldArrayAddLabel(label: string): string {
  return `Add ${label.replace(/s$/, "")}`;
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

/** The progress line over a wizard: "Step 2 of 4" and the percent. */
export function wizardProgressLabel(step: number, total: number): { step: string; percent: string } {
  const ratio = total > 1 ? (step + 1) / total : 1;
  return { step: `Step ${step + 1} of ${total}`, percent: `${Math.round(ratio * 100)}%` };
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

/**
 * Whether `file` matches an `accept` list ("image/*", ".pdf,.doc", "application/pdf"). No list
 * accepts everything.
 */
export function fileAccepted(file: PickedFileInfo, accept: string | undefined): boolean {
  if (!accept) return true;
  const type = (file.type ?? "").toLowerCase();
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((part) => {
      if (part.startsWith(".")) return name.endsWith(part);
      if (part.endsWith("/*")) return type.startsWith(part.slice(0, -1));
      return type === part;
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
