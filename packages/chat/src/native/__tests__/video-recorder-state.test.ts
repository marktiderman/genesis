// @feat:chat
import { describe, expect, it } from "vitest";
import { initialVideoRecorder, recordingType, videoRecorderStep, type VideoRecorderEvent, type VideoRecorderState } from "../video-recorder-state";

const config = { limitMs: 120_000 };
function run(events: VideoRecorderEvent[], from: VideoRecorderState = initialVideoRecorder()) {
  let state = from;
  const effects: string[] = [];
  for (const e of events) {
    const step = videoRecorderStep(state, e, config);
    state = step.state;
    effects.push(...step.effects.map((x) => (x.type === "haptic" ? `haptic:${x.event}` : x.type === "send" ? `send:${x.durationMs}` : x.type)));
  }
  return { state, effects };
}
const ready = run([{ type: "permissions", granted: true }, { type: "camera-ready" }]).state;

describe("the video recorder", () => {
  it("waits for both permissions and the camera before it records", () => {
    expect(run([{ type: "permissions", granted: false }]).state.phase).toBe("denied");
    expect(run([{ type: "permissions", granted: true }]).state.phase).toBe("starting");
    expect(run([{ type: "permissions", granted: true }, { type: "press", at: 0 }]).effects).toEqual([]);
    expect(ready.phase).toBe("ready");
  });

  it("hold: records while held and sends on release", () => {
    const r = run([{ type: "press", at: 1000 }, { type: "release", at: 4000 }, { type: "recorded", at: 4100, uri: "file:///a.mov" }], ready);
    expect(r.effects).toEqual(["start", "haptic:record-start", "stop", "send:3100", "haptic:send", "close"]);
  });

  it("tap: starts hands-free, and the next tap stops and sends", () => {
    const tapped = run([{ type: "press", at: 0 }, { type: "release", at: 100 }], ready);
    expect(tapped.state).toMatchObject({ phase: "recording", gesture: "tap" });
    expect(tapped.effects).toEqual(["start", "haptic:record-start"]);
    const r = run([{ type: "press", at: 5000 }, { type: "release", at: 5100 }, { type: "recorded", at: 5150, uri: "file:///a.mov" }], tapped.state);
    expect(r.effects).toEqual(["stop", "send:5150", "haptic:send", "close"]);
  });

  it("doesn't send a take under a second, and says why", () => {
    const r = run([{ type: "press", at: 0 }, { type: "release", at: 400 }, { type: "recorded", at: 600, uri: "file:///a.mov" }], ready);
    expect(r.effects).not.toContain("send:600");
    expect(r.state).toMatchObject({ phase: "ready", notice: "too-short" });
  });

  it("stops itself at the role's limit", () => {
    const r = run([{ type: "press", at: 0 }, { type: "release", at: 50 }, { type: "tick", at: 60_000 }, { type: "tick", at: 120_000 }], ready);
    expect(r.state.phase).toBe("stopping");
    expect(r.effects.filter((e) => e === "stop")).toHaveLength(1);
  });

  it("Cancel during a take throws it away and closes", () => {
    const r = run([{ type: "press", at: 0 }, { type: "release", at: 50 }, { type: "cancel" }, { type: "recorded", at: 3000, uri: "file:///a.mov" }], ready);
    expect(r.effects).toEqual(["start", "haptic:record-start", "stop", "haptic:record-cancel", "close"]);
  });

  it("flips only between takes", () => {
    expect(run([{ type: "flip" }], ready).state.facing).toBe("back");
    const recording = run([{ type: "press", at: 0 }], ready).state;
    expect(run([{ type: "flip" }], recording).state.facing).toBe("front");
  });

  it("a take with no file is lost on its own: nothing is sent and the camera stays ready", () => {
    const r = run([{ type: "press", at: 0 }, { type: "release", at: 2000 }, { type: "recorded", at: 2000, uri: null }], ready);
    expect(r.state).toMatchObject({ phase: "ready", notice: "take-failed" });
    expect(r.effects.some((e) => e.startsWith("send"))).toBe(false);
  });

  it("a very short take with no file says too short, not failed", () => {
    const r = run([{ type: "press", at: 0 }, { type: "release", at: 400 }, { type: "recorded", at: 450, uri: null }], ready);
    expect(r.state.notice).toBe("too-short");
  });

  it("waits for the other camera after a flip, and Try again restarts a camera that failed", () => {
    const flipped = run([{ type: "flip" }], ready).state;
    expect(flipped.phase).toBe("starting");
    expect(run([{ type: "press", at: 0 }], flipped).effects).toEqual([]);
    expect(run([{ type: "camera-ready" }], flipped).state.phase).toBe("ready");
    const failed = run([{ type: "camera-failed" }], ready).state;
    expect(failed.phase).toBe("failed");
    expect(run([{ type: "retry" }], failed).state).toMatchObject({ phase: "starting", cameraKey: 1 });
  });

  it("names the recording's type from its file", () => {
    expect(recordingType("file:///cache/Camera/abc.mov")).toEqual({ contentType: "video/quicktime", ext: "mov" });
    expect(recordingType("file:///data/abc.mp4")).toEqual({ contentType: "video/mp4", ext: "mp4" });
  });
});
