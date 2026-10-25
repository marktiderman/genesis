/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatProvider, type ChatProviderProps } from "../react";
import {
  ChatAvailabilitySettings,
  ChatBroadcast,
  ChatLinkPreview,
  ChatThread,
  createMemoryChatClient,
  type MemoryChatClient,
  type MemoryChatOptions,
  type MemoryConversationSeed,
} from "../web";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
configure({ asyncUtilTimeout: 4000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const LEE = "00000000-0000-4000-8000-0000000000c3";
const names: Record<string, string> = { [ME]: "Me", [SAM]: "Sam", [LEE]: "Lee" };
const resolveUser = (id: string) => ({ name: names[id] ?? "Someone" });
const at = (min: number) => new Date(Date.now() - (600 - min) * 60_000).toISOString();

function mount(client: MemoryChatClient, ui: ReactNode, extra: Partial<ChatProviderProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME} {...extra}>
        {ui}
      </ChatProvider>
    </QueryClientProvider>,
  );
}

const dm = (over: Partial<MemoryConversationSeed> = {}): MemoryConversationSeed => ({
  id: "c1",
  members: [{ userId: ME }, { userId: SAM }],
  messages: [
    { id: "m1", senderId: SAM, body: "Hello", createdAt: at(1) },
    { id: "m2", senderId: ME, body: "Hi Sam", createdAt: at(2) },
  ],
  ...over,
});

const make = (seed: MemoryConversationSeed, over: Partial<MemoryChatOptions> = {}) => createMemoryChatClient({ me: ME, conversations: [seed], ...over });

/** Radix menus open from the keyboard in happy-dom (it has no pointer capture). */
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" });

