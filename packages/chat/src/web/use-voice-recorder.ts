/**
 * @feat:chat
 * Voice notes on the web: MediaRecorder (Opus in WebM, else MP4/AAC for
 * Safari), with an AnalyserNode read every 100 ms for a live level meter and,
 * at the end, the waveform the bubble draws before the audio loads.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_LIMITS, fileExtension, waveformPeaks } from "../core/media";
import type { LocalFile } from "../core/outbox";

export type VoiceRecorderState = "idle" | "requesting" | "recording" | "denied" | "unsupported" | "error";

export interface VoiceRecording {
  blob: Blob;
  /** The container's type without codec parameters, e.g. `audio/webm`. */
  contentType: string;
  name: string;
  durationMs: number;
  /** 48 peaks, 0–100. */
  waveform: number[];
}

export interface UseVoiceRecorderOptions {
  /** The longest recording; it stops itself there (`recordingLimitMs(role)`). Default five minutes. */
  maxMs?: number;
  /** Called about every 100 ms while recording (e.g. to tell the others). */
  onTick?: () => void;
  /** Called with the recording when it stopped itself at `maxMs`. */
  onLimit?: (recording: VoiceRecording) => void;
}

const SAMPLE_MS = 100;
const METER_BARS = 32;

/** The type to record in: Opus in WebM where the browser has it, else MP4 (Safari). */
export function pickVoiceMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Older browsers throw on unknown types.
    }
  }
  return "";
}

/** A recording as a file the outbox sends: a voice attachment with its duration and waveform. */
export function voiceFile(recording: VoiceRecording): LocalFile {
  return {
    data: recording.blob,
    name: recording.name,
    contentType: recording.contentType,
    previewUrl: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(recording.blob) : undefined,
    meta: { kind: "voice", durationMs: recording.durationMs, waveform: recording.waveform, bytes: recording.blob.size },
  };
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const maxMs = options.maxMs ?? CHAT_LIMITS.recordingMs;
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const opts = useRef(options);
  opts.current = options;
  const session = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    context: AudioContext | null;
    timer: ReturnType<typeof setInterval>;
    chunks: Blob[];
    samples: number[];
    startedAt: number;
    mimeType: string;
    discard: boolean;
    done: Promise<VoiceRecording | null>;
  } | null>(null);

  const cleanup = useCallback(() => {
    const s = session.current;
    if (!s) return;
    clearInterval(s.timer);
    for (const t of s.stream.getTracks()) t.stop();
    void s.context?.close().catch(() => undefined);
    session.current = null;
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const s = session.current;
    if (!s) return null;
    if (s.recorder.state !== "inactive") s.recorder.stop();
    return s.done;
  }, []);

  // Cancel while the browser still asks for the microphone: the answer is dropped.
  const abandoned = useRef(false);

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) {
      abandoned.current = true;
      setState((st) => (st === "requesting" ? "idle" : st));
      return;
    }
    s.discard = true;
    if (s.recorder.state !== "inactive") s.recorder.stop();
    else cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (session.current) return;
    const mimeType = pickVoiceMimeType();
    if (mimeType === null || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError("This browser can't record voice messages.");
      return;
    }
    setState("requesting");
    setError(null);
    abandoned.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
        setError("Microphone access is blocked. Allow it for this site in your browser's settings to record voice messages.");
      } else if (name === "NotFoundError") {
        setState("error");
        setError("No microphone was found.");
      } else {
        setState("error");
        setError("The microphone couldn't be started.");
      }
      return;
    }
    if (abandoned.current) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      setState("unsupported");
      setError("This browser can't record voice messages.");
      return;
    }

    let context: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        context = new Ctx();
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
      }
    } catch {
      context = null;
      analyser = null;
    }
    const buffer = analyser ? new Float32Array(analyser.fftSize) : null;

    const chunks: Blob[] = [];
    const samples: number[] = [];
    const startedAt = Date.now();
    let resolveDone!: (r: VoiceRecording | null) => void;
    const done = new Promise<VoiceRecording | null>((r) => (resolveDone = r));

    const timer = setInterval(() => {
      const s = session.current;
      if (!s) return;
      let level = 0;
      if (analyser && buffer) {
        analyser.getFloatTimeDomainData(buffer);
        for (let i = 0; i < buffer.length; i++) level = Math.max(level, Math.abs(buffer[i]!));
      }
      s.samples.push(level);
      setLevels((prev) => [...prev, level].slice(-METER_BARS));
      const elapsed = Date.now() - s.startedAt;
      setElapsedMs(elapsed);
      opts.current.onTick?.();
      if (elapsed >= maxMs && s.recorder.state === "recording") {
        void stop().then((r) => r && opts.current.onLimit?.(r));
      }
    }, SAMPLE_MS);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const s = session.current;
      const discard = s?.discard ?? true;
      const durationMs = Math.min(maxMs, Date.now() - startedAt);
      const contentType = (recorder.mimeType || mimeType || "audio/webm").split(";")[0]!.trim();
      cleanup();
      setState("idle");
      setElapsedMs(0);
      setLevels([]);
      if (discard || chunks.length === 0) {
        resolveDone(null);
        return;
      }
      const blob = new Blob(chunks, { type: contentType });
      const ext = fileExtension("", contentType) || "webm";
      resolveDone({
        blob,
        contentType,
        name: `voice-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.${ext}`,
        durationMs,
        waveform: waveformPeaks(samples, 48),
      });
    };

    session.current = { recorder, stream, context, timer, chunks, samples, startedAt, mimeType: mimeType ?? "", discard: false, done };
    recorder.start(250);
    setElapsedMs(0);
    setLevels([]);
    setState("recording");
  }, [cleanup, maxMs, stop]);

  // Leaving the screen mid-recording throws the recording away.
  useEffect(() => () => {
    const s = session.current;
    if (s) {
      s.discard = true;
      try {
        if (s.recorder.state !== "inactive") s.recorder.stop();
      } catch {
        // already stopped
      }
      clearInterval(s.timer);
      for (const t of s.stream.getTracks()) t.stop();
      void s.context?.close().catch(() => undefined);
      session.current = null;
    }
  }, []);

  return {
    state,
    recording: state === "recording",
    elapsedMs,
    maxMs,
    /** The latest levels, 0–1, newest last: a live meter. */
    levels,
    error,
    clearError: () => {
      setError(null);
      setState((s) => (s === "denied" || s === "error" || s === "unsupported" ? "idle" : s));
    },
    start,
    stop,
    cancel,
  };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;
