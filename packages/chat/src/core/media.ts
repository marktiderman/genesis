/**
 * @feat:chat
 * Media rules shared by every platform: which files may be sent (the same list
 * migration 0001 checks), what kind an upload becomes, the default limits, and
 * the waveform a voice note carries so its bubble draws before the audio loads.
 */
import type { AttachmentKind } from "./types";

/** Mirrors genesis_chat.allowed_extension. Never SVG or HTML, which a browser runs as a page. */
export const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "heic", "heif",
  "m4a", "aac", "mp3", "ogg", "oga", "opus", "weba", "webm",
  "mp4", "mov", "pdf", "txt", "csv", "docx", "xlsx", "pptx",
] as const;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** The extension a file is stored under: from its content type, else its name. */
export function fileExtension(name: string, contentType?: string): string {
  const base = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const fromType = MIME_EXTENSIONS[base];
  if (fromType) return fromType;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isAllowedExtension(ext: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

/** What an upload becomes in a message. */
export function attachmentKindFor(contentType: string, opts: { recordedVoice?: boolean } = {}): AttachmentKind {
  const t = contentType.toLowerCase();
  if (opts.recordedVoice || t.startsWith("audio/")) return "voice";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  return "file";
}

/** Default limits (decision 5): an app may lower them, not raise them past the bucket's 100 MB. */
export const CHAT_LIMITS = {
  /** Voice notes and videos, for members. */
  recordingMs: 5 * 60_000,
  /** For owners, admins and observers (coaches, staff). */
  staffRecordingMs: 10 * 60_000,
  fileBytes: 50 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  attachmentsPerMessage: 20,
  bodyChars: 10_000,
} as const;

/** The longest recording this role may make. */
export function recordingLimitMs(role: string | null | undefined): number {
  return role === "owner" || role === "admin" || role === "observer" ? CHAT_LIMITS.staffRecordingMs : CHAT_LIMITS.recordingMs;
}

/**
 * Peaks for a waveform: `count` values 0–100 from raw samples (-1…1), the loudest
 * in each bucket, scaled so the loudest bucket is 100. Quiet recordings still show
 * a shape; silence shows a flat line.
 */
export function waveformPeaks(samples: ArrayLike<number>, count = 48): number[] {
  const n = Math.max(1, Math.min(128, Math.floor(count)));
  if (samples.length === 0) return new Array(n).fill(0);
  const size = samples.length / n;
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    let peak = 0;
    const end = Math.min(samples.length, Math.floor((i + 1) * size));
    for (let j = Math.floor(i * size); j < end; j++) {
      const v = Math.abs(samples[j]!);
      if (v > peak) peak = v;
    }
    raw.push(peak);
  }
  const max = Math.max(...raw);
  if (max < 0.01) return raw.map(() => 0);
  return raw.map((v) => Math.round((v / max) * 100));
}

/**
 * Peaks from a level meter read while recording (expo-audio's `metering`, in dB,
 * about -160…0): resampled to `count` values 0–100.
 */
export function waveformFromMetering(levelsDb: number[], count = 48): number[] {
  const linear = levelsDb.map((db) => (Number.isFinite(db) ? Math.pow(10, Math.max(-60, Math.min(0, db)) / 20) : 0));
  return waveformPeaks(linear, count);
}

/** 0:42, 1:05:09. */
export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Playback speeds offered for voice and video (free for everyone, decision 5). */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;

export function nextPlaybackRate(rate: number): number {
  const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length]!;
}
