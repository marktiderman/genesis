/**
 * The `photo` renderer: choose a photo (or, on a phone or tablet, take one),
 * see it as a thumbnail, remove it. The file goes to the host's `upload`
 * (`UploadContext`, or `onUpload` on `<Form>`); the answer keeps only the
 * reference the host returns. Type, size and count are checked here first,
 * so a respondent hears why at once; the host's server checks them again.
 */
import { useContext, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { FormError } from "@marktiderman/genesis-ui/form-field";
import { Input } from "@marktiderman/genesis-ui/input";
import { Spinner } from "@marktiderman/genesis-ui/spinner";
import { cn } from "@marktiderman/genesis-ui/utils";
import {
  isPhotoRef,
  photoCountMessage,
  photoLimits,
  photoRefs,
  photoSizeMessage,
  photoTypeMessage,
  type FieldBlock,
  type PhotoRef,
} from "@marktiderman/genesis-forms";
import { useFormSelector, type FieldRendererProps, type RendererEntry } from "@marktiderman/genesis-forms-react";
import { FieldChrome } from "./chrome";
import { PendingUploadsContext, useUpload } from "./upload";

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const HEIC_NAME = /\.hei[cf]$/i;

/** The file's type as the field judges it: some browsers give a HEIC photo no type, so its name decides. */
export function photoFileType(file: { name: string; type: string }): string {
  const type = file.type.toLowerCase();
  if (type) return type;
  return HEIC_NAME.test(file.name) ? (file.name.toLowerCase().endsWith(".heif") ? "image/heif" : "image/heic") : "";
}

/** Why a picked file can't be added, or null when it can. */
export function photoFileProblem(field: FieldBlock, file: { name: string; type: string; size: number }): string | null {
  const limits = photoLimits(field);
  if (!limits.mimeTypes.includes(photoFileType(file))) return photoTypeMessage(field);
  if (file.size <= 0 || file.size > limits.maxBytes) return photoSizeMessage(field);
  return null;
}

/** The `accept` attribute for a field: its MIME types, plus HEIC's file names for browsers that give it no type. */
export function photoAccept(field: FieldBlock): string {
  const limits = photoLimits(field);
  return [...limits.mimeTypes, ...(limits.formats.includes("heic") ? [".heic", ".heif"] : [])].join(",");
}

interface Uploading {
  key: string;
  name: string;
  preview: string | null;
}

/** The thumbnail of one photo: its picture when there is a preview the browser can draw, else its name. */
function Tile({ name, preview, busy }: { name: string; preview: string | null; busy?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative size-24 overflow-hidden rounded-md border bg-muted sm:size-28">
      {preview && !failed ? (
        <img src={preview} alt={name} className={cn("size-full object-cover", busy && "opacity-60")} onError={() => setFailed(true)} />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
          <ImageIcon className="size-6" />
          <span className="line-clamp-2 break-all">{name}</span>
        </div>
      )}
      {busy ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}

let nextKey = 0;

function PhotoField(props: FieldRendererProps) {
  const { binding, inputId, engine } = props;
  const { field } = binding;
  const host = useUpload();
  const pending = useContext(PendingUploadsContext);
  const locked = useFormSelector(engine, (s) => s.status === "completed");
  const limits = photoLimits(field);
  const refs = photoRefs(binding.value);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [coarse, setCoarse] = useState(false);
  // Previews of photos picked here, by reference id; revoked when removed or unmounted.
  const previews = useRef(new Map<string, string>());
  // Uploads still counted as in flight, released on unmount so a form left mid-upload can still send.
  const releases = useRef(new Set<() => void>());
  const chooseRef = useRef<HTMLInputElement>(null);
  const takeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCoarse(typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const urls = previews.current;
    const pendingReleases = releases.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      for (const release of pendingReleases) release();
      pendingReleases.clear();
    };
  }, []);

  const currentRefs = () => photoRefs(engine.getState().values[field.id]);
  const full = refs.length + uploading.length >= limits.maxFiles;
  const disabled = !host || locked;

  const add = (files: File[]) => {
    if (!host) return;
    setProblem(null);
    let room = limits.maxFiles - currentRefs().length - uploading.length;
    for (const file of files) {
      if (room <= 0) {
        setProblem(photoCountMessage(field));
        break;
      }
      const why = photoFileProblem(field, file);
      if (why) {
        setProblem(why);
        continue;
      }
      room--;
      const key = `u${nextKey++}`;
      const preview = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
      setUploading((list) => [...list, { key, name: file.name, preview }]);
      const release = pending?.start() ?? (() => {});
      releases.current.add(release);
      const finish = () => {
        release();
        releases.current.delete(release);
        setUploading((list) => list.filter((u) => u.key !== key));
      };
      host
        .upload(file, field)
        .then((ref: PhotoRef) => {
          if (!isPhotoRef(ref)) throw new Error("The upload returned no photo reference.");
          if (preview) previews.current.set(ref.id, preview);
          const next = [...currentRefs().filter((r) => r.id !== ref.id), { id: ref.id, name: ref.name, type: ref.type, size: ref.size }];
          binding.setValue(next);
          finish();
        })
        .catch(() => {
          if (preview) URL.revokeObjectURL(preview);
          setProblem(`“${file.name}” didn't upload. Try again.`);
          finish();
        });
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Cleared, so picking the same file again after removing it still fires.
    e.target.value = "";
    add(files);
  };

  const remove = (ref: PhotoRef) => {
    const url = previews.current.get(ref.id);
    if (url) URL.revokeObjectURL(url);
    previews.current.delete(ref.id);
    const next = currentRefs().filter((r) => r.id !== ref.id);
    binding.setValue(next.length ? next : undefined);
    setProblem(null);
  };

  const accept = photoAccept(field);
  const errorId = `${inputId}-upload-error`;
  const hasAny = refs.length > 0 || uploading.length > 0;

  return (
    <FieldChrome props={props}>
      <div className="space-y-3">
        {hasAny ? (
          <ul className="flex flex-wrap gap-3" aria-label="Photos">
            {refs.map((ref) => (
              <li key={ref.id} className="relative">
                <Tile name={ref.name} preview={previews.current.get(ref.id) ?? null} />
                {locked ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Remove ${ref.name}`}
                    onClick={() => remove(ref)}
                    className="absolute right-1 top-1 size-7 rounded-full shadow-sm"
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
            {uploading.map((u) => (
              <li key={u.key} aria-label={`Uploading ${u.name}`}>
                <Tile name={u.name} preview={u.preview} busy />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || full}
            aria-invalid={binding.error ? true : undefined}
            onClick={() => chooseRef.current?.click()}
          >
            <ImageIcon /> {refs.length ? "Add another photo" : "Choose a photo"}
          </Button>
          {coarse ? (
            <Button type="button" variant="outline" disabled={disabled || full} onClick={() => takeRef.current?.click()}>
              <CameraIcon /> Take a photo
            </Button>
          ) : null}
        </div>
        <Input
          ref={chooseRef}
          type="file"
          accept={accept}
          multiple={limits.maxFiles > 1}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onChange={onPick}
        />
        <Input
          ref={takeRef}
          type="file"
          accept={accept}
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onChange={onPick}
        />
        {!host ? (
          <p className="text-sm text-muted-foreground">Photos can't be added here.</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {`Up to ${limits.maxFiles} ${limits.maxFiles === 1 ? "photo" : "photos"}, ${limits.maxSizeMb} MB each.`}
          </p>
        )}
        {problem ? (
          <FormError id={errorId} role="alert">
            {problem}
          </FormError>
        ) : null}
      </div>
    </FieldChrome>
  );
}

export const photoRenderers: RendererEntry[] = [{ type: "photo", Component: PhotoField }];
