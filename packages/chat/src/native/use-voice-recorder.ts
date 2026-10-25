/**
 * @feat:chat
 * The recorder machine on expo-audio: asks for the microphone, records with
 * metering on, reads the level every 100 ms for the live waveform (and to tell
 * the others you are recording), and hands back a voice note as a LocalFile
 * whose meta carries its duration and waveform, ready for `send`.
 *
 * Interruptions end the attempt cleanly, with a notice: the app going to the
 * background, or the recorder stopping on its own (a phone call, Siri, another
 * app taking the microphone) or its status no longer reading. A stop that fails
 * or leaves no file says so. Leaving the screen while a stop is under way lets
 * that stop finish and send what was recorded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { waveformFromMetering } from "../core/media";
import type { LocalFile } from "../core/outbox";
import { haptic, type ExpoAudioLike, type HapticsLike } from "./modules";
import { idleRecorder, recorderStep, type RecorderConfig, type RecorderEffect, type RecorderEvent, type RecorderState } from "./recorder-machine";

export interface UseVoiceRecorderOptions extends Omit<RecorderConfig, "limitMs"> {
  limitMs: number;
  onRecorded: (file: LocalFile) => void;
  /** `useConversation().signalRecording` (throttled there). */
  signalRecording?: () => void;
  haptics?: HapticsLike;
  /** How often the level is read. Default 100 ms. */
  intervalMs?: number;
}

/** Reads in a row that show the recorder stopped (or can't be read) before it counts as interrupted. */
export const RECORDER_STALL_READS = 3;
/** Reads after `record()` that may pass before the recorder says it is recording; then the attempt failed. */
export const RECORDER_START_READS = 10;

/** The voice note a finished recording becomes. */
export function voiceNoteFile(uri: string, durationMs: number, levelsDb: readonly number[]): LocalFile {
  return {
    data: uri,
    name: "voice.m4a",
    contentType: "audio/mp4",
    meta: { kind: "voice", durationMs: Math.round(durationMs), waveform: waveformFromMetering([...levelsDb]) },
  };
}

