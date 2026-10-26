/**
 * @feat:chat
 * What a message carries: photos in a grid of up to four with a lightbox,
 * voice notes, videos, files as a chip, links, and the app's own kinds (a
 * form, a lesson) through the `attachment` slot, a generic card by default.
 * Pending uploads draw from their local previews with a spinner.
 */
import { useCallback, useState, type ComponentType, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Link2, Paperclip } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Spinner,
  VisuallyHidden,
  cn,
} from "@marktiderman/genesis-ui";
import type { ChatAttachment, ChatMessage } from "../core/types";
import type { ChatAttachmentKind } from "../react/index";
import { ChatAttachmentCard, type ChatAttachmentCardProps } from "./cards";
import { ChatErrorBoundary } from "./error-boundary";
import { formatBytes } from "./format";
import { isSafeHref } from "./markdown";
import { ChatVideoPlayer } from "./video";
import { VoiceNote } from "./voice-note";

/** One attachment as the renderers draw it, sent or still uploading. */
export interface AttachmentView {
  key: string;
  kind: string;
  /** Signed URL, or the local preview while uploading. */
  url: string | null;
  posterUrl: string | null;
  name: string | null;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
  transcript: string | null;
  transcriptStatus: ChatAttachment["transcriptStatus"];
  /** Still uploading (or the server says it is still processing). */
  pending: boolean;
  /** The stored attachment; absent while it uploads. */
  attachment?: ChatAttachment;
}

/** Props the `attachment` slot receives, for kinds the package doesn't draw (form, lesson…). */
export interface ChatAttachmentSlotProps {
  attachment: ChatAttachment;
  message: ChatMessage;
  /** Its signed URL when it has a file. */
  url: string | null;
  mine: boolean;
}

export const BUILT_IN_KINDS = new Set(["image", "voice", "video", "file", "link"]);

export function toAttachmentView(a: ChatAttachment, urls: Record<string, string>): AttachmentView {
  return {
    key: a.id,
    kind: a.kind,
    url: (a.path ? urls[a.path] : null) ?? (a.provider === "external" ? a.url : null) ?? (a.kind === "link" ? a.url : null),
    posterUrl: a.posterPath ? (urls[a.posterPath] ?? null) : null,
    name: a.name,
    mime: a.mime,
    bytes: a.bytes,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    waveform: a.waveform,
    transcript: a.transcript,
    transcriptStatus: a.transcriptStatus,
    pending: a.status === "pending",
    attachment: a,
  };
}

/** Generic card for an app's own kind, when no `attachment` slot is given. */
export function GenericAttachment({ attachment, url }: ChatAttachmentSlotProps) {
  const label = attachment.name ?? attachment.kind.charAt(0).toUpperCase() + attachment.kind.slice(1);
  const body = (
    <>
      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs capitalize text-muted-foreground">{attachment.kind}</span>
      </span>
    </>
  );
  return url && isSafeHref(url) ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border bg-background p-2 text-foreground hover:bg-accent">
      {body}
    </a>
  ) : (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-2 text-foreground">{body}</div>
  );
}

function Uploading({ className }: { className?: string }) {
  return (
    <span className={cn("absolute inset-0 flex items-center justify-center bg-background/40", className)} aria-label="Uploading" role="status">
      <Spinner size="sm" className="text-foreground" />
    </span>
  );
}

export interface ImageGridProps {
  images: AttachmentView[];
  className?: string;
}

