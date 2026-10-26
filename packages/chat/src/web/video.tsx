/**
 * @feat:chat
 * Video on the web. Recording: `useVideoRecorder` (camera and microphone through
 * MediaRecorder, a live preview, a limit by role, retake) and `ChatVideoRecorder`, the
 * composer's dialog around it, which sends through the provider's `videoUpload` (a Mux direct
 * upload: PUT the recording, then send a pending video attachment) or, without it, as a file
 * to storage. Playback: `ChatVideoPlayer`, Mux HLS with native HLS where the browser has it
 * (Safari) and `hls.js`, loaded only then, elsewhere; "Processing…" while Mux works.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, RotateCcw, SendHorizontal, Square, Video, VideoOff } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@marktiderman/genesis-ui";
import { fileExtension, formatDuration } from "../core/media";
import type { LocalFile } from "../core/outbox";
import type { AttachmentInput, SendInput } from "../core/types";
import type { ChatVideoUpload } from "../react/index";

// ── Recording ─────────────────────────────────────────────────────────────────

export type VideoRecorderState = "idle" | "requesting" | "previewing" | "recording" | "recorded" | "denied" | "unsupported" | "error";

export interface VideoRecording {
  blob: Blob;
  /** Without codec parameters: `video/webm` or `video/mp4`. */
  contentType: string;
  name: string;
  durationMs: number;
  /** An object URL for playback before sending. */
  url: string | null;
}

/** MP4 where the browser records it (Safari, recent Chrome), else WebM. */
export function pickVideoMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Older browsers throw on unknown types.
    }
  }
  return "";
}

export interface UseVideoRecorderOptions {
  /** It stops itself here (`recordingLimitMs(role)`). */
  maxMs: number;
  /** About every second while recording (to tell the others). */
  onTick?: () => void;
}

export function useVideoRecorder({ maxMs, onTick }: UseVideoRecorderOptions) {
  const [state, setState] = useState<VideoRecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<VideoRecording | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  // Bumped by reset (closing, unmounting): a camera that answers after that is turned off at once.
  const session = useRef(0);
  const tick = useRef(onTick);
  tick.current = onTick;

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const releaseUrl = () => {
    if (urlRef.current && typeof URL !== "undefined" && URL.revokeObjectURL) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  /** Asks for the camera and microphone and shows the preview. */
  const open = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || pickVideoMimeType() === null) {
      setState("unsupported");
      setError("This browser can't record video.");
      return false;
    }
    const token = session.current;
    setState("requesting");
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      if (token !== session.current) {
        // Closed (or unmounted, or opened again) while the browser asked: never keep this camera on.
        s.getTracks().forEach((t) => t.stop());
        return false;
      }
      if (streamRef.current && streamRef.current !== s) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = s;
      setStream(s);
      setState("previewing");
      return true;
    } catch (e) {
      if (token !== session.current) return false;
      const denied = e instanceof Error && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setState(denied ? "denied" : "error");
      setError(denied ? "Allow the camera and microphone in your browser's settings to record a video." : "The camera couldn't start.");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    const r = recorder.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    if (!streamRef.current && !(await open())) return;
    const s = streamRef.current!;
    const mime = pickVideoMimeType() ?? "";
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 2_500_000 }) : new MediaRecorder(s);
    } catch {
      stopStream();
      setState("error");
      setError("This browser can't record video.");
      return;
    }
    r.onerror = () => {
      stopTimer();
      r.onstop = null;
      recorder.current = null;
      stopStream();
      setState("error");
      setError("The recording stopped. Try again.");
    };
    releaseUrl();
    setRecording(null);
    chunks.current = [];
    r.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) chunks.current.push(ev.data);
    };
    r.onstop = () => {
      stopTimer();
      const durationMs = Date.now() - startedAt.current;
      const contentType = (r.mimeType || mime || "video/webm").split(";")[0]!.trim() || "video/webm";
      const blob = new Blob(chunks.current, { type: contentType });
      const url = typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : null;
      urlRef.current = url;
      setRecording({ blob, contentType, name: `video-${Date.now()}.${fileExtension("", contentType) || "webm"}`, durationMs, url });
      setState("recorded");
      // The camera light goes off while you review it.
      stopStream();
    };
    recorder.current = r;
    startedAt.current = Date.now();
    setElapsedMs(0);
    r.start(1000);
    setState("recording");
    timer.current = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsedMs(ms);
      tick.current?.();
      if (ms >= maxMs) stop();
    }, 250);
  }, [maxMs, open, stop, stopStream]);

  /** Throws the take away and opens the camera again. */
  const retake = useCallback(async () => {
    releaseUrl();
    setRecording(null);
    setElapsedMs(0);
    await open();
  }, [open]);

  /**
   * The take's object URL now belongs to whoever it was handed to (the outbox frees it once the
   * message lands): reset no longer revokes it.
   */
  const handOff = useCallback(() => {
    urlRef.current = null;
  }, []);

  /** Stops everything and forgets the take. */
  const reset = useCallback(() => {
    session.current += 1;
    stopTimer();
    const r = recorder.current;
    if (r && r.state !== "inactive") {
      r.onstop = null;
      r.stop();
    }
    recorder.current = null;
    stopStream();
    releaseUrl();
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setState("idle");
  }, [stopStream]);

  useEffect(() => () => reset(), [reset]);

  return { state, error, elapsedMs, maxMs, stream, recording, open, start, stop, retake, reset, handOff };
}

