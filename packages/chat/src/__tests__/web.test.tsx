/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatProvider } from "../react";
import { ChatInbox, ChatThread, VoiceNote, createMemoryChatClient, type MemoryChatClient, type MemoryConversationSeed } from "../web";

afterEach(cleanup);
// Generous waits: these run in parallel with other suites in CI.
configure({ asyncUtilTimeout: 4000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const LEE = "00000000-0000-4000-8000-0000000000c3";
const names: Record<string, string> = { [ME]: "Me", [SAM]: "Sam", [LEE]: "Lee" };
const resolveUser = (id: string) => ({ name: names[id] ?? "Someone" });
const at = (min: number) => new Date(Date.now() - (60 - min) * 60_000).toISOString();

function mount(client: MemoryChatClient, ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME}>
        {ui}
      </ChatProvider>
    </QueryClientProvider>,
  );
}

const group = (over: Partial<MemoryConversationSeed> = {}): MemoryConversationSeed => ({
  id: "c1",
  title: "Morning crew",
  members: [{ userId: ME }, { userId: SAM }, { userId: LEE }],
  messages: [
    { id: "m1", kind: "system", body: "Sam started the conversation", createdAt: at(1) },
    { id: "m2", senderId: SAM, body: "Hello **there**", createdAt: at(2), reactions: [{ emoji: "👍", userId: SAM }] },
    { id: "m3", senderId: ME, body: "Hi Sam", createdAt: at(3) },
    { id: "m4", senderId: LEE, body: "", deletedAt: at(5), createdAt: at(4) },
  ],
  ...over,
});

