// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import type { ChatAttachment, ChatMessage } from "../../core/types";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";
import type { ChatNativeModules } from "../modules";
import { ChatMediaViewer, ChatPhotoViewer, DISMISS_DISTANCE, galleryFor, isLocalUri, panLimit, pinchScale, shouldDismiss } from "../photo-viewer";
import { ChatThreadScreen } from "../thread-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

function image(id: string, name: string): ChatAttachment {
  return {
    id, messageId: "m1", position: 0, kind: "image", ref: {}, provider: "storage", path: `${CONV}/${SAM}/${name}`, providerId: null, playbackId: null,
    url: null, status: "ready", name, mime: "image/jpeg", bytes: 10, width: 800, height: 600, durationMs: null, waveform: null, posterPath: null,
    thumbhash: null, transcript: null, transcriptStatus: null,
  };
}

function photoMessage(id: string, attachments: ChatAttachment[]): ChatMessage {
  return {
    id, conversationId: CONV, seq: 1, clientId: `c-${id}`, senderId: SAM, senderRole: "member", kind: "text", body: "",
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z", editedAt: null, deletedAt: null, attachments, reactions: [],
  } as ChatMessage;
}

const signed = (path: string) => `https://storage.example.test/${path}`;

describe("galleryFor", () => {
  it("is the tapped photo's message's photos, opened at the one tapped", () => {
    const m = photoMessage("m1", [image("a", "a.jpg"), image("b", "b.jpg"), image("c", "c.jpg")]);
    const other = photoMessage("m2", [image("d", "d.jpg")]);
    const urls = Object.fromEntries([...m.attachments, ...other.attachments].map((a) => [a.path!, signed(a.path!)]));
    const g = galleryFor([other, m], urls, signed(`${CONV}/${SAM}/b.jpg`), "Photo", (a) => `Photo, ${a.name}`);
    expect(g.photos.map((p) => p.alt)).toEqual(["Photo, a.jpg", "Photo, b.jpg", "Photo, c.jpg"]);
    expect(g.index).toBe(1);
  });

  it("opens a photo in no message (still sending) alone", () => {
    expect(galleryFor([], {}, "file:///tmp/x.jpg", "Photo", () => "")).toEqual({ photos: [{ key: "file:///tmp/x.jpg", uri: "file:///tmp/x.jpg", alt: "Photo" }], index: 0 });
  });
});

describe("the viewer's gestures", () => {
  it("close on a long enough pull down or a quick flick, not a nudge", () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
    expect(shouldDismiss(40, 2)).toBe(true);
    expect(shouldDismiss(40, 0.2)).toBe(false);
    expect(shouldDismiss(10, 3)).toBe(false);
    expect(shouldDismiss(-200, 0)).toBe(false);
  });

  it("pinch between 0.8 and 4 times, and pan only as far as the zoomed photo reaches", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 1000)).toBe(4);
    expect(pinchScale(1, 100, 10)).toBe(0.8);
    expect(pinchScale(1.5, 0, 50)).toBe(1.5);
    expect(panLimit(1, 390)).toBe(0);
    expect(panLimit(2, 390)).toBe(195);
  });

  it("know a file on the phone from a link", () => {
    expect(isLocalUri("file:///a.jpg")).toBe(true);
    expect(isLocalUri("https://x.test/a.jpg")).toBe(false);
  });
});

function viewer(modules: ChatNativeModules, photos = [{ key: "a", uri: "https://x.test/a.jpg", alt: "Photo, a.jpg" }, { key: "b", uri: "https://x.test/b.jpg", alt: "Photo, b.jpg" }], onClose = vi.fn()) {
  render(
    <ChatNativeProvider modules={modules}>
      <ChatPhotoViewer photos={photos} initialIndex={1} onClose={onClose} testID="v" />
    </ChatNativeProvider>,
  );
  return onClose;
}

