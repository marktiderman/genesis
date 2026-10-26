// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import { ChatProvider } from "../../react/index";
import { createMemoryChatClient, type MemoryChatClient, type MemoryConversationSeed } from "../../web/memory-client";
import { ChatAvailabilityScreen } from "../availability";
import { ChatBroadcastSheet } from "../broadcast-sheet";
import { ChatNativeProvider } from "../context";
import { ChatScheduledList, ChatScheduleSheet } from "../schedule-sheet";
import { ChatSearchScreen } from "../search-screen";
import { ChatThreadScreen } from "../thread-screen";
import { scrollToShow } from "../topics";
import { activePlaybackId, claimPlayback } from "../voice-player";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const LEE = "33333333-3333-4333-8333-333333333333";
const NAMES: Record<string, string> = { [ME]: "Me", [SAM]: "Sam", [LEE]: "Lee" };
const getPerson = (id: string) => (NAMES[id] ? { name: NAMES[id]! } : undefined);

function wrap(client: MemoryChatClient, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ChatProvider client={client} userId={ME}>
        <NativeToastProvider>
          <ChatNativeProvider getPerson={getPerson}>{children}</ChatNativeProvider>
        </NativeToastProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
}

function memory(conversations: MemoryConversationSeed[], extra: Partial<Parameters<typeof createMemoryChatClient>[0]> = {}) {
  return createMemoryChatClient({ me: ME, conversations, ...extra });
}

const called = (client: MemoryChatClient, method: string) => client.calls.filter((c) => c.method === method);