export type VideoRecorder = ReturnType<typeof useVideoRecorder>;

/**
 * A recording as a file for the outbox: `hosted` sends it to the hosted provider (the provider's
 * `videoUpload`, the message going at once with the video pending); otherwise it goes to storage.
 */
export function videoFile(rec: VideoRecording, opts: { hosted?: boolean } = {}): LocalFile {
  return {
    data: rec.blob,
    name: rec.name,
    contentType: rec.contentType,
    previewUrl: rec.url ?? undefined,
    meta: { kind: "video", durationMs: rec.durationMs, bytes: rec.blob.size },
    ...(opts.hosted ? { hosted: true } : {}),
  };
}

/**
 * Uploads a recording through the app's `videoUpload` (a Mux direct upload: PUT the bytes to
 * the URL it returns) and gives back the attachment to send, pending until Mux's webhook marks
 * it ready. The composer no longer uses it: it sends `videoFile(rec, { hosted: true })` through
 * the outbox, so the message keeps its place in the order while the bytes go up.
 */
export async function uploadVideo(
  videoUpload: ChatVideoUpload,
  conversationId: string,
  rec: Pick<VideoRecording, "blob" | "contentType" | "durationMs" | "name">,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AttachmentInput> {
  const upload = await videoUpload.create(conversationId);
  signal?.throwIfAborted?.();
  const res = await fetchImpl(upload.url, { method: "PUT", body: rec.blob, headers: { "Content-Type": rec.contentType }, signal });
  if (!res.ok) throw new Error(`The video didn't upload (${res.status})`);
  return {
    kind: "video",
    provider: upload.provider,
    providerId: upload.providerId,
    status: "pending",
    name: rec.name,
    mime: rec.contentType,
    bytes: rec.blob.size,
    durationMs: rec.durationMs,
  };
}

export interface ChatVideoRecorderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  maxMs: number;
  /** From useConversation: sends through the outbox. */
  send: (input: Omit<SendInput, "conversationId" | "clientId">, files?: LocalFile[]) => Promise<unknown>;
  /** Merged into what's sent (a reply, a topic, an internal note). */
  extra?: Omit<SendInput, "conversationId" | "clientId" | "attachments" | "body">;
  videoUpload?: ChatVideoUpload;
  onTick?: () => void;
  onSent?: () => void;
  /** @deprecated Unused: the bytes go through the outbox's `hostedUpload` now. */
  fetchImpl?: typeof fetch;
}

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      (el as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = stream;
    } catch {
      // happy-dom and old engines
    }
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Camera preview" data-testid="genesis-chat-video-preview" />;
}

