/**
 * @feat:chat
 * The video recorder's rules, without React or the camera, so they are tested
 * directly. One button does both gestures: a tap starts a recording that a
 * second tap stops (what VoiceOver and TalkBack do too), and a hold records
 * until the finger lifts. Stopping sends; Cancel throws the take away. The
 * camera flips only between takes (expo-camera stops a recording that flips).
 * A take the camera doesn't hand over is only that take: the camera stays
 * ready. A camera that fails to start offers Try again.
 */

export type VideoRecorderPhase = "asking" | "denied" | "starting" | "ready" | "recording" | "stopping" | "failed";

export interface VideoRecorderState {
  phase: VideoRecorderPhase;
  facing: "front" | "back";
  /** When recording began (ms, the clock the events carry). */
  startedAt: number;
  elapsedMs: number;
  /** "hold": a finger is down and lifting it stops; "tap": recording hands-free until the next tap. */
  gesture: "hold" | "tap" | "stop-on-release" | null;
  /** The take is to be thrown away when the camera hands it over. */
  discard: boolean;
  notice: "too-short" | "take-failed" | null;
  /** Bumped by Try again after the camera failed: the camera view starts over. */
  cameraKey: number;
}

export type VideoRecorderEvent =
  | { type: "permissions"; granted: boolean }
  | { type: "camera-ready" }
  | { type: "camera-failed" }
  | { type: "press"; at: number }
  | { type: "release"; at: number }
  | { type: "tick"; at: number }
  | { type: "recorded"; at: number; uri: string | null }
  | { type: "flip" }
  | { type: "retry" }
  | { type: "cancel" };

export type VideoRecorderEffect =
  | { type: "start" }
  | { type: "stop" }
  | { type: "send"; uri: string; durationMs: number }
  | { type: "close" }
  | { type: "haptic"; event: "record-start" | "send" | "record-cancel" | "error" };

export interface VideoRecorderConfig {
  limitMs: number;
  /** A press held this long is a hold; shorter is a tap. */
  holdMs?: number;
  /** Shorter takes aren't sent. */
  minMs?: number;
}

export const VIDEO_HOLD_MS = 350;
export const VIDEO_MIN_MS = 1000;

export const initialVideoRecorder = (facing: "front" | "back" = "front"): VideoRecorderState => ({
  phase: "asking",
  facing,
  startedAt: 0,
  elapsedMs: 0,
  gesture: null,
  discard: false,
  notice: null,
  cameraKey: 0,
});

type Step = { state: VideoRecorderState; effects: VideoRecorderEffect[] };

export function videoRecorderStep(state: VideoRecorderState, event: VideoRecorderEvent, config: VideoRecorderConfig): Step {
  const holdMs = config.holdMs ?? VIDEO_HOLD_MS;
  const minMs = config.minMs ?? VIDEO_MIN_MS;
  const same = { state, effects: [] as VideoRecorderEffect[] };
  const stop = (s: VideoRecorderState): Step => ({ state: { ...s, phase: "stopping", gesture: null }, effects: [{ type: "stop" }] });

  switch (event.type) {
    case "permissions":
      if (state.phase !== "asking") return same;
      return { state: { ...state, phase: event.granted ? "starting" : "denied" }, effects: [] };
    case "camera-ready":
      return state.phase === "starting" ? { state: { ...state, phase: "ready" }, effects: [] } : same;
    case "camera-failed":
      return state.phase === "starting" || state.phase === "ready" ? { state: { ...state, phase: "failed" }, effects: [{ type: "haptic", event: "error" }] } : same;
    case "press":
      if (state.phase === "ready") {
        return {
          state: { ...state, phase: "recording", startedAt: event.at, elapsedMs: 0, gesture: "hold", discard: false, notice: null },
          effects: [{ type: "start" }, { type: "haptic", event: "record-start" }],
        };
      }
      if (state.phase === "recording" && state.gesture === "tap") return { state: { ...state, gesture: "stop-on-release" }, effects: [] };
      return same;
    case "release":
      if (state.phase !== "recording") return same;
      if (state.gesture === "hold") return event.at - state.startedAt >= holdMs ? stop(state) : { state: { ...state, gesture: "tap" }, effects: [] };
      if (state.gesture === "stop-on-release") return stop(state);
      return same;
    case "tick":
      if (state.phase !== "recording") return same;
      {
        const elapsedMs = Math.max(0, event.at - state.startedAt);
        // The camera stops at the limit too (maxDuration); this keeps the button in step.
        if (elapsedMs >= config.limitMs) return stop({ ...state, elapsedMs: config.limitMs });
        return { state: { ...state, elapsedMs }, effects: [] };
      }
    case "recorded": {
      if (state.phase !== "recording" && state.phase !== "stopping") return same;
      const durationMs = Math.min(config.limitMs, Math.max(0, event.at - state.startedAt));
      const base: VideoRecorderState = { ...state, phase: "ready", gesture: null, elapsedMs: 0, discard: false };
      if (state.discard) return { state: base, effects: [{ type: "close" }] };
      // Too short first: a take stopped straight after it started often leaves no file at all.
      if (durationMs < minMs) return { state: { ...base, notice: "too-short" }, effects: [{ type: "haptic", event: "record-cancel" }] };
      // The camera is still there; only this take is lost.
      if (!event.uri) return { state: { ...base, notice: "take-failed" }, effects: [{ type: "haptic", event: "error" }] };
      return { state: base, effects: [{ type: "send", uri: event.uri, durationMs }, { type: "haptic", event: "send" }, { type: "close" }] };
    }
    case "flip":
      if (state.phase === "recording" || state.phase === "stopping") return same;
      // The preview restarts on the other camera: wait for it (the screen also gives it a moment).
      return { state: { ...state, facing: state.facing === "front" ? "back" : "front", phase: state.phase === "ready" ? "starting" : state.phase, notice: null }, effects: [] };
    case "retry":
      return state.phase === "failed" ? { state: { ...state, phase: "starting", cameraKey: state.cameraKey + 1, notice: null }, effects: [] } : same;
    case "cancel":
      if (state.phase === "recording") {
        return { state: { ...state, phase: "stopping", gesture: null, discard: true }, effects: [{ type: "stop" }, { type: "haptic", event: "record-cancel" }] };
      }
      if (state.phase === "stopping") return { state: { ...state, discard: true }, effects: [] };
      return { state, effects: [{ type: "close" }] };
  }
}

/** The kind of file a recording is, from its URI: .mov on iOS, .mp4 on Android. */
export function recordingType(uri: string): { contentType: string; ext: string } {
  const ext = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(uri)?.[1]?.toLowerCase() ?? "mp4";
  if (ext === "mov") return { contentType: "video/quicktime", ext };
  if (ext === "webm") return { contentType: "video/webm", ext };
  return { contentType: "video/mp4", ext: "mp4" };
}