describe("ChatThreadScreen topics", () => {
  const seed = (myRole: "owner" | "member", closed = false): MemoryConversationSeed => ({
    id: "cohort",
    kind: "cohort",
    title: "Cohort",
    members: [{ userId: ME, role: myRole }, { userId: SAM }, { userId: LEE }],
    topics: [{ topic: "week-1", title: "Week 1" }, { topic: "week-2", title: "Week 2", closed }],
    messages: [
      { id: "a", senderId: SAM, body: "general hello" },
      { id: "b", senderId: SAM, body: "habits talk", topic: "week-1" },
      { id: "c", senderId: LEE, body: "week two talk", topic: "week-2" },
    ],
  });

  it("shows the topics as chips and lists only the topic chosen, with its name in the field", async () => {
    const client = memory([seed("member")]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-topics-week-1")).toBeTruthy());
    expect(screen.getByTestId("t-topics-all").getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(screen.getByTestId("t-message-a")).toBeTruthy());
    expect(screen.queryByTestId("t-topics-menu")).toBeNull(); // members don't manage topics

    fireEvent.click(screen.getByTestId("t-topics-week-1"));
    await screen.findByTestId("t-message-b");
    expect(screen.queryByTestId("t-message-a")).toBeNull();
    expect(screen.queryByTestId("t-message-c")).toBeNull();
    expect(called(client, "messages").some((c) => (c.args[1] as { topic?: string }).topic === "week-1")).toBe(true);
    expect((screen.getByTestId("t-composer-input") as HTMLInputElement).placeholder).toBe("Message #Week 1");
  });

  it("a closed topic takes no posts from a member, and says so", async () => {
    const client = memory([seed("member", true)]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-topics-week-2")).toBeTruthy());
    fireEvent.click(screen.getByTestId("t-topics-week-2"));
    await waitFor(() => expect(screen.getByTestId("t-composer-disabled").textContent).toBe("This topic is closed."));
  });

  it("lets an owner add a topic, which is then shown", async () => {
    const client = memory([seed("owner")]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-topics-menu")).toBeTruthy());
    fireEvent.click(screen.getByTestId("t-topics-menu"));
    fireEvent.click(await screen.findByTestId("t-topics-new"));
    const name = await screen.findByTestId("t-topics-name");
    fireEvent.change(name, { target: { value: "Week 3: Sleep" } });
    fireEvent.click(screen.getByTestId("t-topics-save"));
    await waitFor(() => expect(called(client, "setTopic")[0]?.args).toEqual(["cohort", "week-3-sleep", { title: "Week 3: Sleep", position: 2 }]));
    await waitFor(() => expect(screen.getByTestId("t-topics-week-3-sleep").getAttribute("aria-selected")).toBe("true"));
  });

  it("lets an owner close the topic shown", async () => {
    const client = memory([seed("owner")]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    fireEvent.click(await screen.findByTestId("t-topics-week-1"));
    fireEvent.click(screen.getByTestId("t-topics-menu"));
    fireEvent.click(await screen.findByTestId("t-topics-close"));
    await waitFor(() => expect(called(client, "setTopic")[0]?.args).toEqual(["cohort", "week-1", { closed: true }]));
  });
});

describe("ChatThreadScreen topics across conversations", () => {
  it("starts another conversation in All, not in the last one's topic", async () => {
    const client = memory([
      { id: "one", kind: "cohort", members: [{ userId: ME }, { userId: SAM }, { userId: LEE }], topics: [{ topic: "week-1", title: "Week 1" }], messages: [{ id: "a", senderId: SAM, body: "x", topic: "week-1" }] },
      { id: "two", kind: "cohort", members: [{ userId: ME }, { userId: SAM }, { userId: LEE }], messages: [{ id: "b", senderId: SAM, body: "y" }] },
    ]);
    const view = render(wrap(client, <ChatThreadScreen conversationId="one" testID="t" />));
    fireEvent.click(await screen.findByTestId("t-topics-week-1"));
    await waitFor(() => expect(screen.getByTestId("t-topics-week-1").getAttribute("aria-selected")).toBe("true"));
    view.rerender(wrap(client, <ChatThreadScreen conversationId="two" testID="t" />));
    await screen.findByTestId("t-message-b");
    const last = called(client, "messages").filter((c) => c.args[0] === "two").at(-1)!;
    expect((last.args[1] as { topic?: string }).topic).toBeUndefined();
  });
});

describe("ChatThreadScreen scheduled send", () => {
  const direct: MemoryConversationSeed = { id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "a", senderId: SAM, body: "hi" }] };

  it("schedules what's written when Send is held, empties the field, and lists it with Cancel", async () => {
    const client = memory([direct]);
    render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    const input = await screen.findByTestId("t-composer-input");
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    fireEvent.change(input, { target: { value: "see you tomorrow" } });
    const send = screen.getByTestId("t-composer-send");
    expect(send.getAttribute("data-a11y-actions")).toBe("longpress"); // VoiceOver's way to it
    fireEvent.contextMenu(send);
    fireEvent.click(await screen.findByTestId("t-schedule-pick-0"));
    await waitFor(() => expect(called(client, "schedule")).toHaveLength(1));
    expect(called(client, "schedule")[0]!.args[0]).toMatchObject({ conversationId: "dm", body: "see you tomorrow", topic: null });
    await waitFor(() => expect((screen.getByTestId("t-composer-input") as HTMLInputElement).value).toBe(""));
    expect(called(client, "send")).toHaveLength(0);

    fireEvent.click(await screen.findByTestId("t-scheduled"));
    expect(screen.getByTestId("t-scheduled").getAttribute("aria-label")).toBe("1 scheduled message");
    const list = await screen.findByTestId("t-scheduled-sheet");
    const cancel = within(list).getByText("Cancel");
    fireEvent.click(cancel.closest("button")!);
    await waitFor(() => expect(called(client, "cancelScheduled")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("t-scheduled")).toBeNull());
  });

  it("picks a custom time in the sheet, refusing one too soon", async () => {
    const client = memory([direct]);
    render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    const input = await screen.findByTestId("t-composer-input");
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    fireEvent.change(input, { target: { value: "later" } });
    fireEvent.contextMenu(screen.getByTestId("t-composer-send"));
    fireEvent.click(await screen.findByTestId("t-schedule-pick-custom"));
    expect(screen.getByTestId("t-schedule-custom")).toBeTruthy();
    // An hour ahead by default: schedulable.
    expect(screen.getByTestId("t-schedule-confirm").getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(screen.getByTestId("t-schedule-confirm"));
    await waitFor(() => expect(called(client, "schedule")).toHaveLength(1));
    const at = new Date((called(client, "schedule")[0]!.args[0] as { sendAt: Date }).sendAt);
    expect(at.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });
});

describe("ChatScheduleSheet and ChatScheduledList", () => {
  it("starts again at the quick picks each time it opens", async () => {
    const client = memory([]);
    const view = render(wrap(client, <ChatScheduleSheet open onOpenChange={vi.fn()} onSchedule={vi.fn()} testID="s" />));
    fireEvent.click(await screen.findByTestId("s-pick-custom"));
    expect(screen.getByTestId("s-custom")).toBeTruthy();
    view.rerender(wrap(client, <ChatScheduleSheet open={false} onOpenChange={vi.fn()} onSchedule={vi.fn()} testID="s" />));
    view.rerender(wrap(client, <ChatScheduleSheet open onOpenChange={vi.fn()} onSchedule={vi.fn()} testID="s" />));
    expect(await screen.findByTestId("s-pick-0")).toBeTruthy();
    expect(screen.queryByTestId("s-custom")).toBeNull();
  });

  it("offers Remove on one that couldn't be sent", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }] }]);
    await client.schedule({ conversationId: "dm", clientId: "c1", body: "later", sendAt: new Date(Date.now() + 3600_000) });
    client.failNextSends(1);
    await client.sendDue(new Date(Date.now() + 2 * 3600_000));
    render(wrap(client, <ChatScheduledList conversationId="dm" testID="l" />));
    const remove = await screen.findByText("Remove");
    expect(screen.getByText("Couldn't send")).toBeTruthy();
    fireEvent.click(remove.closest("button")!);
    await waitFor(() => expect(called(client, "cancelScheduled")).toHaveLength(1));
  });
});