/** Up to four photos in a grid (a "+N" on the fourth for more), opening a lightbox. */
export function ImageGrid({ images, className }: ImageGridProps) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = images.slice(0, 4);
  const more = images.length - shown.length;
  const cols = shown.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <>
      <div className={cn("grid w-[min(18rem,100%)] gap-1 overflow-hidden rounded-xl", cols, className)} data-testid="genesis-chat-images">
        {shown.map((img, i) => {
          const tall = shown.length === 3 && i === 0;
          return (
            <button
              key={img.key}
              type="button"
              className={cn(
                "relative block overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                shown.length === 1 ? "max-h-80" : "aspect-square",
                tall && "row-span-2 aspect-auto",
              )}
              onClick={() => setOpen(i)}
              aria-label={`Open photo${img.name ? ` ${img.name}` : ""}`}
            >
              {img.url ? (
                <img
                  src={img.url}
                  alt={img.name ?? "Photo"}
                  loading="lazy"
                  className={cn("h-full w-full object-cover", img.pending && "opacity-70")}
                  width={img.width ?? undefined}
                  height={img.height ?? undefined}
                />
              ) : (
                <span className="block h-full min-h-24 w-full animate-pulse bg-muted" />
              )}
              {img.pending ? <Uploading /> : null}
              {more > 0 && i === shown.length - 1 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-xl font-semibold text-background">+{more}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <Lightbox images={images} index={open} onIndexChange={setOpen} />
    </>
  );
}

export interface LightboxProps {
  images: AttachmentView[];
  /** The photo shown; null closes it. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}

/** A photo full size, with the previous and next ones on the arrow keys. */
export function Lightbox({ images, index, onIndexChange }: LightboxProps) {
  const img = index === null ? null : images[index];
  const go = useCallback(
    (delta: number) => {
      if (index === null || images.length < 2) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndexChange],
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };
  return (
    <Dialog open={img != null} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent className="max-w-[min(64rem,95vw)] border-0 bg-background p-2" onKeyDown={onKey} data-testid="genesis-chat-lightbox">
        <VisuallyHidden>
          <DialogTitle>{img?.name ?? "Photo"}</DialogTitle>
          <DialogDescription>
            Photo {index === null ? 0 : index + 1} of {images.length}. Use the arrow keys for the others.
          </DialogDescription>
        </VisuallyHidden>
        {img?.url ? <img src={img.url} alt={img.name ?? "Photo"} className="mx-auto max-h-[80vh] w-auto rounded-md object-contain" /> : null}
        {images.length > 1 ? (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Previous photo">
              <ChevronLeft />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {(index ?? 0) + 1} / {images.length}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => go(1)} aria-label="Next photo">
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** A video: a hosted one (Mux) streams once ready and says "Processing…" until then; a file plays from storage. */
export function VideoAttachment({ view }: { view: AttachmentView }) {
  const a = view.attachment;
  const hosted = a != null && a.provider !== "storage" && a.provider !== "external" && a.provider !== "none";
  return (
    <ChatVideoPlayer
      src={hosted ? null : view.url}
      playbackId={hosted ? a.playbackId : null}
      poster={view.posterUrl}
      processing={hosted && a.status === "pending"}
      failed={a?.status === "failed"}
      uploading={!a && view.pending}
      label={view.name ?? "Video"}
    />
  );
}

export function FileChip({ view, tone = "default" }: { view: AttachmentView; tone?: "default" | "primary" }) {
  const primary = tone === "primary";
  const ext = (view.name?.split(".").pop() ?? "").toUpperCase();
  return (
    <div
      className={cn("flex w-[min(18rem,100%)] items-center gap-2 rounded-lg p-2", primary ? "bg-primary-foreground/15" : "border bg-background")}
      data-testid="genesis-chat-file"
    >
      <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-md", primary ? "bg-primary-foreground/20" : "bg-muted")}>
        {view.pending ? <Spinner size="sm" className={primary ? "text-primary-foreground" : undefined} /> : <FileText className="size-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{view.name ?? "File"}</span>
        <span className={cn("block text-xs", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {[ext, formatBytes(view.bytes)].filter(Boolean).join(" · ")}
          {view.pending ? " · Uploading…" : ""}
        </span>
      </span>
      {view.url && !view.pending ? (
        <Button
          asChild
          size="icon"
          variant="ghost"
          className={cn("size-8 shrink-0", primary && "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground")}
        >
          <a href={view.url} download={view.name ?? true} target="_blank" rel="noopener noreferrer" aria-label={`Download ${view.name ?? "file"}`}>
            <Download />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function LinkAttachment({ view, tone }: { view: AttachmentView; tone: "default" | "primary" }) {
  if (!view.url || !isSafeHref(view.url)) return null;
  let host = view.url;
  try {
    host = new URL(view.url).host;
  } catch {
    // shown as written
  }
  return (
    <a
      href={view.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("flex w-[min(18rem,100%)] items-center gap-2 rounded-lg p-2", tone === "primary" ? "bg-primary-foreground/15" : "border bg-background hover:bg-accent")}
    >
      <Link2 className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{view.name ?? host}</span>
        <span className="block truncate text-xs opacity-80">{host}</span>
      </span>
    </a>
  );
}

/** The app's kind for this name: its own key only (never `constructor` from the prototype), with a `title` function. */
export function attachmentKindOf(kinds: Record<string, ChatAttachmentKind> | undefined, kind: string): ChatAttachmentKind | null {
  if (!kinds || !Object.prototype.hasOwnProperty.call(kinds, kind)) return null;
  const k = kinds[kind];
  return k && typeof k.title === "function" ? k : null;
}

/**
 * What the app's kind says to draw for this attachment, or null when its functions throw or
 * return the wrong shapes (the attachment's `ref` is whatever the sender put there).
 */
export function attachmentCardOf(k: ChatAttachmentKind, a: ChatAttachment): Pick<ChatAttachmentCardProps, "title" | "subtitle" | "action"> | null {
  try {
    const title = k.title(a);
    if (typeof title !== "string") return null;
    const sub = typeof k.subtitle === "function" ? k.subtitle(a) : null;
    const act = typeof k.action === "function" ? k.action(a) : null;
    const action =
      act && typeof act === "object" && typeof act.label === "string" && (typeof act.href === "string" || typeof act.onPress === "function")
        ? { label: act.label, href: typeof act.href === "string" ? act.href : undefined, onPress: typeof act.onPress === "function" ? act.onPress : undefined }
        : null;
    return { title, subtitle: typeof sub === "string" ? sub : null, action };
  } catch (e) {
    console.error(`genesis-chat: the "${a.kind}" card couldn't be drawn`, e);
    return null;
  }
}

export interface MessageAttachmentsProps {
  views: AttachmentView[];
  message?: ChatMessage;
  mine: boolean;
  tone: "default" | "primary";
  /** For kinds the package doesn't draw; a generic card by default. */
  slot?: ComponentType<ChatAttachmentSlotProps> | null;
  /** Cards for registered app kinds (ChatProvider `attachmentKinds`), drawn before the slot. */
  kinds?: Record<string, ChatAttachmentKind>;
}

/** Every attachment of one message, photos grouped into one grid. */
export function MessageAttachments({ views, message, mine, tone, slot, kinds }: MessageAttachmentsProps) {
  if (views.length === 0) return null;
  const images = views.filter((v) => v.kind === "image");
  const others = views.filter((v) => v.kind !== "image");
  const Custom = slot === undefined ? GenericAttachment : slot;
  return (
    <div className="flex flex-col gap-1.5">
      {images.length ? <ImageGrid images={images} /> : null}
      {others.map((v) => {
        switch (v.kind) {
          case "voice":
            return (
              <VoiceNote
                key={v.key}
                src={v.url}
                durationMs={v.durationMs}
                waveform={v.waveform}
                transcript={v.transcript}
                transcriptStatus={v.transcriptStatus}
                tone={tone}
              />
            );
          case "video":
            return <VideoAttachment key={v.key} view={v} />;
          case "file":
            return <FileChip key={v.key} view={v} tone={tone} />;
          case "link":
            return <LinkAttachment key={v.key} view={v} tone={tone} />;
          default:
            if (!v.attachment || !message) return <FileChip key={v.key} view={v} tone={tone} />;
            const generic = <GenericAttachment attachment={v.attachment} message={message} url={v.url} mine={mine} />;
            const k = attachmentKindOf(kinds, v.kind);
            if (k) {
              const card = attachmentCardOf(k, v.attachment);
              return card ? <ChatAttachmentCard key={v.key} {...card} tone={tone} /> : <GenericAttachment key={v.key} attachment={v.attachment} message={message} url={v.url} mine={mine} />;
            }
            // The app's slot draws sender-controlled data: if it throws, the generic card stands in.
            return Custom ? (
              <ChatErrorBoundary key={v.key} fallback={generic}>
                <Custom attachment={v.attachment} message={message} url={v.url} mine={mine} />
              </ChatErrorBoundary>
            ) : null;
        }
      })}
    </div>
  );
}
