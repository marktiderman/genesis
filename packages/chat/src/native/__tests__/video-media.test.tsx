// @vitest-environment happy-dom
// @feat:chat
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAttachment, ChatLinkPreview, ChatMessage } from "../../core/types";
import { ChatComposer } from "../composer";
import { ChatNativeProvider } from "../context";
import { ChatLinkPreviewCard, linkPreviewIds, openChatLink } from "../link-preview";
import { MessageBubble } from "../message-bubble";
import type { ChatNativeModules } from "../modules";
import { invertedRows, type ThreadRow } from "../rows";
import { ChatVideoPlayer, videoState } from "../video-player";
import { ChatVideoRecorder } from "../video-recorder";
import { claimPlayback, activePlaybackId, releasePlayback } from "../voice-player";
import { ChatAttachmentCard, isOpenableHref, splitCardAttachments } from "../attachment-cards";
import { useChatComposer } from "../use-composer";

const linking = vi.hoisted(() => ({ openURL: vi.fn(async () => true), openSettings: vi.fn(async () => undefined) }));
vi.mock("react-native", async (original) => ({
  ...(await original<object>()),
  Linking: linking,
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fireA11y = (el: HTMLElement, name: string) => act(() => void el.dispatchEvent(new CustomEvent("accessibilityaction", { detail: name })));
const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";

// ── Fakes for expo-video and expo-camera ──────────────────────────────────────

function fakeVideo() {
  const listeners = new Map<string, (p: unknown) => void>();
  const player = {
    play: vi.fn(() => listeners.get("playingChange")?.({ isPlaying: true })),
    pause: vi.fn(() => listeners.get("playingChange")?.({ isPlaying: false })),
    muted: false,
    playing: false,
    playbackRate: 1,
    currentTime: 0,
    addListener: vi.fn((event: string, l: (p: unknown) => void) => {
      listeners.set(event, l);
      return { remove: () => listeners.delete(event) };
    }),
  };
  const enterFullscreen = vi.fn(async () => undefined);
  const VideoView = forwardRef<unknown, { testID?: string }>(function VideoView({ testID }, ref) {
    useImperativeHandle(ref, () => ({ enterFullscreen }));
    return <div data-testid={testID} />;
  });
  const sources: unknown[] = [];
  const video = {
    useVideoPlayer: vi.fn((source: unknown, setup?: (p: typeof player) => void) => {
      // Like the real hook: the player is made, and set up, once.
      if (!sources.length) setup?.(player);
      sources.push(source);
      return player;
    }),
    VideoView,
  };
  return { video: video as unknown as ChatNativeModules["video"], player, enterFullscreen, sources };
}

function fakeCamera(granted = true) {
  let resolve: ((v: { uri: string } | undefined) => void) | null = null;
  const handle = {
    recordAsync: vi.fn(() => new Promise<{ uri: string } | undefined>((r) => (resolve = r))),
    stopRecording: vi.fn(() => resolve?.({ uri: "file:///cache/take.mov" })),
  };
  const CameraView = forwardRef<unknown, { testID?: string; onCameraReady?: () => void; facing?: string }>(function CameraView({ testID, onCameraReady, facing }, ref) {
    useImperativeHandle(ref, () => handle);
    // The real one says it's ready once the preview runs.
    setTimeout(() => onCameraReady?.(), 0);
    return <div data-testid={testID} data-facing={facing} />;
  });
  const camera = {
    CameraView,
    Camera: {
      requestCameraPermissionsAsync: vi.fn(async () => ({ granted })),
      requestMicrophonePermissionsAsync: vi.fn(async () => ({ granted: true })),
    },
  };
  return { camera: camera as unknown as ChatNativeModules["camera"], handle };
}

const withModules = (modules: ChatNativeModules, children: ReactNode) => <ChatNativeProvider modules={modules}>{children}</ChatNativeProvider>;

// ── Player ──────────────────────────────────────────────────────────────────

describe("ChatVideoPlayer", () => {
  it("says Processing until Mux has a playback id, and says so when it failed", () => {
    expect(videoState({ uri: null, playbackId: null, provider: "mux", status: "pending" })).toBe("processing");
    expect(videoState({ uri: null, playbackId: "abc", provider: "mux", status: "ready" })).toBe("playable");
    expect(videoState({ uri: null, playbackId: null, provider: "mux", status: "failed" })).toBe("failed");
    expect(videoState({ uri: null, playbackId: null, provider: "storage", status: "ready" })).toBe("loading");
    const { video } = fakeVideo();
    render(withModules({ video }, <ChatVideoPlayer id="a1" uri={null} provider="mux" status="pending" durationMs={4000} testID="v" />));
    expect(screen.getByTestId("v-processing").getAttribute("aria-label")).toBe("Processing video");
  });

  it("shows Mux's thumbnail and duration, and streams HLS from the playback id on tap", () => {
    const { video, player, sources } = fakeVideo();
    render(withModules({ video }, <ChatVideoPlayer id="a1" uri={null} playbackId="PB1" provider="mux" status="ready" durationMs={42_000} testID="v" />));
    const poster = screen.getByTestId("v-poster");
    expect(poster.getAttribute("aria-label")).toBe("Video, 0:42");
    expect(video!.useVideoPlayer).not.toHaveBeenCalled();
    fireEvent.click(poster);
    expect(sources[0]).toEqual({ uri: "https://stream.mux.com/PB1.m3u8", contentType: "hls" });
    expect(player.play).toHaveBeenCalled();
    expect(screen.getByTestId("v-active")).toBeTruthy();
  });

  it("pauses, mutes, changes speed and goes full screen", () => {
    const { video, player, enterFullscreen } = fakeVideo();
    render(withModules({ video }, <ChatVideoPlayer id="a2" uri="https://x/v.mp4" provider="storage" status="ready" durationMs={3000} testID="v" />));
    fireEvent.click(screen.getByTestId("v-poster"));
    fireEvent.click(screen.getByTestId("v-play"));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByTestId("v-play").getAttribute("aria-label")).toBe("Play video");
    fireEvent.click(screen.getByTestId("v-mute"));
    expect(player.muted).toBe(true);
    expect(screen.getByTestId("v-mute").getAttribute("aria-label")).toBe("Unmute");
    fireEvent.click(screen.getByTestId("v-rate"));
    expect(player.playbackRate).toBe(1.5);
    fireEvent.click(screen.getByTestId("v-fullscreen"));
    expect(enterFullscreen).toHaveBeenCalled();
  });

  it("plays one at a time with voice notes: a voice note starting pauses it, and it pauses a voice note", () => {
    const { video, player } = fakeVideo();
    const voicePause = vi.fn();
    claimPlayback("voice-1", voicePause);
    render(withModules({ video }, <ChatVideoPlayer id="a3" uri="https://x/v.mp4" provider="storage" status="ready" durationMs={3000} testID="v" />));
    fireEvent.click(screen.getByTestId("v-poster"));
    expect(voicePause).toHaveBeenCalled();
    expect(activePlaybackId()).toBe("a3");
    act(() => claimPlayback("voice-2", vi.fn()));
    expect(player.pause).toHaveBeenCalled();
    releasePlayback("voice-2");
  });

  it("renders nothing without expo-video (the bubble keeps its row)", () => {
    const { container } = render(<ChatVideoPlayer id="a" uri="https://x" durationMs={1} />);
    expect(container.innerHTML).toBe("");
  });
});

// ── Recorder ────────────────────────────────────────────────────────────────

describe("ChatVideoRecorder", () => {
  it("asks for the camera and microphone, and says how to turn them on when refused", async () => {
    const { camera } = fakeCamera(false);
    render(withModules({ camera }, <ChatVideoRecorder open onClose={vi.fn()} limitMs={120_000} onRecorded={vi.fn()} testID="r" />));
    await waitFor(() => expect(screen.getByTestId("r-denied")).toBeTruthy());
    expect(screen.getByTestId("r-denied").textContent).toContain("Turn on the camera and microphone");
    fireEvent.click(screen.getByTestId("r-settings"));
    expect(linking.openSettings).toHaveBeenCalled();
    expect(screen.queryByTestId("r-record")).toBeNull();
  });

  it("records hands-free with a screen reader's double taps, mints the upload at the start, and sends on stop", async () => {
    const { camera, handle } = fakeCamera();
    const onRecorded = vi.fn();
    const onStart = vi.fn();
    const onClose = vi.fn();
    let now = 1_000;
    render(withModules({ camera }, <ChatVideoRecorder open onClose={onClose} limitMs={120_000} onStart={onStart} onRecorded={onRecorded} now={() => now} testID="r" />));
    await waitFor(() => expect(screen.getByTestId("r-record").getAttribute("aria-disabled")).toBe("false"));
    const record = screen.getByTestId("r-record");
    expect(record.getAttribute("aria-label")).toBe("Start recording");
    fireA11y(record, "activate");
    expect(handle.recordAsync).toHaveBeenCalledWith({ maxDuration: 120 });
    expect(onStart).toHaveBeenCalled();
    expect(screen.getByTestId("r-record").getAttribute("aria-label")).toBe("Stop and send");
    expect(screen.getByTestId("r-flip").getAttribute("aria-disabled")).toBe("true");
    now = 6_000;
    fireA11y(screen.getByTestId("r-record"), "activate");
    expect(handle.stopRecording).toHaveBeenCalled();
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(onRecorded).toHaveBeenCalledWith({ uri: "file:///cache/take.mov", durationMs: 5000, contentType: "video/quicktime", name: "video-6000.mov" });
    expect(onClose).toHaveBeenCalled();
  });

  it("flips the camera between takes, and Close mid-take throws it away", async () => {
    const { camera, handle } = fakeCamera();
    const onRecorded = vi.fn();
    const onClose = vi.fn();
    render(withModules({ camera }, <ChatVideoRecorder open onClose={onClose} limitMs={60_000} onRecorded={onRecorded} testID="r" />));
    await waitFor(() => expect(screen.getByTestId("r-record").getAttribute("aria-disabled")).toBe("false"));
    expect(screen.getByTestId("r-camera").getAttribute("data-facing")).toBe("front");
    fireEvent.click(screen.getByTestId("r-flip"));
    expect(screen.getByTestId("r-camera").getAttribute("data-facing")).toBe("back");
    fireA11y(screen.getByTestId("r-record"), "activate");
    fireEvent.click(screen.getByTestId("r-close"));
    expect(handle.stopRecording).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("is absent without expo-camera", () => {
    const { container } = render(<ChatVideoRecorder open onClose={vi.fn()} limitMs={1} onRecorded={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});

// ── Link previews ───────────────────────────────────────────────────────────

const preview: ChatLinkPreview = { url: "https://example.com/post", status: "ok", title: "A post", description: "About it", imageUrl: "https://example.com/og.png", siteName: "Example", fetchedAt: "2026-10-25T10:00:00Z" };

describe("link previews", () => {
  it("draw no image by default, so the phone never fetches og:image", () => {
    render(withModules({}, <ChatLinkPreviewCard preview={preview} testID="p" />));
    expect(screen.queryByTestId("p-image")).toBeNull();
    expect(screen.getByTestId("p").getAttribute("aria-label")).toBe("A post, Example");
    expect(screen.getByTestId("p").getAttribute("role")).toBe("link");
  });

  it("draw the image only when the app turns linkPreviewImages on", () => {
    render(withModules({}, <ChatLinkPreviewCard preview={preview} images testID="p" />));
    expect(screen.getByTestId("p-image")).toBeTruthy();
  });

  it("open in the in-app browser when there is one, else the system's, https only", async () => {
    const webBrowser = { openBrowserAsync: vi.fn(async () => undefined) };
    render(withModules({ webBrowser }, <ChatLinkPreviewCard preview={preview} testID="p" />));
    fireEvent.click(screen.getByTestId("p"));
    expect(webBrowser.openBrowserAsync).toHaveBeenCalledWith("https://example.com/post");
    expect(await openChatLink("https://example.com")).toBe(true);
    expect(linking.openURL).toHaveBeenCalledWith("https://example.com");
    expect(await openChatLink("javascript:alert(1)")).toBe(false);
    expect(await openChatLink("http://example.com")).toBe(false);
  });

  it("aren't asked for on deleted or hidden messages, or ones without a link", () => {
    const base = { body: "see https://example.com/a", deletedAt: null, moderation: null };
    const ids = linkPreviewIds([
      { ...base, id: "a" },
      { ...base, id: "b", moderation: "hidden" },
      { ...base, id: "c", deletedAt: "2026-10-25T10:00:00Z" },
      { ...base, id: "d", body: "no link" },
    ] as unknown as ChatMessage[]);
    expect(ids).toEqual(["a"]);
  });
});

// ── In the bubble ───────────────────────────────────────────────────────────

function attachment(over: Partial<ChatAttachment>): ChatAttachment {
  return {
    id: "att1", messageId: "m1", position: 0, kind: "video", ref: {}, provider: "mux", path: null, providerId: "upl", playbackId: null, url: null, status: "pending",
    name: "video.mov", mime: "video/quicktime", bytes: 10, width: null, height: null, durationMs: 5000, waveform: null, posterPath: null, thumbhash: null, transcript: null, transcriptStatus: null,
    ...over,
  } as ChatAttachment;
}

function row(over: Partial<ChatMessage>): Extract<ThreadRow, { type: "message" }> {
  const message = {
    id: "m1", conversationId: "conv", seq: 1, clientId: "cm1", senderId: SAM, senderRole: "member", kind: "text", body: "", mentions: [], replyToId: null,
    threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone", silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z",
    editedAt: null, deletedAt: null, attachments: [], reactions: [], moderation: null, ...over,
  } as unknown as ChatMessage;
  return invertedRows([{ type: "message", message }], { me: ME, group: false }).find((r) => r.type === "message") as Extract<ThreadRow, { type: "message" }>;
}

describe("the bubble", () => {
  it("draws a video with its player, and carries play and full screen as VoiceOver actions", () => {
    const { video, player, enterFullscreen } = fakeVideo();
    render(withModules({ video }, <MessageBubble row={row({ attachments: [attachment({ playbackId: "PB", status: "ready" })] })} me={ME} urls={{}} group={false} reducedMotion testID="b" />));
    const bubble = screen.getByTestId("b-bubble");
    expect(bubble.getAttribute("aria-label")).toContain("Video");
    expect(bubble.getAttribute("data-a11y-actions")).toBe("video-0,video-full-0");
    fireA11y(bubble, "video-0");
    expect(player.play).toHaveBeenCalled();
    fireA11y(bubble, "video-full-0");
    expect(enterFullscreen).toHaveBeenCalled();
  });

  it("shows a link's preview under the text, and none on a hidden message", () => {
    const r = row({ body: "look https://example.com/post" });
    render(withModules({}, <MessageBubble row={r} me={ME} urls={{}} group={false} reducedMotion linkPreview={preview} testID="b" />));
    expect(screen.getByTestId("b-preview")).toBeTruthy();
    expect(screen.getByTestId("b-bubble").getAttribute("data-a11y-actions")).toContain("open-link");
    cleanup();
    render(withModules({}, <MessageBubble row={row({ body: "look https://example.com/post", moderation: "hidden" })} me={ME} urls={{}} group={false} reducedMotion linkPreview={preview} testID="b" />));
    expect(screen.queryByTestId("b-preview")).toBeNull();
  });

  it("draws the app's attachment kinds as cards whose button the app handles", () => {
    const onOpenAttachment = vi.fn();
    const form = attachment({ id: "f1", kind: "form", provider: "none", providerId: null, status: "ready", ref: { formId: "intake" } });
    const kinds = { form: { title: () => "Intake form", subtitle: () => "5 questions", action: () => ({ label: "Fill it in" }) } };
    render(withModules({}, <MessageBubble row={row({ attachments: [form] })} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} onOpenAttachment={onOpenAttachment} testID="b" />));
    expect(screen.getByTestId("b-bubble").getAttribute("aria-label")).toContain("Intake form");
    expect(screen.queryByTestId("b-file-0")).toBeNull();
    fireEvent.click(screen.getByTestId("b-card-0-action"));
    expect(onOpenAttachment).toHaveBeenCalledWith(form, expect.objectContaining({ id: "m1" }));
  });
});

describe("attachment cards", () => {
  const checkIn = attachment({ id: "c1", kind: "check_in", provider: "none", status: "ready" });
  const msg = row({}).item.type === "message" ? (row({}).item as { message: ChatMessage }).message : (null as never);

  it("run the kind's own onPress before the app's handler, and the href last", () => {
    const own = vi.fn();
    const app = vi.fn();
    render(withModules({}, <ChatAttachmentCard attachment={checkIn} message={msg} kind={{ title: () => "Weekly check-in", action: () => ({ label: "Answer", onPress: own }) }} onOpenAttachment={app} testID="k" />));
    fireEvent.click(screen.getByTestId("k-action"));
    expect(own).toHaveBeenCalled();
    expect(app).not.toHaveBeenCalled();
    cleanup();
    render(withModules({}, <ChatAttachmentCard attachment={checkIn} message={msg} kind={{ title: () => "Weekly check-in", action: () => ({ label: "Answer", href: "myapp://check-in/1" }) }} testID="k" />));
    fireEvent.click(screen.getByTestId("k-action"));
    expect(linking.openURL).toHaveBeenCalledWith("myapp://check-in/1");
  });

  it("never open an unsafe href, and have no button without an action", () => {
    expect(isOpenableHref("javascript:alert(1)")).toBe(false);
    expect(isOpenableHref("http://x.test")).toBe(false);
    expect(isOpenableHref("https://x.test")).toBe(true);
    render(withModules({}, <ChatAttachmentCard attachment={checkIn} message={msg} kind={{ title: () => "T", action: () => ({ label: "Go", href: "javascript:alert(1)" }) }} testID="k" />));
    expect(screen.queryByTestId("k-action")).toBeNull();
  });

  it("split from the message's other attachments by registered kind", () => {
    const { cards, rest } = splitCardAttachments([{ kind: "form" }, { kind: "image" }], { form: { title: () => "" } });
    expect(cards).toEqual([{ kind: "form" }]);
    expect(rest).toEqual([{ kind: "image" }]);
  });
});

// ── Composer ────────────────────────────────────────────────────────────────

function Composer({ onRecordVideo }: { onRecordVideo?: () => void }) {
  const composer = useChatComposer("conv", null, ME);
  return <ChatComposer composer={composer} canPost disabledReason={null} role="member" onSend={vi.fn()} onRecordVideo={onRecordVideo} testID="c" />;
}

describe("the composer's video button", () => {
  it("opens the recorder, and is absent without one", () => {
    const onRecordVideo = vi.fn();
    render(withModules({}, <Composer onRecordVideo={onRecordVideo} />));
    const button = screen.getByTestId("c-video");
    expect(button.getAttribute("aria-label")).toBe("Record a video");
    fireEvent.click(button);
    expect(onRecordVideo).toHaveBeenCalled();
    cleanup();
    render(withModules({}, <Composer />));
    expect(screen.queryByTestId("c-video")).toBeNull();
  });
});