describe("ChatThreadScreen availability and moderation", () => {
  it("shows the other person's away line under the header", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }] }], { availability: { [SAM]: { awayMessage: "On a retreat" } } });
    render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-away").getAttribute("aria-label")).toBe("Sam is away: On a retreat"));
  });

  it("shows nothing when they're around", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }] }], { availability: { [SAM]: {} } });
    render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    await waitFor(() => expect(called(client, "availabilityFor")).toHaveLength(1));
    expect(screen.queryByTestId("t-away")).toBeNull();
  });

  it("tells the sender a hidden message is theirs alone, and marks flagged ones for observers", async () => {
    const client = memory([
      { id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "h", senderId: ME, body: "oops", moderation: "hidden" }, { id: "f", senderId: SAM, body: "hmm", moderation: "flagged" }] },
    ]);
    render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-message-h-moderation").textContent).toBe("Hidden by moderation. Only you can see it."));
    expect(screen.queryByTestId("t-message-f-moderation")).toBeNull();

    cleanup();
    const observed = memory([
      { id: "g", members: [{ userId: SAM }, { userId: LEE }], myRole: "observer", messages: [{ id: "h", senderId: SAM, body: "oops", moderation: "hidden" }, { id: "f", senderId: LEE, body: "hmm", moderation: "flagged" }] },
    ]);
    render(wrap(observed, <ChatThreadScreen conversationId="g" testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-message-h-moderation").textContent).toBe("Hidden by moderation"));
    expect(screen.getByTestId("t-message-f-moderation").textContent).toBe("Flagged");
    expect(screen.getByTestId("t-message-f-bubble").getAttribute("aria-label")).toContain("Flagged");
  });
});

