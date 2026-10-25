/**
 * @feat:chat
 * A voice note: play and pause, a waveform that fills as it plays and seeks
 * where you click, the time, a 1× / 1.5× / 2× speed toggle, and the
 * transcript when there is one. Only one voice note plays at a time.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "@marktiderman/genesis-ui";
import { formatDuration, nextPlaybackRate } from "../core/media";

/** The one playing now, paused when another starts. */
let playing: HTMLAudioElement | null = null;

export interface VoiceNoteProps {
  /** The audio's (signed) URL; while it loads the waveform still draws. */
  src: string | null | undefined;
  durationMs?: number | null;
  /** Peaks 0–100. */
  waveform?: number[] | null;
  transcript?: string | null;
  transcriptStatus?: "pending" | "ready" | "failed" | "off" | null;
  /** On the primary (own) bubble. */
  tone?: "default" | "primary";
  className?: string;
}

const BARS = 48;

function resample(peaks: number[] | null | undefined, n = BARS): number[] {
  if (!peaks || peaks.length === 0) return new Array(n).fill(12);
  if (peaks.length === n) return peaks;
  return Array.from({ length: n }, (_, i) => peaks[Math.min(peaks.length - 1, Math.floor((i / n) * peaks.length))] ?? 0);
}

export function VoiceNote({ src, durationMs, waveform, transcript, transcriptStatus, tone = "default", className }: VoiceNoteProps) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const [rate, setRate] = useState(1);
  const bars = resample(waveform);
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onPlay = () => {
      if (playing && playing !== el) playing.pause();
      playing = el;
      setPlaying(true);
    };
    const onPause = () => {
      if (playing === el) playing = null;
      setPlaying(false);
    };
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnded);
      if (playing === el) playing = null;
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  const toggle = () => {
    const el = audio.current;
    if (!el || !src) return;
    if (el.paused) {
      el.playbackRate = rate;
      void Promise.resolve(el.play?.()).catch(() => setPlaying(false));
    } else el.pause();
  };

  const seekTo = (fraction: number) => {
    const el = audio.current;
    const f = Math.max(0, Math.min(1, fraction));
    if (el && duration > 0) {
      el.currentTime = f * duration;
      setCurrent(f * duration);
    }
  };

  const onBarsClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width > 0) seekTo((e.clientX - box.left) / box.width);
  };

  // The waveform is a slider drawn as bars: Radix Slider draws a track and a
  // thumb, not a waveform, so the role and keys are written here (arrows ±5 s,
  // Home/End), on one focusable element.
  const onBarsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const step = 5 / duration;
    const keys: Record<string, number> = { ArrowRight: progress + step, ArrowUp: progress + step, ArrowLeft: progress - step, ArrowDown: progress - step, Home: 0, End: 1 };
    if (e.key in keys) {
      e.preventDefault();
      seekTo(keys[e.key]!);
    }
  };

  const shown = isPlaying || current > 0 ? current * 1000 : duration * 1000;
  const primary = tone === "primary";

  return (
    <div className={cn("flex min-w-[220px] max-w-full flex-col gap-1", className)} data-testid="genesis-chat-voice">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant={primary ? "secondary" : "default"}
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={toggle}
          disabled={!src}
          aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
          data-testid="genesis-chat-voice-play"
        >
          {isPlaying ? <Pause /> : <Play />}
        </Button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatDuration(current * 1000)} of ${formatDuration(duration * 1000)}`}
          className="flex h-8 flex-1 cursor-pointer items-center gap-[2px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onBarsClick}
          onKeyDown={onBarsKey}
        >
          {bars.map((peak, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "w-[3px] flex-1 rounded-full transition-colors",
                (i + 0.5) / bars.length <= progress
                  ? primary
                    ? "bg-primary-foreground"
                    : "bg-primary"
                  : primary
                    ? "bg-primary-foreground/40"
                    : "bg-muted-foreground/40",
              )}
              style={{ height: `${Math.max(12, peak)}%` }}
            />
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-7 shrink-0 rounded-full px-2 text-xs tabular-nums", primary && "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground")}
          onClick={() => setRate((r) => nextPlaybackRate(r))}
          aria-label={`Playback speed ${rate}×`}
          data-testid="genesis-chat-voice-rate"
        >
          {rate}×
        </Button>
      </div>
      <div className={cn("pl-11 text-xs tabular-nums", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatDuration(shown)}</div>
      {transcriptStatus === "pending" ? (
        <div className={cn("pl-11 text-xs italic", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>Transcribing…</div>
      ) : transcript ? (
        <Collapsible className="pl-11">
          <CollapsibleTrigger className={cn("text-xs font-medium underline-offset-2 hover:underline", primary ? "text-primary-foreground" : "text-primary")}>
            Transcript
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1 text-sm">{transcript}</CollapsibleContent>
        </Collapsible>
      ) : null}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript above is the caption */}
      <audio ref={audio} src={src ?? undefined} preload="metadata" className="hidden" />
    </div>
  );
}
