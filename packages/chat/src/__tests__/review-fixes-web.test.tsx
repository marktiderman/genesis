/**
 * @vitest-environment happy-dom
 * @feat:chat
 * Fixes from the review of the phases 2–4 client, as people see them: a thread that one bad
 * message can't crash, catch-up after a long time away, read places in topics, link previews,
 * the emoji picker, broadcast and schedule retries, and the camera.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import { ChatError } from "../core/client";
import type { ChatAttachment } from "../core/types";
import { CATCH_UP_MAX_PAGES, CATCH_UP_PAGE, ChatProvider, chatKeys, useConversation, useLinkPreviews, type ChatProviderProps } from "../react";
import {
  ChatBroadcast,
  ChatEmojiPicker,
  ChatErrorBoundary,
  ChatLinkPreview,
  ChatThread,
  createMemoryChatClient,
  useVideoRecorder,
  type MemoryChatClient,
  type MemoryChatOptions,
  type MemoryConversationSeed,
} from "../web";
import { installFakeXHR } from "./fake-xhr";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
configure({ asyncUtilTimeout: 5000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const LEE = "00000000-0000-4000-8000-0000000000c3";
const names: Record<string, string> = { [ME]: "Me", [SAM]: "Sam", [LEE]: "Lee" };
const resolveUser = (id: string) => ({ name: names[id] ?? "Someone" });
const at = (min: number) => new Date(Date.now() - (600 - min) * 60_000).toISOString();

function providers(client: MemoryChatClient, extra: Partial<ChatProviderProps> = {}, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME} {...extra}>
        {children}
      </ChatProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient };
}
const mount = (client: MemoryChatClient, ui: ReactNode, extra: Partial<ChatProviderProps> = {}) => render(<>{ui}</>, { wrapper: providers(client, extra).wrapper });

const dm = (over: Partial<MemoryConversationSeed> = {}): MemoryConversationSeed => ({
  id: "c1",
  members: [{ userId: ME }, { userId: SAM }],
  messages: [{ id: "m1", senderId: SAM, body: "Hello", createdAt: at(1) }],
  ...over,
});
const make = (seed: MemoryConversationSeed, over: Partial<MemoryChatOptions> = {}) => createMemoryChatClient({ me: ME, conversations: [seed], ...over });
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" });

describe("one bad message can't take the thread down", () => {
  it("draws a conversation whose other member stored malformed hours", async () => {
    const client = make(dm(), { availability: { [SAM]: { timeZone: "UTC", hours: { mon: [[9, 17]], tue: 5 } as never } } });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByText("Hello");
    await waitFor(() => expect(client.calls.some((c) => c.method === "availabilityFor")).toBe(true));
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("an attachment kind named after a prototype key (constructor) gets the generic card", async () => {
    const client = make(dm({ messages: [{ id: "a", senderId: SAM, body: "see this", createdAt: at(1), attachments: [{ kind: "constructor", ref: {} }] }] }));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />, { attachmentKinds: { form: { title: () => "A form" } } });
    await screen.findByText("see this");
    expect(screen.getByText("Constructor")).toBeTruthy();
  });

  it("an app card whose functions throw or return junk falls back to the generic card", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = make(
      dm({
        messages: [
          { id: "a", senderId: SAM, body: "first", createdAt: at(1), attachments: [{ kind: "form", ref: {} }] },
          { id: "b", senderId: SAM, body: "second", createdAt: at(2), attachments: [{ kind: "lesson", ref: {} }] },
        ],
      }),
    );
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />, {
      attachmentKinds: {
        form: {
          title: (a: ChatAttachment) => {
            throw new Error(`bad ref ${String(a.kind)}`);
          },
        },
        lesson: { title: () => 42 as unknown as string },
      },
    });
    await screen.findByText("second");
    expect(screen.getByText("Form")).toBeTruthy();
    expect(screen.getByText("Lesson")).toBeTruthy();
    expect(error).toHaveBeenCalled();
  });

  it("an attachment slot that throws shows the generic card instead", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = make(dm({ messages: [{ id: "a", senderId: SAM, body: "with a form", createdAt: at(1), attachments: [{ kind: "form", name: "Check-in", ref: {} }] }] }));
    const Boom = () => {
      throw new Error("the app's renderer broke");
    };
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} slots={{ attachment: Boom }} />);
    await screen.findByText("with a form");
    expect(screen.getByText("Check-in")).toBeTruthy();
  });

  it("ChatErrorBoundary shows its fallback and reports the error", () => {
    const onError = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error("row broke");
    };
    render(
      <ChatErrorBoundary fallback={<span>could not draw</span>} onError={onError}>
        <Boom />
      </ChatErrorBoundary>,
    );
    expect(screen.getByText("could not draw")).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it("ChatErrorBoundary without onError reports through genesis-core's reportError", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reporter = vi.fn();
    const restore = setErrorReporter(reporter);
    const Boom = () => {
      throw new Error("row broke");
    };
    try {
      render(
        <ChatErrorBoundary fallback={<span>could not draw</span>}>
          <Boom />
        </ChatErrorBoundary>,
      );
    } finally {
      restore();
    }
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ message: "row broke" }), { source: "chat:render" });
  });
});

describe("catch-up after a long time away", () => {
  const seedMessages = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, senderId: SAM, body: `message ${i + 1}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
  const key = [...chatKeys.conversation("c1"), "messages", null, null] as const;

  it("pages until it has everything", async () => {
    const client = make(dm({ messages: seedMessages(450) }));
    const first = (await client.messages("c1", { beforeSeq: 2, limit: 1 })).messages;
    const { wrapper, queryClient } = providers(client);
    queryClient.setQueryData(key, { messages: first, hasEarlier: false });
    const { result } = renderHook(() => useConversation("c1", { markRead: false }), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(450));
    expect(client.calls.filter((c) => c.method === "messages" && (c.args[1] as { afterSeq?: number })?.afterSeq != null)).toHaveLength(3);
  });

  it(`after ${CATCH_UP_MAX_PAGES} full pages it shows the newest page, with the rest behind "load earlier"`, async () => {
    const total = CATCH_UP_PAGE * CATCH_UP_MAX_PAGES + 300;
    const client = make(dm({ messages: seedMessages(total) }));
    const first = (await client.messages("c1", { beforeSeq: 2, limit: 1 })).messages;
    const { wrapper, queryClient } = providers(client);
    queryClient.setQueryData(key, { messages: first, hasEarlier: false });
    const { result } = renderHook(() => useConversation("c1", { markRead: false }), { wrapper });
    await waitFor(() => expect(result.current.messages.at(-1)?.body).toBe(`message ${total}`));
    await waitFor(() => expect(result.current.messages).toHaveLength(50));
    expect(result.current.hasEarlier).toBe(true);
  });
});

describe("read places", () => {
  const cohort = make({
    id: "c1",
    members: [{ userId: ME }, { userId: SAM }, { userId: LEE }],
    topics: [{ topic: "w1", title: "Week 1" }],
    messages: [
      { id: "t1", senderId: SAM, body: "in week 1", topic: "w1", createdAt: at(1) },
      { id: "g1", senderId: LEE, body: "general, unseen", createdAt: at(2) },
      { id: "t2", senderId: SAM, body: "more week 1", topic: "w1", createdAt: at(3) },
    ],
  });

  it("a topic view doesn't move your read place (it would pass unseen messages in other topics)", async () => {
    const { wrapper } = providers(cohort);
    const { result } = renderHook(() => useConversation("c1", { topic: "w1" }), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    const mine = async () => (await cohort.members("c1")).find((m) => m.userId === ME)!.lastReadSeq;
    expect(await mine()).toBe(0);
    // The whole timeline does.
    renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(async () => expect(await mine()).toBe(3));
  });
});

describe("link previews", () => {
  const preview = { url: "https://example.test/a", status: "ok" as const, title: "A post", description: null, imageUrl: "https://tracker.test/pixel.png", siteName: "Example", fetchedAt: "" };

  it("show no image by default: the linked site never learns who read it", () => {
    render(<ChatLinkPreview preview={preview} />);
    expect(screen.getByTestId("genesis-chat-link-preview")).toBeTruthy();
    expect(screen.queryByTestId("genesis-chat-link-preview-image")).toBeNull();
  });

  it("load the image through the app's proxy when asked, and never without one", () => {
    const { rerender } = render(<ChatLinkPreview preview={preview} images="proxy" proxyUrl={(u) => `/img-proxy?u=${encodeURIComponent(u)}`} />);
    expect(screen.getByTestId("genesis-chat-link-preview-image").getAttribute("src")).toBe("/img-proxy?u=https%3A%2F%2Ftracker.test%2Fpixel.png");
    rerender(<ChatLinkPreview preview={preview} images="proxy" />);
    expect(screen.queryByTestId("genesis-chat-link-preview-image")).toBeNull();
    rerender(<ChatLinkPreview preview={preview} images="direct" />);
    expect(screen.getByTestId("genesis-chat-link-preview-image").getAttribute("src")).toBe(preview.imageUrl);
  });

  it("ask once per message: a new message with a link doesn't refetch the others", async () => {
    const client = make(dm({ messages: [{ id: "m1", senderId: SAM, body: "https://example.test/a", createdAt: at(1) }, { id: "m2", senderId: SAM, body: "https://example.test/b", createdAt: at(2) }] }), { linkPreviews: [preview] });
    const { wrapper } = providers(client);
    const { result, rerender } = renderHook(({ ids }) => useLinkPreviews(ids), { wrapper, initialProps: { ids: ["m1"] } });
    await waitFor(() => expect(result.current.m1?.[0]?.title).toBe("A post"));
    rerender({ ids: ["m1", "m2"] });
    await waitFor(() => expect(result.current.m2).toBeDefined());
    const asked = client.calls.filter((c) => c.method === "linkPreviewsFor").flatMap((c) => c.args[0] as string[]);
    expect(asked.filter((id) => id === "m1")).toHaveLength(1);
  });
});

describe("the emoji picker", () => {
  it("fetches nothing from a CDN: without emojibaseUrl it isn't offered", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<ChatEmojiPicker onSelect={() => undefined} />);
    expect(screen.getByTestId("genesis-chat-emoji-picker-unset")).toBeTruthy();
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByTestId("genesis-chat-input");
    expect(screen.queryByTestId("genesis-chat-emoji-button")).toBeNull();
    expect(screen.queryByTestId("genesis-chat-more-reactions")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is offered once the app hosts the data", async () => {
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} emojibaseUrl="/emojibase" />);
    expect(await screen.findByTestId("genesis-chat-emoji-button")).toBeTruthy();
  });
});

describe("retrying a broadcast or a schedule", () => {
  it("a broadcast sent again after a timeout keeps its clientId, and a double click sends once", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [dm(), { id: "c2", members: [{ userId: ME }, { userId: LEE }] }] });
    const real = client.broadcast.bind(client);
    const ids: string[] = [];
    let fail = true;
    client.broadcast = vi.fn(async (convs: string[], clientId: string, body: string) => {
      ids.push(clientId);
      await new Promise((r) => setTimeout(r, 20));
      if (fail) {
        fail = false;
        throw new ChatError("timeout", undefined, "broadcast_message");
      }
      return real(convs, clientId, body);
    });
    mount(client, <ChatBroadcast resolveUser={resolveUser} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Session moved" } });
    await screen.findByText("Lee");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    const send = screen.getByTestId("genesis-chat-broadcast-send");
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(ids).toHaveLength(1));
    await act(() => new Promise((r) => setTimeout(r, 40)));
    expect(ids).toHaveLength(1);
    fireEvent.click(screen.getByTestId("genesis-chat-broadcast-send"));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[1]).toBe(ids[0]);
  });

  it("a schedule tried again after a failure keeps its clientId", async () => {
    const client = make(dm());
    const real = client.schedule.bind(client);
    const ids: string[] = [];
    let fail = true;
    client.schedule = vi.fn(async (input) => {
      ids.push(input.clientId);
      if (fail) throw new ChatError("timeout", undefined, "schedule_message");
      return real(input);
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const box = (await screen.findByTestId("genesis-chat-input")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Later" } });
    openMenu(await screen.findByTestId("genesis-chat-send-menu"));
    fireEvent.click((await screen.findAllByTestId("genesis-chat-schedule-pick"))[0]!);
    await waitFor(() => expect(ids.length).toBeGreaterThan(0));
    await waitFor(() => expect((screen.getByTestId("genesis-chat-send-menu") as HTMLButtonElement).disabled).toBe(false));
    expect(box.value).toBe("Later");
    fail = false;
    const before = ids.length;
    openMenu(screen.getByTestId("genesis-chat-send-menu"));
    fireEvent.click((await screen.findAllByTestId("genesis-chat-schedule-pick"))[0]!);
    await waitFor(() => expect(box.value).toBe(""));
    expect(ids.length).toBeGreaterThan(before);
    expect(new Set(ids).size).toBe(1);
  });

  it("the custom time defaults to an hour from when the dialog opens", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date(2026, 9, 26, 8, 0, 0);
    vi.setSystemTime(t0);
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    fireEvent.change(await screen.findByTestId("genesis-chat-input"), { target: { value: "Later" } });
    // The menu (and its dialog) are drawn now, three hours before the dialog opens.
    const menu = await screen.findByTestId("genesis-chat-send-menu");
    vi.setSystemTime(new Date(2026, 9, 26, 11, 0, 0));
    openMenu(menu);
    fireEvent.click(await screen.findByTestId("genesis-chat-schedule-custom"));
    const input = (await screen.findByTestId("genesis-chat-schedule-input")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("2026-10-26T12:00"));
  });
});

describe("the camera", () => {
  const realMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  afterEach(() => {
    if (realMedia) Object.defineProperty(navigator, "mediaDevices", realMedia);
    else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  class FakeRecorder {
    static isTypeSupported = (t: string) => t === "video/webm";
    state: "inactive" | "recording" = "inactive";
    mimeType = "video/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["frames"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }
  async function recordTake() {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) } });
    fireEvent.click(await screen.findByTestId("genesis-chat-video-button"));
    const record = await screen.findByTestId("genesis-chat-video-record");
    await waitFor(() => expect((record as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(record);
    });
    fireEvent.click(await screen.findByTestId("genesis-chat-video-stop"));
    await screen.findByTestId("genesis-chat-video-retake");
  }

  it("a hosted video keeps its place: text typed after it lands after it, while its bytes still go up", async () => {
    const XHR = installFakeXHR();
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />, { videoUpload: { create: async () => ({ url: "https://up.test/1", providerId: "u1", provider: "mux" }) } });
    await recordTake();
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-chat-video-send"));
    });
    // The dialog closes at once; the upload carries on.
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-video-recorder")).toBeNull());
    fireEvent.change(await screen.findByTestId("genesis-chat-input"), { target: { value: "Watch this" } });
    fireEvent.keyDown(screen.getByTestId("genesis-chat-input"), { key: "Enter" });
    await waitFor(() => expect(client.calls.filter((c) => c.method === "send").length).toBe(2));
    const sends = client.calls.filter((c) => c.method === "send").map((c) => c.args[0] as { body: string; attachments?: { provider?: string; status?: string }[] });
    expect(sends[0]!.attachments?.[0]).toMatchObject({ provider: "mux", status: "pending" });
    expect(sends[1]!.body).toBe("Watch this");
    expect(XHR.all[0]!.status).toBe(0);
    act(() => XHR.all[0]!.respond(200));
  });

  it("keeps the take's preview while it uploads, and frees it once the message lands", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: () => "blob:take", revokeObjectURL: revoke, canParse: URL.canParse }));
    const client = make(dm());
    let land!: () => void;
    const upload = client.upload.bind(client);
    client.upload = vi.fn(async (...args: Parameters<typeof upload>) => {
      await new Promise<void>((r) => (land = r));
      return upload(...args);
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await recordTake();
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-chat-video-send"));
    });
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-video-recorder")).toBeNull());
    expect(revoke).not.toHaveBeenCalledWith("blob:take");
    await waitFor(() => expect(client.upload).toHaveBeenCalled());
    land();
    await waitFor(() => expect(client.calls.some((c) => c.method === "send")).toBe(true));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:take"));
  });

  it("turns off a camera that answers after the recorder closed", async () => {
    vi.stubGlobal("MediaRecorder", class { static isTypeSupported = () => true; });
    let answer!: (s: unknown) => void;
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => new Promise((r) => (answer = r)) } });
    const { result, unmount } = renderHook(() => useVideoRecorder({ maxMs: 60_000 }));
    let opened!: Promise<boolean>;
    act(() => {
      opened = result.current.open();
    });
    unmount();
    answer({ getTracks: () => [{ stop }, { stop }] });
    expect(await opened).toBe(false);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