describe("ChatPhotoViewer", () => {
  it("is full screen and dark, not a page sheet, and says which photo of how many", () => {
    viewer({});
    const modal = screen.getByTestId("v");
    expect(modal.getAttribute("data-presentation-style")).toBe("overFullScreen");
    expect(modal.getAttribute("data-presentation-style")).not.toBe("pageSheet");
    expect(screen.getByTestId("v-counter").textContent).toBe("Photo 2 of 2");
    const pager = screen.getByTestId("v-pager");
    expect(pager.getAttribute("aria-label")).toBe("Photo, b.jpg");
    expect(screen.getByTestId("v-photo-0")).toBeTruthy();
    expect(screen.getByTestId("v-photo-1")).toBeTruthy();
  });

  it("closes from its Close button", () => {
    const onClose = viewer({});
    fireEvent.click(screen.getByTestId("v-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Share and Save only when the app passed expo-sharing and expo-media-library", () => {
    viewer({});
    expect(screen.queryByTestId("v-share")).toBeNull();
    expect(screen.queryByTestId("v-save")).toBeNull();
    cleanup();
    // A link with no way to copy it to the phone can't be shared either.
    viewer({ sharing: { isAvailableAsync: async () => true, shareAsync: vi.fn() } });
    expect(screen.queryByTestId("v-share")).toBeNull();
  });

  it("shares the photo on screen, copied to the phone first", async () => {
    const shareAsync = vi.fn(async () => undefined);
    const downloadFile = vi.fn(async (url: string) => `file:///cache/${url.split("/").pop()}`);
    viewer({ sharing: { isAvailableAsync: async () => true, shareAsync }, downloadFile });
    await act(async () => fireEvent.click(screen.getByTestId("v-share")));
    expect(downloadFile).toHaveBeenCalledWith("https://x.test/b.jpg");
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/b.jpg", { dialogTitle: "Share photo" });
  });

  it("saves to Photos after asking for add-only access, and says so", async () => {
    const saveToLibraryAsync = vi.fn(async () => undefined);
    const requestPermissionsAsync = vi.fn(async () => ({ granted: true }));
    viewer({ mediaLibrary: { requestPermissionsAsync, saveToLibraryAsync }, downloadFile: async () => "file:///cache/b.jpg" });
    await act(async () => fireEvent.click(screen.getByTestId("v-save")));
    expect(requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(saveToLibraryAsync).toHaveBeenCalledWith("file:///cache/b.jpg");
    expect(screen.getByTestId("v-notice").textContent).toBe("Saved to Photos");
  });

  it("says how to allow saving when Photos access is refused, and saves nothing", async () => {
    const saveToLibraryAsync = vi.fn(async () => undefined);
    viewer({ mediaLibrary: { requestPermissionsAsync: async () => ({ granted: false }), saveToLibraryAsync }, downloadFile: async () => "file:///x.jpg" });
    await act(async () => fireEvent.click(screen.getByTestId("v-save")));
    expect(saveToLibraryAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("v-notice").textContent).toMatch(/Settings/);
  });

  it("ChatMediaViewer, for one picture, is the same full-screen viewer", () => {
    render(
      <ChatNativeProvider>
        <ChatMediaViewer image={{ uri: "https://x.test/a.jpg", alt: "Photo" }} onClose={vi.fn()} testID="one" />
      </ChatNativeProvider>,
    );
    expect(screen.getByTestId("one").getAttribute("data-presentation-style")).toBe("overFullScreen");
    expect(screen.queryByTestId("one-counter")).toBeNull();
  });
});

function fakeClient(messages: ChatMessage[], access: { myRole: () => Promise<string | null> }): ChatClient {
  const sub = { unsubscribe: vi.fn(), typing: vi.fn(), recording: vi.fn(), send: vi.fn() };
  return {
    conversation: vi.fn(async () => ({ id: CONV, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => [
      { conversationId: CONV, userId: ME, role: "member", lastReadSeq: 1, joinedAt: "2026-10-01T00:00:00Z" },
      { conversationId: CONV, userId: SAM, role: "member", lastReadSeq: 1, joinedAt: "2026-10-01T00:00:00Z" },
    ]),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers: 2 })),
    myRole: vi.fn(access.myRole),
    canPost: vi.fn(async () => true),
    messages: vi.fn(async () => ({ messages, hasEarlier: false })),
    message: vi.fn(async () => null),
    subscribeConversation: vi.fn(() => sub),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    markRead: vi.fn(async () => 0),
    pins: vi.fn(async () => []),
    fileUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, signed(p)]))),
  } as unknown as ChatClient;
}

function wrap(client: ChatClient, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ChatProvider client={client} userId={ME}>
        <NativeToastProvider>
          <ChatNativeProvider>{children}</ChatNativeProvider>
        </NativeToastProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
}

describe("ChatThreadScreen", () => {
  it("opens a tapped photo in the full-screen viewer with the rest of its message's photos", async () => {
    const m = photoMessage("m1", [image("a", "a.jpg"), image("b", "b.jpg"), image("c", "c.jpg")]);
    render(wrap(fakeClient([m], { myRole: async () => "member" }), <ChatThreadScreen conversationId={CONV} testID="t" />));
    const second = await screen.findByLabelText("Photo, b.jpg");
    await waitFor(() => expect(second.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(second);
    const modal = await screen.findByTestId("t-viewer");
    expect(modal.getAttribute("data-presentation-style")).toBe("overFullScreen");
    expect(screen.getByTestId("t-viewer-counter").textContent).toBe("Photo 2 of 3");
    fireEvent.click(screen.getByTestId("t-viewer-close"));
    await waitFor(() => expect(screen.queryByTestId("t-viewer")).toBeNull());
  });

  it("offers Retry in the composer's place when your role couldn't be read, and recovers", async () => {
    let fail = true;
    const client = fakeClient([], {
      myRole: async () => {
        if (fail) throw new Error("offline");
        return "member";
      },
    });
    render(wrap(client, <ChatThreadScreen conversationId={CONV} testID="t" />));
    const retry = await screen.findByTestId("t-access-error-retry");
    expect(screen.getByTestId("t-access-error-alert").textContent).toMatch(/couldn't be loaded/);
    expect(screen.queryByTestId("t-composer-disabled")).toBeNull();
    fail = false;
    await act(async () => fireEvent.click(retry));
    await screen.findByTestId("t-composer-input");
    expect(screen.queryByTestId("t-access-error")).toBeNull();
  });
});