/** The composer's video dialog: preview, record (to the role's limit), review, retake, send. */
export function ChatVideoRecorder({ open, onOpenChange, maxMs, send, extra, videoUpload, onTick, onSent }: ChatVideoRecorderProps) {
  const rec = useVideoRecorder({ maxMs, onTick });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // One send at a time; once sent, the outbox owns the upload (its Delete cancels it).
  const sendingNow = useRef(false);
  const { open: openCamera, reset } = rec;

  useEffect(() => {
    if (open) void openCamera();
    else reset();
  }, [open, openCamera, reset]);

  const submit = async () => {
    const take = rec.recording;
    if (!take || sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    setSendError(null);
    try {
      // Through the outbox either way, in its place in the order: shown at once, the take as its
      // preview (freed once it lands). Hosted, the message goes while the bytes go up.
      await send({ ...extra, body: "" }, [videoFile(take, { hosted: Boolean(videoUpload) })]);
      rec.handOff();
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "The video didn't send");
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  };


  const recording = rec.state === "recording";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="genesis-chat-video-recorder">
        <DialogHeader>
          <DialogTitle>Record a video</DialogTitle>
          <DialogDescription>Up to {formatDuration(maxMs)}. You can watch it before you send it.</DialogDescription>
        </DialogHeader>
        {rec.error ? (
          <Alert variant="destructive">
            <VideoOff className="size-4" aria-hidden />
            <AlertDescription>{rec.error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {rec.state === "recorded" && rec.recording?.url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- your own recording, reviewed before sending
            <video src={rec.recording.url} controls playsInline className="h-full w-full object-contain" aria-label="Your recording" data-testid="genesis-chat-video-review" />
          ) : rec.stream ? (
            <Preview stream={rec.stream} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              {rec.state === "requesting" ? <Spinner aria-label="Starting the camera" /> : <Video className="size-8 text-muted-foreground" aria-hidden />}
            </span>
          )}
          {recording ? (
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums" role="timer" aria-live="off">
              <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              {formatDuration(rec.elapsedMs)} / {formatDuration(maxMs)}
            </span>
          ) : null}
          {sending ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm font-medium" role="status">
              <Spinner /> Sending…
            </span>
          ) : null}
        </div>
        <div className="sr-only" role="status">
          {recording ? "Recording" : rec.state === "recorded" ? "Recorded. Watch it, retake it or send it." : ""}
        </div>
        {sendError ? (
          <p className="text-sm text-destructive" role="alert">
            {sendError}
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-3">
          {rec.state === "recorded" ? (
            <>
              <Button type="button" variant="outline" onClick={() => void rec.retake()} disabled={sending} data-testid="genesis-chat-video-retake">
                <RotateCcw /> Retake
              </Button>
              <Button type="button" onClick={() => void submit()} loading={sending} data-testid="genesis-chat-video-send">
                <SendHorizontal /> Send video
              </Button>
            </>
          ) : recording ? (
            <Button type="button" variant="destructive" className="rounded-full" onClick={rec.stop} aria-label="Stop recording" data-testid="genesis-chat-video-stop">
              <Square className="fill-current" /> Stop
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-full"
              onClick={() => void rec.start()}
              disabled={rec.state === "requesting" || rec.state === "unsupported"}
              aria-label="Start recording"
              data-testid="genesis-chat-video-record"
            >
              <Circle className="fill-destructive text-destructive" /> Record
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Playback ──────────────────────────────────────────────────────────────────

export const muxStreamUrl = (playbackId: string) => `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
export const muxPosterUrl = (playbackId: string) => `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg`;

export interface ChatVideoPlayerProps {
  /** A file URL (storage), when there is no playback id. */
  src?: string | null;
  /** Mux's playback id: streamed as HLS. */
  playbackId?: string | null;
  poster?: string | null;
  /** Mux is still working on it. */
  processing?: boolean;
  failed?: boolean;
  /** Still uploading from this device. */
  uploading?: boolean;
  label?: string;
  className?: string;
}

type HlsLike = { loadSource(url: string): void; attachMedia(el: HTMLMediaElement): void; destroy(): void };

/** Plays a chat video: Mux HLS (native, else hls.js loaded on demand), or a file. */
export function ChatVideoPlayer({ src, playbackId, poster, processing, failed, uploading, label, className }: ChatVideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hlsFailed, setHlsFailed] = useState(false);
  const stream = playbackId ? muxStreamUrl(playbackId) : null;

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    if (typeof el.canPlayType === "function" && el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = stream;
      return;
    }
    let hls: HlsLike | null = null;
    let cancelled = false;
    import("hls.js")
      .then((mod) => {
        const Hls = (mod as unknown as { default: { isSupported(): boolean; new (): HlsLike } }).default;
        if (cancelled) return;
        if (!Hls?.isSupported?.()) {
          setHlsFailed(true);
          return;
        }
        hls = new Hls();
        hls.loadSource(stream);
        hls.attachMedia(el);
      })
      .catch(() => {
        // hls.js is an optional peer: without it, browsers lacking native HLS can't stream.
        if (!cancelled) setHlsFailed(true);
      });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [stream]);

  const posterUrl = poster ?? (playbackId ? muxPosterUrl(playbackId) : null);
  if (failed) {
    return (
      <div className={cn("flex aspect-video w-[min(20rem,100%)] items-center justify-center gap-2 rounded-xl bg-muted text-sm text-muted-foreground", className)} data-testid="genesis-chat-video-failed">
        <VideoOff className="size-4" aria-hidden /> This video couldn't be processed
      </div>
    );
  }
  if (processing && !playbackId) {
    return (
      <div className={cn("flex aspect-video w-[min(20rem,100%)] flex-col items-center justify-center gap-2 rounded-xl bg-muted text-sm text-muted-foreground", className)} role="status" data-testid="genesis-chat-video-processing">
        <Spinner size="sm" /> Processing…
      </div>
    );
  }
  return (
    <div className={cn("relative w-[min(20rem,100%)] overflow-hidden rounded-xl bg-muted", className)} data-testid="genesis-chat-video">
      {stream || src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- transcripts come from the provider's captions
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          poster={posterUrl ?? undefined}
          src={stream ? undefined : (src ?? undefined)}
          className="block max-h-80 w-full"
          aria-label={label ?? "Video"}
          data-testid={stream ? "genesis-chat-video-hls" : undefined}
        />
      ) : (
        <span className="block aspect-video w-full animate-pulse bg-muted" />
      )}
      {hlsFailed ? <span className="absolute inset-x-0 bottom-0 bg-background/85 px-2 py-1 text-xs">This browser can't stream this video.</span> : null}
      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center bg-background/40" role="status" aria-label="Uploading">
          <Spinner size="sm" className="text-foreground" />
        </span>
      ) : null}
    </div>
  );
}
