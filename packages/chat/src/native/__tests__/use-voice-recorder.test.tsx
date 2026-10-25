// @vitest-environment happy-dom
// @feat:chat
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalFile } from "../../core/outbox";
import type { ExpoAudioLike, RecorderStateLike } from "../modules";
import { useVoiceRecorder } from "../use-voice-recorder";

/** expo-audio, mocked: a recorder whose status the test moves forward. */
function fakeAudio(opts: { granted?: boolean } = {}) {
  const status: RecorderStateLike = { isRecording: false, durationMillis: 0, metering: -160, url: null };
  const recorder = {
    uri: null as string | null,
    prepareToRecordAsync: vi.fn(async () => undefined),
    record: vi.fn(() => {
      status.isRecording = true;
    }),
    stop: vi.fn(async () => {
      status.isRecording = false;
      recorder.uri = "file:///rec/voice.m4a";
    }),
    getStatus: vi.fn(() => ({ ...status })),
  };
  const audio: ExpoAudioLike = {
    useAudioRecorder: vi.fn(() => recorder),
    useAudioPlayer: vi.fn(),
    useAudioPlayerStatus: vi.fn(),
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
    requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: opts.granted ?? true })),
    setAudioModeAsync: vi.fn(async () => undefined),
  } as unknown as ExpoAudioLike;
  return { audio, recorder, status };
}

describe("useVoiceRecorder (expo-audio mocked)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function start(audio: ExpoAudioLike, onRecorded: (f: LocalFile) => void, signalRecording = vi.fn()) {
    const hook = renderHook(() => useVoiceRecorder(audio, { limitMs: 60_000, onRecorded, signalRecording }));
    await act(async () => {
      hook.result.current.dispatch({ type: "press" });
      await vi.advanceTimersByTimeAsync(0);
    });
    return hook;
  }

  it("records with metering on, reads the level as it goes, and sends a voice note with its duration and waveform", async () => {
    const { audio, recorder, status } = fakeAudio();
    const onRecorded = vi.fn();
    const signalRecording = vi.fn();
    const hook = await start(audio, onRecorded, signalRecording);
    expect(audio.useAudioRecorder).toHaveBeenCalledWith({ extension: ".m4a", isMeteringEnabled: true });
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
    expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalled();
    expect(hook.result.current.state.phase).toBe("recording");

    for (const [ms, db] of [[100, -40], [200, -10], [300, -25], [1200, -5]] as const) {
      status.durationMillis = ms;
      status.metering = db;
      await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    }
    expect(hook.result.current.state.durationMs).toBe(1200);
    expect(signalRecording).toHaveBeenCalled();

    await act(async () => {
      hook.result.current.dispatch({ type: "release" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recorder.stop).toHaveBeenCalled();
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const file = onRecorded.mock.calls[0]![0] as LocalFile;
    expect(file).toMatchObject({ data: "file:///rec/voice.m4a", contentType: "audio/mp4", meta: { kind: "voice", durationMs: 1200 } });
    expect(file.meta!.waveform).toHaveLength(48);
    expect(Math.max(...file.meta!.waveform!)).toBe(100);
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(hook.result.current.state.phase).toBe("idle");
  });

  it("slide to cancel stops and throws the recording away", async () => {
    const { audio, recorder, status } = fakeAudio();
    const onRecorded = vi.fn();
    const hook = await start(audio, onRecorded);
    status.durationMillis = 2000;
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    act(() => hook.result.current.dispatch({ type: "move", dx: -200, dy: 0 }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(recorder.stop).toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(hook.result.current.state.phase).toBe("idle");
    // The level timer stopped with it.
    const reads = recorder.getStatus.mock.calls.length;
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(recorder.getStatus.mock.calls.length).toBe(reads);
  });

  it("locked, it keeps recording after letting go, until Send", async () => {
    const { audio, status } = fakeAudio();
    const onRecorded = vi.fn();
    const hook = await start(audio, onRecorded);
    act(() => hook.result.current.dispatch({ type: "move", dx: 0, dy: -100 }));
    act(() => hook.result.current.dispatch({ type: "release" }));
    expect(hook.result.current.state).toMatchObject({ phase: "recording", locked: true });
    status.durationMillis = 3000;
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    await act(async () => {
      hook.result.current.dispatch({ type: "send" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("without microphone permission it never records, and says so", async () => {
    const { audio, recorder } = fakeAudio({ granted: false });
    const hook = await start(audio, vi.fn());
    expect(recorder.record).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ phase: "idle", notice: "denied" });
  });

  it("leaving the screen mid-recording stops the recorder", async () => {
    const { audio, recorder } = fakeAudio();
    const hook = await start(audio, vi.fn());
    hook.unmount();
    expect(recorder.stop).toHaveBeenCalled();
  });

  it("a press cancelled while the microphone starts never records, and lets the microphone go", async () => {
    const { audio, recorder } = fakeAudio();
    let grant!: (v: { granted: boolean }) => void;
    (audio.requestRecordingPermissionsAsync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => (grant = r)));
    const hook = renderHook(() => useVoiceRecorder(audio, { limitMs: 60_000, onRecorded: vi.fn() }));
    act(() => hook.result.current.dispatch({ type: "press" }));
    act(() => hook.result.current.dispatch({ type: "cancel" }));
    await act(async () => {
      grant({ granted: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
    expect(audio.setAudioModeAsync).not.toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
    expect(hook.result.current.state.phase).toBe("idle");
  });

  it("a second press after a cancelled one isn't started by the first one's late answer", async () => {
    const { audio, recorder } = fakeAudio();
    const grants: ((v: { granted: boolean }) => void)[] = [];
    (audio.requestRecordingPermissionsAsync as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((r) => grants.push(r)));
    const hook = renderHook(() => useVoiceRecorder(audio, { limitMs: 60_000, onRecorded: vi.fn() }));
    act(() => hook.result.current.dispatch({ type: "press" }));
    act(() => hook.result.current.dispatch({ type: "cancel" }));
    act(() => hook.result.current.dispatch({ type: "press" }));
    await act(async () => {
      grants[0]!({ granted: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recorder.record).not.toHaveBeenCalled();
    expect(hook.result.current.state.phase).toBe("starting");
    await act(async () => {
      grants[1]!({ granted: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });
});