describe("ChatThreadScreen jumpTo", () => {
  it("loads earlier pages until the message is held, then highlights it", async () => {
    const messages = Array.from({ length: 120 }, (_, i) => ({ id: `m${i + 1}`, senderId: i % 2 ? SAM : ME, body: `message ${i + 1}` }));
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }], messages }]);
    render(wrap(client, <ChatThreadScreen conversationId="dm" jumpTo={{ messageId: "m3", seq: 3 }} testID="t" />));
    await waitFor(() => expect(screen.getByTestId("t-message-m3")).toBeTruthy());
    expect(called(client, "messages").some((c) => (c.args[1] as { beforeSeq?: number }).beforeSeq !== undefined)).toBe(true);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("t-message-m3").dataset.style!).backgroundColor).toBeTruthy());
    expect(JSON.parse(screen.getByTestId("t-message-m4").dataset.style!).backgroundColor).toBeUndefined();
  });

  it("says so when the message isn't there any more", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "a", senderId: SAM, body: "hi" }] }]);
    render(wrap(client, <ChatThreadScreen conversationId="dm" jumpTo={{ messageId: "gone" }} testID="t" />));
    await waitFor(() => expect(screen.getByText("That message isn't here any more")).toBeTruthy());
  });
});

describe("ChatSearchScreen", () => {
  it("finds messages across conversations with the match highlighted and transcripts marked, and opens one", async () => {
    const client = memory([
      { id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "a", senderId: SAM, body: "the habit tracker works" }] },
      {
        id: "dm2",
        members: [{ userId: ME }, { userId: LEE }],
        messages: [{ id: "v", senderId: LEE, body: "", attachments: [{ kind: "voice", transcript: "my habit this week" }] }],
      },
    ]);
    const onOpen = vi.fn();
    render(wrap(client, <ChatSearchScreen onOpen={onOpen} debounceMs={0} testID="s" />));
    expect(screen.getByTestId("s-hint")).toBeTruthy();
    fireEvent.change(screen.getByTestId("s-field-input"), { target: { value: "habit" } });
    await waitFor(() => expect(screen.getByTestId("s-hit-a")).toBeTruthy());
    const hit = screen.getByTestId("s-hit-a");
    expect(hit.getAttribute("aria-label")).toMatch(/^Sam, in Sam, .*the habit tracker works$/);
    expect(within(hit).getByText("habit")).toBeTruthy();
    expect(screen.getByTestId("s-transcript-v")).toBeTruthy();
    expect(screen.getByTestId("s-hit-v").getAttribute("aria-label")).toContain("Transcript");
    fireEvent.click(hit);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ messageId: "a", conversationId: "dm", seq: 1 }));
  });

  it("searches one conversation, and says when nothing matches", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "a", senderId: SAM, body: "hello" }] }]);
    render(wrap(client, <ChatSearchScreen conversationId="dm" onOpen={vi.fn()} debounceMs={0} testID="s" />));
    expect((screen.getByTestId("s-field-input") as HTMLInputElement).placeholder).toBe("Search this conversation");
    fireEvent.change(screen.getByTestId("s-field-input"), { target: { value: "zebra" } });
    await waitFor(() => expect(screen.getByTestId("s-empty")).toBeTruthy());
    expect(called(client, "search").at(-1)!.args).toEqual(["zebra", "dm"]);
  });
});