describe("ChatThread", () => {
  it("draws theirs, mine, system, deleted and internal notes, each labelled for screen readers", async () => {
    const client = createMemoryChatClient({
      me: ME,
      conversations: [
        group({
          myRole: "observer",
          members: [{ userId: SAM }, { userId: LEE }, { userId: "00000000-0000-4000-8000-0000000000d4" }],
          messages: [
            ...group().messages!,
            { id: "m5", senderId: ME, body: "Check in with Sam", visibility: "observers", createdAt: at(6) },
          ],
        }),
      ],
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);

    expect(await screen.findByText("Sam started the conversation")).toBeTruthy();
    const theirs = screen.getByTestId("genesis-chat-theirs");
    expect(theirs.textContent).toContain("Hello there");
    expect(theirs.querySelector("strong")?.textContent).toBe("there");
    expect(screen.getAllByTestId("genesis-chat-mine")[0]!.textContent).toContain("Hi Sam");
    expect(screen.getByTestId("genesis-chat-deleted").textContent).toContain("Message deleted");
    const note = screen.getByTestId("genesis-chat-note");
    expect(note.textContent).toContain("Internal note");
    expect(note.textContent).toContain("Check in with Sam");
    // Every bubble carries "Name, time: text".
    const labels = screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
    expect(labels.some((l) => /^Sam, .+: Hello there$/.test(l ?? ""))).toBe(true);
    expect(labels.some((l) => /^You, .+: Hi Sam$/.test(l ?? ""))).toBe(true);
    expect(labels.some((l) => /internal note/.test(l ?? ""))).toBe(true);
    // In a group, others' names show.
    expect(screen.getAllByText("Sam").length).toBeGreaterThan(0);
  });

  it("sends on Enter, shows it as sending, then as sent", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const input = await screen.findByTestId("genesis-chat-input");
    // The send waits until the test lets it go, so the sending state is on screen when it's checked.
    const release = client.holdNextSend();
    fireEvent.change(input, { target: { value: "On my way" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByTestId("genesis-chat-pending-sending")).toBeTruthy();
    expect(await screen.findByText("Sending…")).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe("");
    release();
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-pending-sending")).toBeNull());
    const sends = client.calls.filter((c) => c.method === "send");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.args[0]).toMatchObject({ conversationId: "c1", body: "On my way", visibility: "everyone" });
    expect(screen.getAllByTestId("genesis-chat-mine").some((b) => b.textContent?.includes("On my way"))).toBe(true);
  });

  it("Shift+Enter is a new line, not a send", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const input = await screen.findByTestId("genesis-chat-input");
    fireEvent.change(input, { target: { value: "line one" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(client.calls.some((c) => c.method === "send")).toBe(false);
  });

  it("a failed send says Not sent, and Retry sends it again with the same clientId", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    client.failNextSends(1);
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const input = await screen.findByTestId("genesis-chat-input");
    fireEvent.change(input, { target: { value: "Are you there?" } });
    fireEvent.click(screen.getByTestId("genesis-chat-send"));

    const failed = await screen.findByTestId("genesis-chat-pending-failed");
    expect(within(failed).getByRole("alert").textContent).toMatch(/Not sent/);
    await act(async () => {
      fireEvent.click(within(failed).getByTestId("genesis-chat-retry"));
    });
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-pending-failed")).toBeNull());
    const sends = client.calls.filter((c) => c.method === "send").map((c) => c.args[0] as { clientId: string });
    expect(sends).toHaveLength(2);
    expect(sends[0]!.clientId).toBe(sends[1]!.clientId);
    expect(screen.getAllByTestId("genesis-chat-mine").some((b) => b.textContent?.includes("Are you there?"))).toBe(true);
  });

  it("Delete on a failed message throws it away", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    client.failNextSends(1);
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const input = await screen.findByTestId("genesis-chat-input");
    fireEvent.change(input, { target: { value: "never mind" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const failed = await screen.findByTestId("genesis-chat-pending-failed");
    await act(async () => {
      fireEvent.click(within(failed).getByTestId("genesis-chat-discard"));
    });
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-pending-failed")).toBeNull());
    expect(screen.queryByText("never mind")).toBeNull();
  });

  it("clicking a reaction chip toggles yours", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const chip = await screen.findByTestId("genesis-chat-reaction-👍");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.textContent).toContain("1");
    await act(async () => {
      fireEvent.click(chip);
    });
    expect(client.calls.find((c) => c.method === "react")?.args).toEqual(["m2", "👍", true]);
    await waitFor(() => expect(screen.getByTestId("genesis-chat-reaction-👍").getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByTestId("genesis-chat-reaction-👍").textContent).toContain("2");

    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-chat-reaction-👍"));
    });
    expect(client.calls.filter((c) => c.method === "react").at(-1)?.args).toEqual(["m2", "👍", false]);
    await waitFor(() => expect(screen.getByTestId("genesis-chat-reaction-👍").getAttribute("aria-pressed")).toBe("false"));
  });

  it("a reply quote scrolls to and highlights the original", async () => {
    const client = createMemoryChatClient({
      me: ME,
      conversations: [group({ messages: [...group().messages!, { id: "m6", senderId: SAM, body: "Yes!", replyToId: "m3", createdAt: at(7) }] })],
    });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    const quote = await screen.findByTestId("genesis-chat-reply-quote");
    expect(quote.textContent).toContain("You");
    expect(quote.textContent).toContain("Hi Sam");
    fireEvent.click(quote);
    await waitFor(() => expect(document.querySelector("#genesis-chat-msg-m3 .ring-2")).not.toBeNull());
  });

  it("says why you can't post when only admins can", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group({ canPost: false, settings: { who_posts: "admins" } })] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    expect((await screen.findByTestId("genesis-chat-cannot-post")).textContent).toContain("Only admins can post here");
    expect(screen.queryByTestId("genesis-chat-input")).toBeNull();
  });

  it("announces an incoming message and shows who is typing", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    await screen.findByText("Hi Sam");
    act(() => client.activity("c1", LEE, "typing"));
    await waitFor(() => expect(screen.getByTestId("genesis-chat-activity").textContent).toContain("Lee is typing…"));
    act(() => void client.receive("c1", LEE, "Coming now"));
    await waitFor(() => expect(screen.getByTestId("genesis-chat-announcer").textContent).toBe("Lee: Coming now"));
    expect(screen.getByTestId("genesis-chat-announcer").getAttribute("aria-live")).toBe("polite");
  });
});

