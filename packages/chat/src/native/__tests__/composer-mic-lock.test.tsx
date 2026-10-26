// @vitest-environment happy-dom
// @feat:chat
/**
 * Slide up to lock, then tap Send. The mic stays one view through the lock: swapping in a new
 * button while the finger that locked was still down left that touch's responder unmounted on
 * iOS, and the next tap anywhere did nothing (seen in the simulator: the first Send tap after
 * locking was lost).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "../composer";
import { ChatNativeProvider } from "../context";
import type { ChatNativeModules, ExpoAudioLike, RecorderStateLike } from "../modules";
import { useChatComposer } from "../use-composer";

type Handlers = {
  onPanResponderGrant: () => void;
  onPanResponderMove: (e: unknown, g: { dx: number; dy: number }) => void;
  onPanResponderRelease: () => void;
};
// The shared React Native shim's PanResponder does nothing: this one keeps what the mic gave it.
const pan = vi.hoisted(() => ({ created: [] as Handlers[] }));
vi.mock("react-native", async (original) => ({
  ...(await original<object>()),
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  PanResponder: {
    create: (config: Handlers) => {
      pan.created.push(config);
      return { panHandlers: {} };
    },
  },
}));

function fakeAudio() {
  const status: RecorderStateLike = { isRecording: false, durationMillis: 0, metering: -30, url: null };
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
  const audio = {
    useAudioRecorder: vi.fn(() => recorder),
    useAudioPlayer: vi.fn(),
    useAudioPlayerStatus: vi.fn(),
    RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
    requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
    setAudioModeAsync: vi.fn(async () => undefined),
  } as unknown as ExpoAudioLike;
  return { audio, recorder, status };
}

function Harness({ onSend }: { onSend: (s: unknown) => void }) {
  const composer = useChatComposer("c1", null, "u1");
  return <ChatComposer composer={composer} canPost disabledReason={null} role="member" onSend={onSend} testID="cmp" />;
}

describe("ChatComposer mic: slide up to lock, then tap Send", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pan.created.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the same view when it locks, and the first tap on Send sends", async () => {
    const { audio, recorder, status } = fakeAudio();
    const onSend = vi.fn();
    render(
      <ChatNativeProvider modules={{ audio } as unknown as ChatNativeModules}>
        <Harness onSend={onSend} />
      </ChatNativeProvider>,
    );
    const mic = screen.getByTestId("cmp-mic");
    const handlers = pan.created.at(-1)!;

    // Hold, start recording, slide up past the lock, let go.
    await act(async () => {
      handlers.onPanResponderGrant();
      await vi.advanceTimersByTimeAsync(0);
    });
    status.durationMillis = 2000;
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)));
    act(() => handlers.onPanResponderMove({}, { dx: 0, dy: -100 }));
    const send = screen.getByTestId("cmp-voice-send");
    expect(send).toBe(mic);
    expect(send.getAttribute("aria-label")).toBe("Send voice message");
    await act(async () => {
      handlers.onPanResponderRelease();
      await vi.advanceTimersByTimeAsync(0);
    });
    // Letting go of the finger that locked doesn't send: recording goes on hands-free.
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("cmp-voice-send")).toBe(mic);

    // One tap on Send.
    await act(async () => {
      handlers.onPanResponderGrant();
      handlers.onPanResponderRelease();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cmp-mic")).toBe(mic);
  });
});