describe("topics", () => {
  const cohort = (role: "owner" | "member", closed = false): MemoryConversationSeed => ({
    id: "c1",
    title: "Cohort",
    members: [{ userId: ME, role }, { userId: SAM, role: role === "owner" ? "member" : "owner" }, { userId: LEE }],
    topics: [
      { topic: "w1", title: "Week 1", closed },
      { topic: "w2", title: "Week 2" },
    ],
    messages: [
      { id: "g1", senderId: SAM, body: "Welcome, everyone", createdAt: at(1) },
      { id: "t1", senderId: LEE, body: "Week one question", topic: "w1", createdAt: at(2) },
      { id: "t2", senderId: SAM, body: "Week two notes", topic: "w2", createdAt: at(3) },
    ],
  });

  it("shows All and each topic, filters to one, and posts into it", async () => {
    const client = make(cohort("member"));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const bar = await screen.findByTestId("genesis-chat-topic-bar");
    expect(within(bar).getByText("All")).toBeTruthy();
    await screen.findByText("Week two notes");
    fireEvent.click(within(bar).getByTestId("genesis-chat-topic-w1"));
    expect(await screen.findByText("Week one question")).toBeTruthy();
    expect(screen.queryByText("Week two notes")).toBeNull();
    const input = await screen.findByTestId("genesis-chat-input");
    expect(input.getAttribute("placeholder")).toBe("Message #Week 1");
    fireEvent.change(input, { target: { value: "My answer" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(client.calls.some((c) => c.method === "send")).toBe(true));
    expect(client.calls.find((c) => c.method === "send")!.args[0]).toMatchObject({ body: "My answer", topic: "w1" });
    // No owner controls for a member.
    expect(screen.queryByTestId("genesis-chat-topic-menu")).toBeNull();
  });

  it("says a closed topic is closed instead of offering the box", async () => {
    const client = make(cohort("member", true));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const closed = await screen.findByTestId("genesis-chat-topic-w1");
    expect(closed.getAttribute("aria-label")).toBe("Week 1 (closed)");
    fireEvent.click(closed);
    expect((await screen.findByTestId("genesis-chat-composer-disabled")).textContent).toContain("This topic is closed");
    expect(screen.queryByTestId("genesis-chat-input")).toBeNull();
  });

  it("lets an owner start a topic and close one", async () => {
    const client = make(cohort("owner"));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    openMenu(await screen.findByTestId("genesis-chat-topic-menu"));
    fireEvent.click(await screen.findByTestId("genesis-chat-topic-new"));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Week 3: Habits" } });
    fireEvent.click(screen.getByTestId("genesis-chat-topic-create"));
    await screen.findByTestId("genesis-chat-topic-week-3-habits");
    expect(client.calls.find((c) => c.method === "setTopic")!.args).toEqual(["c1", "week-3-habits", { title: "Week 3: Habits", position: 2 }]);
    // The new topic is chosen; close it.
    openMenu(screen.getByTestId("genesis-chat-topic-menu"));
    fireEvent.click(await screen.findByTestId("genesis-chat-topic-close"));
    await waitFor(() => expect(screen.getByTestId("genesis-chat-topic-week-3-habits").getAttribute("aria-label")).toBe("Week 3: Habits (closed)"));
    // An owner can still post in a closed topic.
    expect(screen.getByTestId("genesis-chat-input")).toBeTruthy();
  });
});

describe("scheduled send", () => {
  it("schedules from the send menu, lists it, and cancels it", async () => {
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const input = await screen.findByTestId("genesis-chat-input");
    fireEvent.change(input, { target: { value: "See you tomorrow" } });
    openMenu(await screen.findByTestId("genesis-chat-send-menu"));
    const picks = await screen.findAllByTestId("genesis-chat-schedule-pick");
    expect(picks[0]!.textContent).toMatch(/Tomorrow/);
    fireEvent.click(picks[0]!);
    await waitFor(() => expect(client.calls.some((c) => c.method === "schedule")).toBe(true));
    const scheduled = client.calls.find((c) => c.method === "schedule")!.args[0] as { body: string; sendAt: Date };
    expect(scheduled.body).toBe("See you tomorrow");
    expect(new Date(scheduled.sendAt).getHours()).toBe(9);
    // Not sent now, and the box is clear.
    expect(client.calls.some((c) => c.method === "send")).toBe(false);
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));

    const count = await screen.findByTestId("genesis-chat-scheduled-count");
    expect(count.textContent).toContain("1 scheduled message");
    fireEvent.click(count);
    fireEvent.click(await screen.findByTestId("genesis-chat-scheduled-cancel"));
    await waitFor(() => expect(client.calls.some((c) => c.method === "cancelScheduled")).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-scheduled-count")).toBeNull());
  });

  it("schedules at a date and time you pick", async () => {
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    fireEvent.change(await screen.findByTestId("genesis-chat-input"), { target: { value: "Custom" } });
    openMenu(await screen.findByTestId("genesis-chat-send-menu"));
    fireEvent.click(await screen.findByTestId("genesis-chat-schedule-custom"));
    const when = new Date(Date.now() + 2 * 86_400_000);
    when.setHours(14, 30, 0, 0);
    const p = (n: number) => String(n).padStart(2, "0");
    fireEvent.change(await screen.findByTestId("genesis-chat-schedule-input"), {
      target: { value: `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}T14:30` },
    });
    fireEvent.click(screen.getByTestId("genesis-chat-schedule-confirm"));
    await waitFor(() => expect(client.calls.some((c) => c.method === "schedule")).toBe(true));
    expect(new Date((client.calls.find((c) => c.method === "schedule")!.args[0] as { sendAt: Date }).sendAt).getTime()).toBe(when.getTime());
  });
});

describe("availability", () => {
  it("shows a banner when the other person is away", async () => {
    const client = make(dm(), { availability: { [SAM]: { awayMessage: "Back Monday", awayUntil: new Date(Date.now() + 3 * 86_400_000).toISOString() } } });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const banner = await screen.findByTestId("genesis-chat-away-banner");
    expect(banner.textContent).toMatch(/^Away until .+: Back Monday$/);
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("shows no banner inside working hours, and says when they reply outside them", async () => {
    const all = { mon: [["00:00", "24:00"]], tue: [["00:00", "24:00"]], wed: [["00:00", "24:00"]], thu: [["00:00", "24:00"]], fri: [["00:00", "24:00"]], sat: [["00:00", "24:00"]], sun: [["00:00", "24:00"]] } as never;
    const inside = make(dm(), { availability: { [SAM]: { timeZone: "UTC", hours: all } } });
    const { unmount } = mount(inside, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByText("Hello");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("genesis-chat-away-banner")).toBeNull();
    unmount();
    const never = make(dm(), { availability: { [SAM]: { timeZone: "America/New_York", hours: { mon: [["09:00", "09:01"]] } } } });
    mount(never, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    expect((await screen.findByTestId("genesis-chat-away-banner")).textContent).toBe("Sam replies Mon, 9–9:01 (Eastern)");
  });

  it("saves your away message, hours and time zone", async () => {
    const client = make(dm());
    mount(client, <ChatAvailabilitySettings />);
    fireEvent.change(await screen.findByLabelText("Away message"), { target: { value: "On holiday" } });
    fireEvent.click(screen.getByRole("switch", { name: /Tell people when you usually reply/ }));
    fireEvent.click(await screen.findByTestId("genesis-chat-availability-save"));
    await waitFor(() => expect(client.calls.some((c) => c.method === "setAvailability")).toBe(true));
    const saved = client.calls.find((c) => c.method === "setAvailability")!.args[0] as { awayMessage: string; hours: Record<string, unknown>; timeZone: string };
    expect(saved.awayMessage).toBe("On holiday");
    expect(Object.keys(saved.hours)).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(saved.hours.mon).toEqual([["09:00", "17:00"]]);
    expect(saved.timeZone).toBeTruthy();
  });
});

describe("search", () => {
  it("finds a message further up, loads to it and highlights it", async () => {
    const messages = [
      { id: "old", senderId: SAM, body: "The needle is here", createdAt: at(1) },
      ...Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, senderId: i % 2 ? ME : SAM, body: `Filler ${i}`, createdAt: at(10 + i) })),
    ];
    const client = make(dm({ messages }));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByText("Filler 59");
    expect(document.getElementById("genesis-chat-msg-old")).toBeNull();
    fireEvent.click(screen.getByTestId("genesis-chat-thread-search"));
    fireEvent.change(await screen.findByTestId("genesis-chat-search-input"), { target: { value: "needle" } });
    const hit = await screen.findByTestId("genesis-chat-search-hit");
    expect(hit.querySelector("mark")?.textContent).toBe("needle");
    fireEvent.click(hit);
    await waitFor(() => expect(document.querySelector("#genesis-chat-msg-old .ring-2")).not.toBeNull());
  });

  it("marks hits in a transcript", async () => {
    const client = make(dm({ messages: [{ id: "v", senderId: SAM, body: "", createdAt: at(1), attachments: [{ kind: "voice", transcript: "call the dentist" }] }] }));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    fireEvent.click(await screen.findByTestId("genesis-chat-thread-search"));
    fireEvent.change(await screen.findByTestId("genesis-chat-search-input"), { target: { value: "dentist" } });
    expect((await screen.findByTestId("genesis-chat-search-transcript")).textContent).toContain("Transcript");
  });
});

describe("link previews", () => {
  const preview = { url: "https://example.test/a", status: "ok" as const, title: "A title", description: "<b>not html</b>", siteName: "Example", fetchedAt: "t" };

  it("draws an https image, and never a non-https one, and never HTML", () => {
    const { rerender } = render(<ChatLinkPreview preview={{ ...preview, imageUrl: "https://example.test/i.png" }} />);
    expect(screen.getByTestId("genesis-chat-link-preview-image").getAttribute("src")).toBe("https://example.test/i.png");
    expect(screen.getByText("<b>not html</b>")).toBeTruthy();
    expect(screen.getByTestId("genesis-chat-link-preview").querySelector("b")).toBeNull();
    for (const bad of ["http://example.test/i.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "//example.test/i.png"]) {
      rerender(<ChatLinkPreview preview={{ ...preview, imageUrl: bad }} />);
      expect(screen.queryByTestId("genesis-chat-link-preview-image")).toBeNull();
    }
    rerender(<ChatLinkPreview preview={{ ...preview, url: "javascript:alert(1)", imageUrl: null }} />);
    expect(screen.queryByTestId("genesis-chat-link-preview")).toBeNull();
  });

  it("puts a card under a message with a link", async () => {
    const client = make(dm({ messages: [{ id: "l", senderId: SAM, body: "Read https://example.test/a", createdAt: at(1) }] }), {
      linkPreviews: [{ ...preview, imageUrl: null }],
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    expect((await screen.findByTestId("genesis-chat-link-preview")).textContent).toContain("A title");
  });
});

describe("moderation", () => {
  const seed = (myRole?: "observer"): MemoryConversationSeed => ({
    id: "c1",
    members: [{ userId: ME }, { userId: SAM }, { userId: LEE }],
    ...(myRole ? { myRole, members: [{ userId: SAM }, { userId: LEE }, { userId: "00000000-0000-4000-8000-0000000000d4" }] } : {}),
    messages: [
      { id: "h1", senderId: ME, body: "Something rude", moderation: "hidden", createdAt: at(1) },
      { id: "h2", senderId: SAM, body: "Hidden from you", moderation: "hidden", createdAt: at(2) },
      { id: "f1", senderId: LEE, body: "Borderline", moderation: "flagged", createdAt: at(3) },
    ],
  });

  it("tells the sender their message is hidden, and hides others' hidden messages", async () => {
    const client = make(seed());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    expect((await screen.findByTestId("genesis-chat-hidden-notice")).textContent).toContain("Hidden by moderation");
    expect(screen.queryByText("Hidden from you")).toBeNull();
    // A flagged message reads as normal to members.
    expect(screen.getByText("Borderline")).toBeTruthy();
    expect(screen.queryByTestId("genesis-chat-moderation-flagged")).toBeNull();
  });

  it("shows observers hidden and flagged messages with a badge", async () => {
    const client = make(seed("observer"));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByText("Hidden from you");
    expect(screen.getAllByTestId("genesis-chat-moderation-hidden")).toHaveLength(2);
    expect(screen.getByTestId("genesis-chat-moderation-flagged").textContent).toContain("Flagged");
  });
});

describe("app attachment kinds", () => {
  it("draws a registered kind as a card with its action", async () => {
    const client = make(dm({ messages: [{ id: "a", senderId: SAM, body: "", createdAt: at(1), attachments: [{ kind: "form", ref: { formId: "f1", title: "Weekly check-in" } }] }] }));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />, {
      attachmentKinds: {
        form: {
          title: (a) => String(a.ref.title),
          subtitle: () => "Takes 2 minutes",
          action: (a) => ({ label: "Fill in", href: `https://app.test/forms/${String(a.ref.formId)}` }),
        },
      },
    });
    const card = await screen.findByTestId("genesis-chat-attachment-card");
    expect(card.textContent).toContain("Weekly check-in");
    expect(card.textContent).toContain("Takes 2 minutes");
    expect(within(card).getByRole("link", { name: /Fill in/ }).getAttribute("href")).toBe("https://app.test/forms/f1");
  });
});

describe("broadcast", () => {
  it("sends one message into each picked conversation", async () => {
    const client = createMemoryChatClient({
      me: ME,
      conversations: [dm(), { id: "c2", members: [{ userId: ME }, { userId: LEE }] }],
    });
    mount(client, <ChatBroadcast resolveUser={resolveUser} />);
    expect(screen.getByText(/replies come back to you privately/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Session moved to 10" } });
    await screen.findByText("Lee");
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByTestId("genesis-chat-broadcast-send"));
    await waitFor(() => expect(client.calls.some((c) => c.method === "broadcast")).toBe(true));
    expect([...(client.calls.find((c) => c.method === "broadcast")!.args[0] as string[])].sort()).toEqual(["c1", "c2"]);
    await waitFor(() => expect(client.calls.filter((c) => c.method === "send")).toHaveLength(2));
  });
});

describe("access errors", () => {
  it("offers a retry instead of saying you can't post", async () => {
    const client = make(dm());
    const real = client.myRole;
    client.myRole = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByTestId("genesis-chat-access-error");
    expect(screen.queryByTestId("genesis-chat-cannot-post")).toBeNull();
    client.myRole = real;
    fireEvent.click(screen.getByTestId("genesis-chat-access-retry"));
    await screen.findByTestId("genesis-chat-input");
  });
});

describe("video in the composer", () => {
  class FakeRecorder {
    static isTypeSupported = (t: string) => t === "video/webm;codecs=vp8,opus";
    state: "inactive" | "recording" = "inactive";
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: unknown, opts?: { mimeType?: string }) {
      this.mimeType = opts?.mimeType ?? "";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["frames"], { type: "video/webm" }) });
      this.onstop?.();
    }
  }
  const realMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  afterEach(() => {
    if (realMedia) Object.defineProperty(navigator, "mediaDevices", realMedia);
  });
  const stubCamera = () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }, { stop }] }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    return { getUserMedia, stop };
  };

  async function recordAndSend(time: { now: number }) {
    fireEvent.click(await screen.findByTestId("genesis-chat-video-button"));
    const record = await screen.findByTestId("genesis-chat-video-record");
    await waitFor(() => expect((record as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(record);
    });
    time.now += 4_000;
    fireEvent.click(await screen.findByTestId("genesis-chat-video-stop"));
    await screen.findByTestId("genesis-chat-video-retake");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-chat-video-send"));
    });
  }

  it("records, uploads to the app's videoUpload with a PUT, and sends a pending Mux video", async () => {
    const time = { now: 2_000_000 };
    vi.spyOn(Date, "now").mockImplementation(() => time.now);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const camera = stubCamera();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn(async () => ({ url: "https://storage.mux.test/upload/1", providerId: "up_1", provider: "mux" as const }));
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />, { videoUpload: { create } });
    await recordAndSend(time);
    await waitFor(() => expect(client.calls.some((c) => c.method === "send")).toBe(true));
    expect(camera.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: true, video: expect.anything() }));
    expect(create).toHaveBeenCalledWith("c1");
    expect(fetchMock).toHaveBeenCalledWith("https://storage.mux.test/upload/1", expect.objectContaining({ method: "PUT", headers: { "Content-Type": "video/webm" } }));
    const sent = client.calls.find((c) => c.method === "send")!.args[0] as { body: string; attachments: Record<string, unknown>[] };
    expect(sent.attachments[0]).toMatchObject({ kind: "video", provider: "mux", providerId: "up_1", status: "pending", durationMs: 4000, mime: "video/webm" });
    // Nothing went to storage, and the camera was released.
    expect(client.calls.some((c) => c.method === "upload")).toBe(false);
    expect(camera.stop).toHaveBeenCalled();
    // The pending video says it's processing.
    expect(await screen.findByTestId("genesis-chat-video-processing")).toBeTruthy();
  });

  it("falls back to a storage upload without videoUpload", async () => {
    const time = { now: 3_000_000 };
    vi.spyOn(Date, "now").mockImplementation(() => time.now);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    stubCamera();
    const client = make(dm());
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await recordAndSend(time);
    await waitFor(() => expect(client.calls.some((c) => c.method === "send")).toBe(true));
    expect(client.calls.find((c) => c.method === "upload")!.args[1]).toMatch(/^video-.*\.webm$/);
    const sent = client.calls.find((c) => c.method === "send")!.args[0] as { attachments: Record<string, unknown>[] };
    expect(sent.attachments[0]).toMatchObject({ kind: "video", mime: "video/webm", durationMs: 4000 });
  });

  it("plays a ready Mux video from its playback id with a poster", async () => {
    const client = make(
      dm({ messages: [{ id: "v", senderId: SAM, body: "", createdAt: at(1), attachments: [{ kind: "video", provider: "mux", providerId: "up", playbackId: "pb123", status: "ready" }] }] }),
    );
    // Native HLS (Safari): the stream goes straight on the element.
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((t: string) => (t === "application/vnd.apple.mpegurl" ? "maybe" : ""));
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const video = (await screen.findByTestId("genesis-chat-video-hls")) as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute("src") ?? video.src).toBe("https://stream.mux.com/pb123.m3u8"));
    expect(video.getAttribute("poster")).toBe("https://image.mux.com/pb123/thumbnail.jpg");
  });
});