export function useVoiceRecorder(audio: ExpoAudioLike, options: UseVoiceRecorderOptions) {
  const recorder = audio.useAudioRecorder(useMemo(() => ({ ...audio.RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }), [audio]));
  const [state, setState] = useState<RecorderState>(idleRecorder);
  const stateRef = useRef(state);
  const latest = useRef(options);
  latest.current = options;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recording = useRef(false);
  // A stop (finish) under way: unmounting leaves it to finish rather than stopping twice.
  const stopping = useRef(false);
  // Each press is an attempt; an async step that finishes after its attempt ended is dropped.
  const attempt = useRef(0);
  const mounted = useRef(true);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  // Never throws: letting the microphone go is best effort.
  const releaseAudio = () => {
    try {
      void Promise.resolve(audio.setAudioModeAsync({ allowsRecording: false })).catch(() => undefined);
    } catch {
      // The audio module is already gone.
    }
  };

  const dispatchRef = useRef<(event: RecorderEvent) => void>(() => undefined);

  const run = useCallback(
    (effect: RecorderEffect, after: RecorderState) => {
      const dispatch = dispatchRef.current;
      switch (effect.type) {
        case "prepare": {
          const mine = ++attempt.current;
          const current = () => mounted.current && attempt.current === mine && stateRef.current.phase === "starting";
          void (async () => {
            try {
              const permission = await audio.requestRecordingPermissionsAsync();
              if (!current()) return;
              if (!permission.granted) return dispatch({ type: "failed", reason: "denied" });
              await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
              if (!current()) return releaseAudio();
              await recorder.prepareToRecordAsync();
              if (!current()) return releaseAudio();
              dispatch({ type: "ready" });
            } catch {
              if (current()) dispatch({ type: "failed", reason: "error" });
              else releaseAudio();
            }
          })();
          return;
        }
        case "record": {
          try {
            recorder.record();
          } catch {
            dispatch({ type: "failed", reason: "error" });
            return;
          }
          recording.current = true;
          stopTimer();
          // Reads in a row where the recorder had stopped by itself or couldn't be read: a few
          // mean something else has the microphone, and the attempt ends instead of freezing.
          let stalled = 0;
          let sawRecording = false;
          let reads = 0;
          timer.current = setInterval(() => {
            reads++;
            let s: ReturnType<typeof recorder.getStatus> | null = null;
            try {
              s = recorder.getStatus();
            } catch {
              s = null;
            }
            if (s && s.isRecording) sawRecording = true;
            // Before the first read that says recording, a stopped recorder is still starting.
            const bad = !s || (sawRecording && !s.isRecording);
            stalled = bad ? stalled + 1 : 0;
            if (stalled >= RECORDER_STALL_READS) return dispatch({ type: "interrupted" });
            // record() that never started (the microphone was taken before it began): not a frozen 0:00.
            if (!sawRecording && reads >= RECORDER_START_READS) return dispatch({ type: "failed", reason: "error" });
            if (s && !bad) dispatch({ type: "tick", durationMs: s.durationMillis, meteringDb: s.metering });
          }, latest.current.intervalMs ?? 100);
          return;
        }
        case "finish":
          stopTimer();
          stopping.current = true;
          void (async () => {
            let ok = false;
            const read = <T,>(get: () => T): T | null => {
              try {
                return get();
              } catch {
                return null;
              }
            };
            try {
              const status = recorder.getStatus();
              // Known before the stop (from prepare): the native recorder may be released while it stops.
              const before = read(() => recorder.uri) ?? status.url;
              await recorder.stop();
              const uri = read(() => recorder.uri) ?? before;
              const durationMs = Math.max(after.durationMs, status.durationMillis || 0);
              if (uri) {
                latest.current.onRecorded(voiceNoteFile(uri, durationMs, after.levels));
                ok = true;
              }
            } catch {
              // Nothing usable was recorded: the notice says so.
            } finally {
              recording.current = false;
              stopping.current = false;
              releaseAudio();
              dispatch({ type: "finished", ok });
            }
          })();
          return;
        case "discard":
          attempt.current++;
          stopTimer();
          if (recording.current && !stopping.current) {
            recording.current = false;
            void recorder.stop().catch(() => undefined);
          }
          releaseAudio();
          return;
        case "haptic":
          haptic(latest.current.haptics, effect.event);
          return;
        case "signal":
          latest.current.signalRecording?.();
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audio, recorder],
  );

  const dispatch = useCallback(
    (event: RecorderEvent) => {
      if (!mounted.current) return;
      const { limitMs, minMs, cancelDistance, lockDistance, maxLevels } = latest.current;
      const step = recorderStep(stateRef.current, event, { limitMs, minMs, cancelDistance, lockDistance, maxLevels });
      if (step.state !== stateRef.current) {
        stateRef.current = step.state;
        setState(step.state);
      }
      for (const effect of step.effects) run(effect, step.state);
    },
    [run],
  );
  dispatchRef.current = dispatch;

  // Leaving the screen mid-recording throws the recording away; a stop under way finishes and sends.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current++;
      stateRef.current = idleRecorder;
      stopTimer();
      if (stopping.current) return;
      if (recording.current) {
        recording.current = false;
        try {
          void recorder.stop().catch(() => undefined);
        } catch {
          // The recorder is already gone.
        }
      }
      releaseAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  // The app going to the background ends a recording (iOS takes the microphone from a backgrounded
  // app). Only once recording: Android reports the microphone permission dialog as the background.
  useEffect(() => {
    const sub = AppState?.addEventListener?.("change", (next) => {
      if (next === "background" && stateRef.current.phase === "recording") dispatchRef.current({ type: "interrupted" });
    });
    return () => sub?.remove?.();
  }, []);

  return { state, dispatch };
}
