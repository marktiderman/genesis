/**
 * @feat:chat
 * The recorder machine on expo-audio: asks for the microphone, records with
 * metering on, reads the level every 100 ms for the live waveform (and to tell
 * the others you are recording), and hands back a voice note as a LocalFile
 * whose meta carries its duration and waveform, ready for `send`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        case "record":
          recorder.record();
          recording.current = true;
          stopTimer();
          timer.current = setInterval(() => {
            try {
              const s = recorder.getStatus();
              dispatch({ type: "tick", durationMs: s.durationMillis, meteringDb: s.metering });
            } catch {
              // A status read that fails is skipped; the next one counts.
            }
          }, latest.current.intervalMs ?? 100);
          return;
        case "finish":
          stopTimer();
          void (async () => {
            try {
              const status = recorder.getStatus();
              await recorder.stop();
              recording.current = false;
              const uri = recorder.uri ?? status.url;
              const durationMs = Math.max(after.durationMs, status.durationMillis || 0);
              if (uri) latest.current.onRecorded(voiceNoteFile(uri, durationMs, after.levels));
            } catch {
              // Nothing usable was recorded.
            } finally {
              releaseAudio();
              dispatch({ type: "finished" });
            }
          })();
          return;
        case "discard":
          attempt.current++;
          stopTimer();
          if (recording.current) {
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

  // Leaving the screen mid-recording throws the recording away.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current++;
      stateRef.current = idleRecorder;
      stopTimer();
      if (recording.current) {
        recording.current = false;
        void recorder.stop().catch(() => undefined);
      }
      releaseAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  return { state, dispatch };
}