describe("ChatBroadcastSheet", () => {
  it("sends one message into each conversation picked", async () => {
    const client = memory([
      { id: "dm1", members: [{ userId: ME }, { userId: SAM }] },
      { id: "dm2", members: [{ userId: ME }, { userId: LEE }] },
      { id: "dm3", members: [{ userId: ME }, { userId: "44444444-4444-4444-8444-444444444444" }], canPost: false },
    ]);
    const onSent = vi.fn();
    const onOpenChange = vi.fn();
    render(wrap(client, <ChatBroadcastSheet open onOpenChange={onOpenChange} kind="direct" onSent={onSent} testID="b" />));
    await waitFor(() => expect(screen.getByTestId("b-row-dm1")).toBeTruthy());
    expect(screen.getByTestId("b-send").getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByTestId("b-text"), { target: { value: "Group call moved to 6" } });
    fireEvent.click(screen.getByTestId("b-all"));
    expect(screen.getByTestId("b-row-dm1").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("b-count").textContent).toBe("3 conversations");
    fireEvent.click(screen.getByTestId("b-send"));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2, 3));
    expect(called(client, "broadcast")[0]!.args.slice(0, 1)).toEqual([expect.arrayContaining(["dm1", "dm2", "dm3"])]);
    expect(called(client, "broadcast")[0]!.args[2]).toBe("Group call moved to 6");
    await waitFor(() => expect(screen.getByText("Sent to 2 of 3. You can't post in the others.")).toBeTruthy());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("filters the list by name", async () => {
    const client = memory([
      { id: "dm1", members: [{ userId: ME }, { userId: SAM }] },
      { id: "dm2", members: [{ userId: ME }, { userId: LEE }] },
    ]);
    render(wrap(client, <ChatBroadcastSheet open onOpenChange={vi.fn()} testID="b" />));
    await waitFor(() => expect(screen.getByTestId("b-row-dm2")).toBeTruthy());
    fireEvent.change(screen.getByTestId("b-filter-input"), { target: { value: "sa" } });
    expect(screen.queryByTestId("b-row-dm2")).toBeNull();
    fireEvent.click(screen.getByTestId("b-row-dm1"));
    expect(screen.getByTestId("b-count").textContent).toBe("1 conversation");
  });
});

describe("ChatAvailabilityScreen", () => {
  it("loads what's saved, and saves an away message with working hours", async () => {
    const client = memory([], { availability: { [ME]: { awayMessage: "Back soon", timeZone: "Europe/London" } } });
    const onSaved = vi.fn();
    render(wrap(client, <ChatAvailabilityScreen onSaved={onSaved} testID="a" />));
    await waitFor(() => expect((screen.getByTestId("a-message") as HTMLTextAreaElement).value).toBe("Back soon"));
    fireEvent.click(screen.getByTestId("a-hours-on"));
    await waitFor(() => expect(screen.getByTestId("a-day-mon")).toBeTruthy());
    // Mondays off.
    fireEvent.click(within(screen.getByTestId("a-day-mon")).getByRole("switch"));
    fireEvent.click(screen.getByTestId("a-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = called(client, "setAvailability")[0]!.args[0] as { awayMessage: string; timeZone: string; hours: Record<string, unknown> };
    expect(saved.awayMessage).toBe("Back soon");
    expect(saved.timeZone).toBe("Europe/London");
    expect(Object.keys(saved.hours)).toEqual(["tue", "wed", "thu", "fri"]);
  });

  it("clears the away message with I'm back", async () => {
    const client = memory([], { availability: { [ME]: { awayMessage: "Away", timeZone: "UTC" } } });
    render(wrap(client, <ChatAvailabilityScreen testID="a" />));
    await waitFor(() => expect(screen.getByTestId("a-back")).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByTestId("a-back"));
    });
    fireEvent.click(screen.getByTestId("a-save"));
    await waitFor(() => expect(called(client, "setAvailability")[0]!.args[0]).toMatchObject({ awayMessage: null, awayUntil: null, hours: null }));
  });
});

