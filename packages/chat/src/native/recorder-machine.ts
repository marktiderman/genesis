/**
 * @feat:chat
 * The voice recorder as a state machine, apart from expo-audio so it can be
 * tested: hold the mic to record, slide left to cancel, slide up to lock and
 * record hands-free, release (or tap send when locked) to send. A recording
 * shorter than `minMs` is dropped, and one that reaches the role's limit is
 * sent. Each step returns the effects the hook carries out.
 */
import type { HapticEvent } from "./modules";

export type RecorderPhase = "idle" | "starting" | "recording" | "finishing";

export interface RecorderState {
  phase: RecorderPhase;
  /** Hands-free: released without stopping. */
  locked: boolean;
  /** The finger has slid far enough left that letting go cancels. */
  cancelArmed: boolean;
  /** Let go while the microphone was still starting. */
  releasedEarly: boolean;
  durationMs: number;
  /** Level readings (dB) since the start, for the live waveform and the sent one. */
  levels: number[];
  /** Why the last attempt ended without a voice note ("denied", "too-short", "error"). */
  notice: "denied" | "too-short" | "error" | null;
}

export const idleRecorder: RecorderState = {
  phase: "idle",
  locked: false,
  cancelArmed: false,
  releasedEarly: false,
  durationMs: 0,
  levels: [],
  notice: null,
};

export type RecorderEvent =
  | { type: "press" }
  | { type: "ready" }
  | { type: "failed"; reason: "denied" | "error" }
  | { type: "move"; dx: number; dy: number }
  | { type: "release" }
  | { type: "send" }
  | { type: "cancel" }
  | { type: "tick"; durationMs: number; meteringDb?: number }
  | { type: "finished" };

export type RecorderEffect =
  | { type: "prepare" }
  | { type: "record" }
  /** Stop and send what was recorded. */
  | { type: "finish" }
  /** Stop and throw it away. */
  | { type: "discard" }
  | { type: "haptic"; event: HapticEvent }
  /** Tell the others you are recording. */
  | { type: "signal" };

export interface RecorderConfig {
  /** The longest recording (recordingLimitMs(role)). */
  limitMs: number;
  /** Shorter than this is a tap, not a voice note. Default 700 ms. */
  minMs?: number;
  /** Points left that cancel. Default 120. */
  cancelDistance?: number;
  /** Points up that lock. Default 80. */
  lockDistance?: number;
  /** Most level readings kept (one every ~100 ms). Default 3000 (5 minutes). */
  maxLevels?: number;
}

export interface Step {
  state: RecorderState;
  effects: RecorderEffect[];
}

const stay = (state: RecorderState): Step => ({ state, effects: [] });

export function recorderStep(state: RecorderState, event: RecorderEvent, config: RecorderConfig): Step {
  const minMs = config.minMs ?? 700;
  const cancelDistance = config.cancelDistance ?? 120;
  const lockDistance = config.lockDistance ?? 80;
  const maxLevels = config.maxLevels ?? 3000;

  switch (event.type) {
    case "press":
      if (state.phase !== "idle") return stay(state);
      return { state: { ...idleRecorder, phase: "starting" }, effects: [{ type: "prepare" }] };

    case "ready":
      // A prepare that finished after its attempt was cancelled: let the microphone go.
      if (state.phase !== "starting") return { state, effects: [{ type: "discard" }] };
      if (state.releasedEarly) {
        return { state: { ...idleRecorder, notice: "too-short" }, effects: [{ type: "discard" }] };
      }
      return {
        state: { ...state, phase: "recording" },
        effects: [{ type: "record" }, { type: "haptic", event: "record-start" }, { type: "signal" }],
      };

    case "failed":
      if (state.phase === "idle") return stay(state);
      return { state: { ...idleRecorder, notice: event.reason }, effects: [{ type: "discard" }, { type: "haptic", event: "error" }] };

    case "move": {
      if (state.phase !== "recording" || state.locked) return stay(state);
      if (event.dx <= -cancelDistance) {
        return { state: idleRecorder, effects: [{ type: "discard" }, { type: "haptic", event: "record-cancel" }] };
      }
      if (event.dy <= -lockDistance) {
        return { state: { ...state, locked: true, cancelArmed: false }, effects: [{ type: "haptic", event: "record-lock" }] };
      }
      const cancelArmed = event.dx <= -cancelDistance / 2;
      return cancelArmed === state.cancelArmed ? stay(state) : stay({ ...state, cancelArmed });
    }

    case "release":
      if (state.phase === "starting") return stay({ ...state, releasedEarly: true });
      if (state.phase !== "recording" || state.locked) return stay(state);
      if (state.cancelArmed) {
        return { state: idleRecorder, effects: [{ type: "discard" }, { type: "haptic", event: "record-cancel" }] };
      }
      if (state.durationMs < minMs) {
        return { state: { ...idleRecorder, notice: "too-short" }, effects: [{ type: "discard" }] };
      }
      return { state: { ...state, phase: "finishing" }, effects: [{ type: "finish" }, { type: "haptic", event: "send" }] };

    case "send":
      if (state.phase !== "recording") return stay(state);
      if (state.durationMs < minMs) {
        return { state: { ...idleRecorder, notice: "too-short" }, effects: [{ type: "discard" }] };
      }
      return { state: { ...state, phase: "finishing" }, effects: [{ type: "finish" }, { type: "haptic", event: "send" }] };

    case "cancel":
      if (state.phase === "idle" || state.phase === "finishing") return stay(state);
      return { state: idleRecorder, effects: [{ type: "discard" }, { type: "haptic", event: "record-cancel" }] };

    case "tick": {
      if (state.phase !== "recording") return stay(state);
      const levels =
        event.meteringDb === undefined ? state.levels : [...state.levels, event.meteringDb].slice(-maxLevels);
      const next = { ...state, durationMs: event.durationMs, levels };
      if (event.durationMs >= config.limitMs) {
        return { state: { ...next, phase: "finishing" }, effects: [{ type: "finish" }, { type: "haptic", event: "send" }] };
      }
      return { state: next, effects: [{ type: "signal" }] };
    }

    case "finished":
      return stay(idleRecorder);
  }
}

/** The last `count` levels as bar heights 0–1, for the live waveform while recording. */
export function liveBars(levelsDb: readonly number[], count = 32): number[] {
  const recent = levelsDb.slice(-count);
  const bars = recent.map((db) => (Number.isFinite(db) ? Math.max(0, Math.min(1, (Math.max(-60, db) + 60) / 60)) : 0));
  return [...new Array(Math.max(0, count - bars.length)).fill(0), ...bars];
}