describe("ChatInbox", () => {
  it("lists conversations with the other person's name, You: previews and unread counts, and selects on click", async () => {
    const client = createMemoryChatClient({
      me: ME,
      conversations: [
        { id: "d1", members: [{ userId: ME }, { userId: SAM }], messages: [{ senderId: ME, body: "See you **soon**", createdAt: at(10) }], pinned: true },
        group({ members: [{ userId: ME, lastReadSeq: 0 }, { userId: SAM }, { userId: LEE }], muted: true }),
      ],
    });
    const picked: string[] = [];
    mount(client, <ChatInbox resolveUser={resolveUser} onSelect={(id) => picked.push(id)} selectedId="d1" />);
    const row = await screen.findByTestId("genesis-chat-inbox-row-d1");
    expect(row.textContent).toContain("Sam");
    expect(row.textContent).toContain("You: See you soon");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.getAttribute("aria-label")).toMatch(/pinned/);
    const groupRow = screen.getByTestId("genesis-chat-inbox-row-c1");
    expect(groupRow.textContent).toContain("Morning crew");
    expect(groupRow.getAttribute("aria-label")).toMatch(/2 unread.*muted/);
    fireEvent.click(groupRow);
    expect(picked).toEqual(["c1"]);
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(document.activeElement).toBe(groupRow);
  });

  it("shows an empty state when there are none", async () => {
    const client = createMemoryChatClient({ me: ME, conversations: [] });
    mount(client, <ChatInbox resolveUser={resolveUser} onSelect={() => undefined} />);
    expect(await screen.findByText("No conversations yet")).toBeTruthy();
  });
});

describe("VoiceNote", () => {
  it("cycles the speed 1× → 1.5× → 2× → 1× and sets the audio's rate", () => {
    const { container } = render(<VoiceNote src="https://files.example/v.webm" durationMs={42_000} waveform={[10, 50, 100, 30]} transcript="Hello there" />);
    const rate = screen.getByTestId("genesis-chat-voice-rate");
    const audio = container.querySelector("audio")!;
    expect(rate.textContent).toBe("1×");
    fireEvent.click(rate);
    expect(rate.textContent).toBe("1.5×");
    expect(audio.playbackRate).toBe(1.5);
    fireEvent.click(rate);
    expect(rate.textContent).toBe("2×");
    expect(audio.playbackRate).toBe(2);
    fireEvent.click(rate);
    expect(rate.textContent).toBe("1×");
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByText("Transcript")).toBeTruthy();
  });

  it("says Transcribing… while the transcript is pending", () => {
    render(<VoiceNote src={null} durationMs={5000} transcriptStatus="pending" />);
    expect(screen.getByText("Transcribing…")).toBeTruthy();
  });
});

describe("voice notes in the composer", () => {
  const realMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (realMedia) Object.defineProperty(navigator, "mediaDevices", realMedia);
  });

  const stubMic = (getUserMedia: () => Promise<unknown>) =>
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

  class FakeRecorder {
    static isTypeSupported = (t: string) => t === "audio/webm;codecs=opus";
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
      this.ondataavailable?.({ data: new Blob(["opus"], { type: "audio/webm" }) });
      this.onstop?.();
    }
  }

  it("records with MediaRecorder and sends a voice attachment with its duration and waveform", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    stubMic(async () => ({ getTracks: () => [{ stop() {} }] }));
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);

    fireEvent.click(await screen.findByTestId("genesis-chat-mic"));
    await screen.findByTestId("genesis-chat-recording");
    now += 3_000;
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-chat-voice-send"));
    });
    await waitFor(() => expect(client.calls.some((c) => c.method === "send")).toBe(true));
    const input = client.calls.find((c) => c.method === "send")!.args[0] as { body: string; attachments: { kind: string; durationMs: number; waveform: number[]; mime: string }[] };
    expect(input.body).toBe("");
    expect(input.attachments[0]).toMatchObject({ kind: "voice", durationMs: 3000, mime: "audio/webm" });
    expect(input.attachments[0]!.waveform).toHaveLength(48);
    expect(client.calls.find((c) => c.method === "upload")!.args[1]).toMatch(/^voice-.*\.webm$/);
  });

  it("says so clearly when the microphone is blocked", async () => {
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    stubMic(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    const client = createMemoryChatClient({ me: ME, conversations: [group()] });
    mount(client, <ChatThread conversationId="c1" resolveUser={resolveUser} />);
    fireEvent.click(await screen.findByTestId("genesis-chat-mic"));
    expect((await screen.findByTestId("genesis-chat-mic-error")).textContent).toMatch(/Microphone access is blocked/);
  });
});
