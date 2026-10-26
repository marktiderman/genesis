// @feat:chat
import { describe, expect, it } from "vitest";
import { idleRecorder, liveBars, recorderStep, type RecorderEvent, type RecorderState } from "../recorder-machine";

const config = { limitMs: 10_000 };

function run(events: RecorderEvent[], from: RecorderState = idleRecorder) {
  let state = from;
  const effects: string[] = [];
  for (const e of events) {
    const step = recorderStep(state, e, config);
    state = step.state;
    effects.push(...step.effects.map((x) => (x.type === "haptic" ? `haptic:${x.event}` : x.type)));
  }
  return { state, effects };
}

describe("recorderStep", () => {
  it("hold, record, release: sends", () => {
    const { state, effects } = run([
      { type: "press" },
      { type: "ready" },
      { type: "tick", durationMs: 500, meteringDb: -20 },
      { type: "tick", durationMs: 1500, meteringDb: -10 },
      { type: "release" },
    ]);
    expect(effects).toEqual(["prepare", "record", "haptic:record-start", "signal", "signal", "signal", "finish", "haptic:send"]);
    expect(state.phase).toBe("finishing");
    expect(state.levels).toEqual([-20, -10]);
    expect(run([{ type: "finished" }], state).state).toEqual(idleRecorder);
  });

  it("a tap is too short: dropped, with a hint", () => {
    const { state, effects } = run([{ type: "press" }, { type: "ready" }, { type: "tick", durationMs: 200 }, { type: "release" }]);
    expect(effects.at(-1)).toBe("discard");
    expect(state).toMatchObject({ phase: "idle", notice: "too-short" });
  });

  it("let go before the microphone was ready: nothing records", () => {
    const { state, effects } = run([{ type: "press" }, { type: "release" }, { type: "ready" }]);
    expect(effects).toEqual(["prepare", "discard"]);
    expect(state).toMatchObject({ phase: "idle", notice: "too-short" });
  });

  it("slide left: arms at half way, cancels past the line", () => {
    let r = run([{ type: "press" }, { type: "ready" }, { type: "tick", durationMs: 2000 }, { type: "move", dx: -70, dy: 0 }]);
    expect(r.state.cancelArmed).toBe(true);
    r = run([{ type: "release" }], r.state);
    expect(r.effects).toEqual(["discard", "haptic:record-cancel"]);
    expect(r.state.phase).toBe("idle");
    const past = run([{ type: "press" }, { type: "ready" }, { type: "move", dx: -130, dy: 0 }]);
    expect(past.state.phase).toBe("idle");
    expect(past.effects.slice(-2)).toEqual(["discard", "haptic:record-cancel"]);
  });

  it("slide up: locks; letting go keeps recording; send or delete ends it", () => {
    let r = run([{ type: "press" }, { type: "ready" }, { type: "move", dx: 0, dy: -90 }]);
    expect(r.state.locked).toBe(true);
    expect(r.effects.at(-1)).toBe("haptic:record-lock");
    r = run([{ type: "release" }, { type: "move", dx: -500, dy: 0 }, { type: "tick", durationMs: 3000 }], r.state);
    expect(r.state.phase).toBe("recording");
    const sent = run([{ type: "send" }], r.state);
    expect(sent.state.phase).toBe("finishing");
    expect(sent.effects).toEqual(["finish", "haptic:send"]);
    const deleted = run([{ type: "cancel" }], r.state);
    expect(deleted.state.phase).toBe("idle");
    expect(deleted.effects).toEqual(["discard", "haptic:record-cancel"]);
  });

  it("reaching the limit sends", () => {
    const { state, effects } = run([{ type: "press" }, { type: "ready" }, { type: "tick", durationMs: 10_000 }]);
    expect(state.phase).toBe("finishing");
    expect(effects.slice(-2)).toEqual(["finish", "haptic:send"]);
  });

  it("no microphone permission: back to idle, saying so", () => {
    const { state, effects } = run([{ type: "press" }, { type: "failed", reason: "denied" }]);
    expect(state).toMatchObject({ phase: "idle", notice: "denied" });
    expect(effects).toEqual(["prepare", "discard", "haptic:error"]);
  });

  it("ignores events that don't apply", () => {
    expect(recorderStep(idleRecorder, { type: "release" }, config).state).toBe(idleRecorder);
    expect(recorderStep(idleRecorder, { type: "tick", durationMs: 9 }, config).effects).toEqual([]);
    const finishing = { ...idleRecorder, phase: "finishing" as const };
    expect(recorderStep(finishing, { type: "cancel" }, config).state).toBe(finishing);
    expect(recorderStep(finishing, { type: "press" }, config).state).toBe(finishing);
  });
});

describe("liveBars", () => {
  it("pads on the left and maps dB to 0..1", () => {
    expect(liveBars([-60, 0, -30], 5)).toEqual([0, 0, 0, 1, 0.5]);
    expect(liveBars([-Infinity], 1)).toEqual([0]);
  });
});
