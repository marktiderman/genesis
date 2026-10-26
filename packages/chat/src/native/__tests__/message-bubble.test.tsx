// @vitest-environment happy-dom
// @feat:chat
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAttachment, ChatMessage, PendingMessage } from "../../core/types";
import { ChatNativeProvider } from "../context";
import { MessageBubble } from "../message-bubble";
import type { ChatNativeModules } from "../modules";
import { act } from "@testing-library/react";
import { invertedRows, type ThreadRow } from "../rows";

// The shared React Native shim has no useWindowDimensions; attachments size pictures by it.
vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";

function failedRow(files: PendingMessage["files"]): Extract<ThreadRow, { type: "message" }> {
  const pending: PendingMessage = {
    clientId: "c1",
    input: { conversationId: "conv", clientId: "c1", body: "" },
    senderId: ME,
    createdAt: "2026-10-25T10:00:00Z",
    status: "failed",
    error: "Attach the file again to send",
    files,
  };
  return invertedRows([{ type: "pending", pending }], { me: ME, group: false }).find((r) => r.type === "message") as Extract<ThreadRow, { type: "message" }>;
}

function show(row: Extract<ThreadRow, { type: "message" }>, handlers: Partial<Parameters<typeof MessageBubble>[0]> = {}) {
  render(<MessageBubble row={row} me={ME} urls={{}} group={false} reducedMotion testID="b" {...handlers} />);
}

describe("a failed message", () => {
  it("whose file was lost offers Attach again, not Retry, with the files it lost", () => {
    const onReattach = vi.fn();
    const files = [{ name: "photo.png", contentType: "image/png", kind: "image", lost: true }];
    show(failedRow(files), { onReattach, onRetry: vi.fn(), onDiscard: vi.fn() });
    expect(screen.getByTestId("b-failed").textContent).toBe("Attach the file again to send");
    expect(screen.queryByTestId("b-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("b-reattach"));
    expect(onReattach).toHaveBeenCalledWith("c1", files);
    expect(screen.getByTestId("b-discard")).toBeTruthy();
  });

  it("whose files are all still there offers Retry", () => {
    const onRetry = vi.fn();
    show(failedRow([{ name: "photo.jpg", contentType: "image/jpeg", kind: "image" }]), { onRetry, onReattach: vi.fn() });
    expect(screen.queryByTestId("b-reattach")).toBeNull();
    fireEvent.click(screen.getByTestId("b-retry"));
    expect(onRetry).toHaveBeenCalledWith("c1");
  });

  it("draws a pending voice note from PendingMessage.files, with its duration", () => {
    show(failedRow([{ name: "voice.m4a", contentType: "audio/mp4", kind: "voice", meta: { durationMs: 9000, waveform: [10, 50] } }]));
    expect(screen.getByTestId("b-voice-0")).toBeTruthy();
  });
});

function attachment(id: string, kind: "image" | "voice", path: string): ChatAttachment {
  return {
    id, messageId: "m1", position: 0, kind, ref: {}, provider: "storage", path, providerId: null, playbackId: null, url: null, status: "ready",
    name: kind === "image" ? `${id}.jpg` : "voice.m4a", mime: null, bytes: null, width: 10, height: 10, durationMs: 4000, waveform: [10, 60],
    posterPath: null, thumbhash: null, transcript: null, transcriptStatus: null,
  } as ChatAttachment;
}

function messageRow(attachments: ChatAttachment[]): Extract<ThreadRow, { type: "message" }> {
  const message = {
    id: "m1", conversationId: "conv", seq: 1, clientId: "cm1", senderId: "22222222-2222-4222-8222-222222222222", senderRole: "member", kind: "text",
    body: "look", mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z", editedAt: null, deletedAt: null, attachments, reactions: [],
  } as unknown as ChatMessage;
  return invertedRows([{ type: "message", message }], { me: ME, group: false }).find((r) => r.type === "message") as Extract<ThreadRow, { type: "message" }>;
}

function fakeAudio() {
  const player = { play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(async () => undefined), setPlaybackRate: vi.fn() };
  const audio = {
    useAudioRecorder: vi.fn(),
    useAudioPlayer: vi.fn(() => player),
    useAudioPlayerStatus: vi.fn(() => ({ currentTime: 0, duration: 4, playing: false, didJustFinish: false, isLoaded: true, playbackRate: 1 })),
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: vi.fn(),
    setAudioModeAsync: vi.fn(),
  };
  return { audio: audio as unknown as ChatNativeModules["audio"], player };
}

const fireA11y = (el: HTMLElement, name: string) => act(() => void el.dispatchEvent(new CustomEvent("accessibilityaction", { detail: name })));

describe("a bubble with media, for VoiceOver", () => {
  it("carries the hidden controls as its own actions: play and speed for a voice note, open for each photo", () => {
    const { audio, player } = fakeAudio();
    const onOpenImage = vi.fn();
    const urls = { "p/voice.m4a": "https://x/voice.m4a", "p/a.jpg": "https://x/a.jpg", "p/b.jpg": "https://x/b.jpg" };
    render(
      <ChatNativeProvider modules={{ audio }}>
        <MessageBubble
          row={messageRow([attachment("v", "voice", "p/voice.m4a"), attachment("a", "image", "p/a.jpg"), attachment("b", "image", "p/b.jpg")])}
          me={ME}
          urls={urls}
          group={false}
          reducedMotion
          onOpenImage={onOpenImage}
          onReply={vi.fn()}
          testID="b"
        />
      </ChatNativeProvider>,
    );
    const bubble = screen.getByTestId("b-bubble");
    expect(bubble.getAttribute("data-a11y-actions")).toBe("voice-0,voice-rate-0,photo-0,photo-1,reply");
    fireA11y(bubble, "photo-1");
    expect(onOpenImage).toHaveBeenCalledWith("https://x/b.jpg", "Photo, b.jpg");
    fireA11y(bubble, "voice-0");
    expect(player.play).toHaveBeenCalledTimes(1);
    fireA11y(bubble, "voice-rate-0");
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it("offers no play action without expo-audio, where the note can't play", () => {
    render(<MessageBubble row={messageRow([attachment("v", "voice", "p/voice.m4a")])} me={ME} urls={{ "p/voice.m4a": "https://x/v" }} group={false} reducedMotion testID="b" />);
    expect(screen.getByTestId("b-bubble").getAttribute("data-a11y-actions") ?? "").not.toContain("voice");
  });
});