describe("simulator check leftovers", () => {
  const cohort = (closed: boolean, messages: MemoryConversationSeed["messages"] = []): MemoryConversationSeed => ({
    id: "cohort",
    kind: "cohort",
    members: [{ userId: ME, role: "member" }, { userId: SAM }, { userId: LEE }],
    topics: [{ topic: "week-1", title: "Week 1", closed }],
    messages,
  });

  it("says a closed topic is closed when it has no messages, instead of inviting a hello", async () => {
    const client = memory([cohort(true)]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    fireEvent.click(await screen.findByTestId("t-topics-week-1"));
    await waitFor(() => expect(screen.getByTestId("t-empty").textContent).toContain("This topic is closed."));
    expect(screen.getByTestId("t-empty").textContent).not.toContain("Say hello below.");
  });

  it("still invites a hello in an open topic with no messages", async () => {
    const client = memory([cohort(false)]);
    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    fireEvent.click(await screen.findByTestId("t-topics-week-1"));
    await waitFor(() => expect(screen.getByTestId("t-empty").textContent).toContain("Say hello below."));
  });

  it("pauses what this thread is playing when the screen loses focus, and nothing of another's", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }], messages: [{ id: "m1", senderId: SAM, body: "", attachments: [{ id: "att-1", kind: "voice", path: "dm/x/a.m4a" }] }] }]);
    const view = render(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    await screen.findByTestId("t-message-m1");
    const other = vi.fn();
    claimPlayback("elsewhere", other);
    view.rerender(wrap(client, <ChatThreadScreen conversationId="dm" focused={false} testID="t" />));
    expect(other).not.toHaveBeenCalled();

    view.rerender(wrap(client, <ChatThreadScreen conversationId="dm" testID="t" />));
    const mine = vi.fn();
    claimPlayback("att-1", mine);
    view.rerender(wrap(client, <ChatThreadScreen conversationId="dm" focused={false} testID="t" />));
    expect(mine).toHaveBeenCalledTimes(1);
    expect(activePlaybackId()).toBeNull();
  });

  it("names the message in each scheduled row's Cancel, so two at the same time differ", async () => {
    const client = memory([{ id: "dm", members: [{ userId: ME }, { userId: SAM }] }]);
    const at = new Date(Date.now() + 3600_000);
    await client.schedule({ conversationId: "dm", clientId: "c1", body: "first one", sendAt: at });
    await client.schedule({ conversationId: "dm", clientId: "c2", body: "second one", sendAt: at });
    render(wrap(client, <ChatScheduledList conversationId="dm" testID="l" />));
    const cancels = await screen.findAllByText("Cancel");
    const labels = cancels.map((c) => c.closest("button")!.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(2);
    expect(labels.some((l) => l?.startsWith("Cancel, first one, Scheduled for"))).toBe(true);
    expect(labels.some((l) => l?.startsWith("Cancel, second one, Scheduled for"))).toBe(true);
  });

  it("sizes the schedule and topic sheets to their content", async () => {
    const client = memory([{ ...cohort(false), members: [{ userId: ME, role: "owner" }, { userId: SAM }, { userId: LEE }] }]);
    render(wrap(client, <ChatScheduleSheet open onOpenChange={vi.fn()} onSchedule={vi.fn()} testID="s" />));
    const schedule = (await screen.findByTestId("s-pick-0")).closest("[role=dialog]")!;
    expect(schedule.getAttribute("data-presentation-style")).toBeNull();
    expect(schedule.getAttribute("data-transparent")).toBe("true");
    cleanup();

    render(wrap(client, <ChatThreadScreen conversationId="cohort" testID="t" />));
    fireEvent.click(await screen.findByTestId("t-topics-menu"));
    const topics = (await screen.findByTestId("t-topics-new")).closest("[role=dialog]")!;
    expect(topics.getAttribute("data-transparent")).toBe("true");
  });
});

describe("scrollToShow", () => {
  it("brings a chip past either edge into view, and leaves one in view alone", () => {
    expect(scrollToShow({ x: 400, width: 80 }, { offset: 0, width: 300 })).toBe(400 + 80 + 8 - 300);
    expect(scrollToShow({ x: 20, width: 60 }, { offset: 100, width: 300 })).toBe(12);
    expect(scrollToShow({ x: 120, width: 60 }, { offset: 100, width: 300 })).toBeNull();
    expect(scrollToShow({ x: 120, width: 60 }, { offset: 0, width: 0 })).toBeNull();
  });
});
