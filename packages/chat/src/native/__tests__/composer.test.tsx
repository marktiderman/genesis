// @vitest-environment happy-dom
// @feat:chat
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "../composer";
import { ChatNativeProvider } from "../context";
import type { ChatNativeModules } from "../modules";
import { useChatComposer } from "../use-composer";
import { memoryDraftStorage, draftKey } from "../composer-state";

afterEach(cleanup);

function Harness({ canPost = true, onSend = vi.fn(), reason = null as string | null }) {
  const composer = useChatComposer("c1", null, "u1");
  return <ChatComposer composer={composer} canPost={canPost} disabledReason={reason} role="member" onSend={onSend} testID="cmp" />;
}

describe("ChatComposer", () => {
  it("says why when the person can't post, instead of taking input", () => {
    render(
      <ChatNativeProvider>
        <Harness canPost={false} reason="Only admins can post here." />
      </ChatNativeProvider>,
    );
    expect(screen.getByTestId("cmp-disabled").textContent).toBe("Only admins can post here.");
    expect(screen.queryByTestId("cmp-input")).toBeNull();
  });

  it("sends what was typed, with a haptic, and empties", async () => {
    const onSend = vi.fn();
    const haptics = { impactAsync: vi.fn(async () => undefined), selectionAsync: vi.fn(), notificationAsync: vi.fn(), ImpactFeedbackStyle: { Light: "l", Medium: "m" }, NotificationFeedbackType: { Success: 1, Warning: 2, Error: 3 } };
    render(
      <ChatNativeProvider modules={{ haptics } as unknown as ChatNativeModules}>
        <Harness onSend={onSend} />
      </ChatNativeProvider>,
    );
    expect(screen.getByTestId("cmp-send").getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByTestId("cmp-input"), { target: { value: "hello" } });
    // Two quick taps send once.
    fireEvent.click(screen.getByTestId("cmp-send"));
    fireEvent.click(screen.getByTestId("cmp-send"));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({ input: { body: "hello", replyToId: null, mentions: [] }, files: [] });
    expect(haptics.impactAsync).toHaveBeenCalledWith("l");
    await waitFor(() => expect((screen.getByTestId("cmp-input") as HTMLInputElement).value).toBe(""));
  });

  it("restores the thread's draft", async () => {
    const drafts = memoryDraftStorage();
    await drafts.setItem(draftKey("u1", "c1"), JSON.stringify({ text: "half written" }));
    render(
      <ChatNativeProvider modules={{ drafts }}>
        <Harness />
      </ChatNativeProvider>,
    );
    await waitFor(() => expect((screen.getByTestId("cmp-input") as HTMLInputElement).value).toBe("half written"));
  });

  it("attaches photos from the library as thumbnails (straight to the picker when it is the only source)", async () => {
    const imagePicker = {
      launchImageLibraryAsync: vi.fn(async () => ({ canceled: false, assets: [{ uri: "file:///a.jpg", fileName: "a.jpg", mimeType: "image/jpeg", width: 10, height: 10 }] })),
    };
    const onSend = vi.fn();
    render(
      <ChatNativeProvider modules={{ imagePicker }}>
        <Harness onSend={onSend} />
      </ChatNativeProvider>,
    );
    // The library is the only source: the picker opens with no sheet in between.
    fireEvent.click(screen.getByTestId("cmp-attach"));
    await waitFor(() => expect(screen.getByTestId("cmp-attachments")).toBeTruthy());
    expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true }));
    fireEvent.click(screen.getByTestId("cmp-send"));
    expect(onSend.mock.calls[0]![0].files[0]).toMatchObject({ data: "file:///a.jpg", contentType: "image/jpeg" });
  });

  it("shows the mic (with its VoiceOver hint) only when expo-audio is given", () => {
    const audio = {
      useAudioRecorder: () => ({ prepareToRecordAsync: vi.fn(), record: vi.fn(), stop: vi.fn(), getStatus: vi.fn(), uri: null }),
      useAudioPlayer: vi.fn(),
      useAudioPlayerStatus: vi.fn(),
      RecordingPresets: { HIGH_QUALITY: {} },
      requestRecordingPermissionsAsync: vi.fn(),
      setAudioModeAsync: vi.fn(),
    };
    const { unmount } = render(
      <ChatNativeProvider>
        <Harness />
      </ChatNativeProvider>,
    );
    expect(screen.queryByTestId("cmp-mic")).toBeNull();
    unmount();
    render(
      <ChatNativeProvider modules={{ audio } as unknown as ChatNativeModules}>
        <Harness />
      </ChatNativeProvider>,
    );
    expect(screen.getByTestId("cmp-mic").getAttribute("aria-label")).toBe("Record a voice message");
  });
});

describe("useChatComposer across conversations", () => {
  const wrapper = (drafts: ReturnType<typeof memoryDraftStorage>) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <ChatNativeProvider modules={{ drafts }}>{children}</ChatNativeProvider>;
    };

  it("starts the next conversation empty, keeps the first one's draft, and restores the next one's", async () => {
    const drafts = memoryDraftStorage();
    await drafts.setItem(draftKey("u1", "c2"), JSON.stringify({ text: "for c2" }));
    const hook = renderHook(({ id }) => useChatComposer(id, null, "u1"), { initialProps: { id: "c1" }, wrapper: wrapper(drafts) });
    await act(async () => undefined);
    act(() => hook.result.current.dispatch({ type: "text", text: "for c1" }));
    act(() => hook.result.current.setReply({ messageId: "m1", name: "Sam", preview: "hi" }));
    hook.rerender({ id: "c2" });
    // Never c1's text or reply in c2, not even for one render.
    expect(hook.result.current.state.text).not.toBe("for c1");
    expect(hook.result.current.state.replyTo).toBeNull();
    await waitFor(() => expect(hook.result.current.state.text).toBe("for c2"));
    expect(JSON.parse((await drafts.getItem(draftKey("u1", "c1")))!)).toMatchObject({ text: "for c1", replyTo: { messageId: "m1" } });
    // c1's text was never saved under c2.
    expect(JSON.parse((await drafts.getItem(draftKey("u1", "c2")))!)).toEqual({ text: "for c2" });
  });

  it("keeps each signed-in person's drafts apart", async () => {
    const drafts = memoryDraftStorage();
    await drafts.setItem(draftKey("u1", "c1"), JSON.stringify({ text: "u1's words" }));
    const hook = renderHook(() => useChatComposer("c1", null, "u2"), { wrapper: wrapper(drafts) });
    await act(async () => undefined);
    expect(hook.result.current.state.text).toBe("");
  });
});
