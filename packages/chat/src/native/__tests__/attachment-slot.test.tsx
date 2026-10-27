// @vitest-environment happy-dom
// @feat:chat
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useLayoutEffect, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import type { ChatAttachment, ChatMessage } from "../../core/types";
import type { ChatAttachmentKind } from "../../react/index";
import { attachmentPreview, slotUrl, splitCardAttachments, type ChatAttachmentSlotProps } from "../attachment-cards";
import { chatNativeCopy } from "../copy";
import { inboxRow } from "../inbox-screen";
import { MessageBubble } from "../message-bubble";
import { transcriptIsLong } from "../media";
import { invertedRows, type ThreadRow } from "../rows";

// Text lays out to `layout.lines` lines when a test sets it (the shim lays nothing out).
const layout = vi.hoisted(() => ({ lines: null as number | null }));
vi.mock("react-native", async (original) => {
  const rn = await original<{ Text: (p: object) => ReactNode }>();
  function Text(props: { onTextLayout?: (e: { nativeEvent: { lines: unknown[] } }) => void }) {
    const { onTextLayout, ...rest } = props;
    useLayoutEffect(() => {
      if (onTextLayout && layout.lines !== null) onTextLayout({ nativeEvent: { lines: Array.from({ length: layout.lines }) } });
    }, [onTextLayout]);
    return createElement(rn.Text as never, rest);
  }
  return { ...rn, Text, useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  layout.lines = null;
});

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const fireA11y = (el: HTMLElement, name: string) => act(() => void el.dispatchEvent(new CustomEvent("accessibilityaction", { detail: name })));

function attachment(over: Partial<ChatAttachment>): ChatAttachment {
  return {
    id: "a1", messageId: "m1", position: 0, kind: "task", ref: {}, provider: "none", path: null, providerId: null, playbackId: null, url: null, status: "ready",
    name: null, mime: null, bytes: null, width: null, height: null, durationMs: null, waveform: null, posterPath: null, thumbhash: null,
    transcript: null, transcriptStatus: null, ...over,
  } as ChatAttachment;
}

function message(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1", conversationId: "conv", seq: 1, clientId: "cm1", senderId: SAM, senderRole: "member", kind: "text", body: "", mentions: [], replyToId: null,
    threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone", silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z",
    editedAt: null, deletedAt: null, attachments: [], reactions: [], moderation: null, ...over,
  } as unknown as ChatMessage;
}

function row(m: ChatMessage): Extract<ThreadRow, { type: "message" }> {
  return invertedRows([{ type: "message", message: m }], { me: ME, group: false }).find((r) => r.type === "message") as Extract<ThreadRow, { type: "message" }>;
}

/** A coaching app's task: a checkbox that ticks it, live state from the app (here a variable). */
function taskKind(state: { done: boolean }, toggle: () => void | Promise<unknown>): ChatAttachmentKind {
  return {
    label: "Task",
    title: (a) => String(a.ref.title ?? "Task"),
    subtitle: () => (state.done ? "Done" : "To do"),
    action: () => ({ label: state.done ? "Mark not done" : "Mark done", onPress: toggle }),
  };
}

function TaskCard({ attachment, mine, action, pending, error, testID }: ChatAttachmentSlotProps) {
  return (
    <View testID={`${testID}-task`}>
      <Pressable testID={`${testID}-check`} accessibilityRole="checkbox" accessibilityState={{ busy: pending }} disabled={pending || !action} onPress={action?.run} style={{ minHeight: 44, minWidth: 44 }}>
        <Text>{String(attachment.ref.title)}</Text>
      </Pressable>
      {mine ? <Text testID={`${testID}-mine`}>mine</Text> : null}
      {error ? <Text testID={`${testID}-slot-error`}>{error}</Text> : null}
    </View>
  );
}

describe("splitCardAttachments", () => {
  const kinds = { form: { title: () => "Form" } };
  const list = [{ kind: "image" }, { kind: "form" }, { kind: "task" }, { kind: "voice" }];
  it("puts registered kinds on cards, and with a slot every kind the package doesn't draw", () => {
    expect(splitCardAttachments(list, kinds).cards.map((a) => a.kind)).toEqual(["form"]);
    expect(splitCardAttachments(list, kinds, true).cards.map((a) => a.kind)).toEqual(["form", "task"]);
    expect(splitCardAttachments(list, undefined, true).rest.map((a) => a.kind)).toEqual(["image", "voice"]);
  });
  it("never treats an inherited key as a kind", () => {
    expect(splitCardAttachments([{ kind: "constructor" }], {}).cards).toEqual([]);
  });
});

describe("the attachment slot", () => {
  it("draws the app's kind with the web slot's props, and its kind's action", () => {
    const toggle = vi.fn();
    const task = attachment({ ref: { title: "Walk 20 minutes" }, url: "https://example.com/t" });
    const seen: ChatAttachmentSlotProps[] = [];
    const Slot = (p: ChatAttachmentSlotProps) => {
      seen.push(p);
      return <TaskCard {...p} />;
    };
    render(<MessageBubble row={row(message({ attachments: [task] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={{ task: taskKind({ done: false }, toggle) }} attachmentSlot={Slot} testID="b" />);
    expect(screen.getByTestId("b-card-0-task")).toBeTruthy();
    expect(screen.queryByTestId("b-card-0-action")).toBeNull();
    const p = seen[seen.length - 1]!;
    expect(p.attachment).toBe(task);
    expect(p.message.id).toBe("m1");
    expect(p.url).toBe("https://example.com/t");
    expect(p.mine).toBe(false);
    expect(p.kind?.label).toBe("Task");
    expect(p.action?.label).toBe("Mark done");
    expect(p.pending).toBe(false);
    expect(p.error).toBeNull();
    fireEvent.click(screen.getByTestId("b-card-0-check"));
    expect(toggle).toHaveBeenCalledTimes(1);
    // VoiceOver reaches the checkbox through the bubble's own action, with the same handler.
    const bubble = screen.getByTestId("b-bubble");
    expect(bubble.getAttribute("aria-label")).toContain("Walk 20 minutes");
    expect(bubble.getAttribute("data-a11y-actions")).toContain("card-0");
    fireA11y(bubble, "card-0");
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("shows pending while an async action runs, then an error when it rejects", async () => {
    let reject!: (e: Error) => void;
    const toggle = vi.fn(() => new Promise((_, r) => (reject = r)));
    const reporter = vi.fn();
    const restore = setErrorReporter(reporter);
    const task = attachment({ ref: { title: "Journal" } });
    render(<MessageBubble row={row(message({ attachments: [task] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={{ task: taskKind({ done: false }, toggle) }} attachmentSlot={TaskCard} testID="b" />);
    fireEvent.click(screen.getByTestId("b-card-0-check"));
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("true");
    // A second tap while it runs is ignored.
    fireEvent.click(screen.getByTestId("b-card-0-check"));
    fireA11y(screen.getByTestId("b-bubble"), "card-0");
    expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("offline")));
    expect(screen.getByTestId("b-card-0-slot-error").textContent).toBe(chatNativeCopy.cardActionFailed);
    // Reported through genesis-core's seam (the app's crash reporter), not only the console.
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }), { source: "chat:attachment-action" });
    restore();
    expect(screen.getByTestId("b-bubble").getAttribute("aria-label")).toContain(chatNativeCopy.cardActionFailed);
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("false");
  });

  it("gives a slot `run` for the app's other actions", async () => {
    const save = vi.fn(async () => undefined);
    const Slot = ({ run, pending, testID }: ChatAttachmentSlotProps) => (
      <Pressable testID={`${testID}-save`} accessibilityState={{ busy: pending }} onPress={() => run(save)}>
        <Text>Save</Text>
      </Pressable>
    );
    render(<MessageBubble row={row(message({ attachments: [attachment({ kind: "worksheet" })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentSlot={Slot} testID="b" />);
    await act(async () => void fireEvent.click(screen.getByTestId("b-card-0-save")));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("b-card-0-save").getAttribute("aria-busy")).toBe("false");
  });

  it("returns the fallback card for kinds it doesn't draw", () => {
    const Slot = (p: ChatAttachmentSlotProps) => (p.attachment.kind === "task" ? <TaskCard {...p} /> : p.fallback);
    const form = attachment({ id: "f1", kind: "form", ref: {} });
    const kinds = { form: { title: () => "Intake form", action: () => ({ label: "Fill it in", onPress: vi.fn() }) } };
    render(<MessageBubble row={row(message({ attachments: [form] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={Slot} testID="b" />);
    expect(screen.getByTestId("b-card-0-action")).toBeTruthy();
    expect(screen.getByTestId("b-card-0").textContent).toContain("Intake form");
  });

  it("shows the card when the slot throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Slot = (): never => {
      throw new Error("bad ref");
    };
    const kinds = { task: { title: () => "A task" } };
    render(<MessageBubble row={row(message({ attachments: [attachment({})] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={Slot} testID="b" />);
    expect(screen.getByTestId("b-card-0").textContent).toContain("A task");
  });

  it("is told `mine` on your own message", () => {
    render(<MessageBubble row={row(message({ senderId: ME, attachments: [attachment({ ref: { title: "x" } })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentSlot={TaskCard} testID="b" />);
    expect(screen.getByTestId("b-card-0-mine")).toBeTruthy();
  });

  it("without a slot keeps the card, and `null` hides only unregistered kinds", () => {
    const kinds = { task: { title: () => "A task" } };
    const list = [attachment({}), attachment({ id: "a2", kind: "lesson", name: "lesson.pdf" })];
    render(<MessageBubble row={row(message({ attachments: list }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} testID="b" />);
    expect(screen.getByTestId("b-card-0").textContent).toContain("A task");
    // An unregistered kind without a slot stays a file row, as before.
    expect(screen.getByTestId("b-file-0")).toBeTruthy();
    cleanup();
    render(<MessageBubble row={row(message({ attachments: list }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={null} testID="b" />);
    expect(screen.getByTestId("b-card-0").textContent).toContain("A task");
    expect(screen.queryByTestId("b-card-1")).toBeNull();
    expect(screen.queryByTestId("b-file-0")).toBeNull();
  });

  it("the default card's button is busy while an async action runs and is at least 44pt tall", async () => {
    let resolve!: () => void;
    const onPress = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const kinds = { form: { title: () => "Intake form", action: () => ({ label: "Fill it in", onPress }) } };
    render(<MessageBubble row={row(message({ attachments: [attachment({ kind: "form" })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} testID="b" />);
    const button = screen.getByTestId("b-card-0-action");
    expect(button.className).toContain("h-11");
    fireEvent.click(button);
    expect(screen.getByTestId("b-card-0-action").getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve());
    expect(screen.getByTestId("b-card-0-action").getAttribute("aria-busy")).toBe("false");
  });
});

describe("the attachment slot, after review", () => {
  it("tries the slot again once what it draws changes, after it threw", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Slot = (p: ChatAttachmentSlotProps) => {
      if (!p.kind?.label) throw new Error("data not loaded");
      return <TaskCard {...p} />;
    };
    const task = attachment({ ref: { title: "Walk" } });
    const m = message({ attachments: [task] });
    const bubble = (kinds: Record<string, ChatAttachmentKind>) => <MessageBubble row={row(m)} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={Slot} testID="b" />;
    const { rerender } = render(bubble({ task: { title: () => "Loading" } }));
    expect(screen.queryByTestId("b-card-0-task")).toBeNull();
    expect(screen.getByTestId("b-card-0").textContent).toContain("Loading");
    rerender(bubble({ task: taskKind({ done: false }, vi.fn()) }));
    expect(screen.getByTestId("b-card-0-task")).toBeTruthy();
  });

  it("draws nothing for a kind the slot returns null for, and leaves out a message with nothing else", () => {
    const Slot = (p: ChatAttachmentSlotProps) => (p.attachment.kind === "worksheet" ? <TaskCard {...p} /> : null);
    const kinds = { task: taskKind({ done: false }, vi.fn()) };
    render(<MessageBubble row={row(message({ attachments: [attachment({ ref: { title: "Walk" } })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={Slot} testID="b" />);
    expect(screen.queryByTestId("b-card-0")).toBeNull();
    expect(screen.getByTestId("b").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("b-bubble").getAttribute("data-a11y-actions") ?? "").not.toContain("card-0");
    cleanup();
    // With text it stays, and reads without the card.
    render(<MessageBubble row={row(message({ body: "for today", attachments: [attachment({ ref: { title: "Walk" } })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={Slot} testID="b" />);
    expect(screen.getByTestId("b").getAttribute("aria-hidden")).toBeNull();
    const label = screen.getByTestId("b-bubble").getAttribute("aria-label") ?? "";
    expect(label).toContain("for today");
    expect(label).not.toContain("Walk");
  });

  it("with `null`, leaves out a message that is only an unregistered kind", () => {
    render(<MessageBubble row={row(message({ attachments: [attachment({ kind: "poll" })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentSlot={null} testID="b" />);
    expect(screen.getByTestId("b").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("b-bubble").getAttribute("aria-label") ?? "").not.toContain("poll");
  });

  it("gives the slot only an http(s) url", () => {
    expect(slotUrl("javascript:alert(1)")).toBeNull();
    expect(slotUrl("file:///etc/passwd")).toBeNull();
    expect(slotUrl("myapp://x")).toBeNull();
    expect(slotUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(slotUrl("http://127.0.0.1:54321/a")).toBe("http://127.0.0.1:54321/a");
    const seen: (string | null)[] = [];
    const Slot = (p: ChatAttachmentSlotProps) => {
      seen.push(p.url);
      return null;
    };
    render(<MessageBubble row={row(message({ attachments: [attachment({ url: "javascript:alert(1)" })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentSlot={Slot} testID="b" />);
    expect(seen.every((u) => u === null)).toBe(true);
  });

  it("stops being busy when an action runs too long, and ignores what it settles to later", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let resolve!: () => void;
    const toggle = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const kinds = { task: taskKind({ done: false }, toggle) };
    render(<MessageBubble row={row(message({ attachments: [attachment({ ref: { title: "Walk" } })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={TaskCard} cardActionTimeoutMs={5000} testID="b" />);
    fireEvent.click(screen.getByTestId("b-card-0-check"));
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("true");
    await act(async () => void vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByTestId("b-card-0-slot-error").textContent).toBe(chatNativeCopy.cardActionTimedOut);
    await act(async () => resolve());
    expect(screen.getByTestId("b-card-0-slot-error").textContent).toBe(chatNativeCopy.cardActionTimedOut);
  });

  it("times out after 30 seconds by default", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const kinds = { task: taskKind({ done: false }, () => new Promise<void>(() => undefined)) };
    render(<MessageBubble row={row(message({ attachments: [attachment({ ref: { title: "Walk" } })] }))} me={ME} urls={{}} group={false} reducedMotion attachmentKinds={kinds} attachmentSlot={TaskCard} testID="b" />);
    fireEvent.click(screen.getByTestId("b-card-0-check"));
    await act(async () => void vi.advanceTimersByTime(29_999));
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("true");
    await act(async () => void vi.advanceTimersByTime(1));
    expect(screen.getByTestId("b-card-0-check").getAttribute("aria-busy")).toBe("false");
  });
});

describe("previews of an app kind", () => {
  const kinds = { task: { label: "Task", title: (a: ChatAttachment) => String(a.ref.title) } };
  it("a reply's quote names it by its label", () => {
    const quoted = message({ id: "q1", attachments: [attachment({ messageId: "q1", ref: { title: "Walk" } })] });
    const reply = message({ id: "m2", body: "done!", replyToId: "q1" });
    render(<MessageBubble row={row(reply)} me={ME} urls={{}} repliedTo={quoted} group={false} reducedMotion attachmentKinds={kinds} testID="b" />);
    expect(screen.getByTestId("b-quote").textContent).toContain("Task");
  });
  it("the inbox's last message reads as the label", () => {
    expect(attachmentPreview("", "task", kinds)).toBe("Task");
    const r = inboxRow(
      { id: "c1", kind: "direct", title: "Sam", lastMessage: { body: "", attachment: "task", senderId: SAM, kind: "text", deleted: false, createdAt: "2026-10-25T10:00:00Z" } } as never,
      { me: ME, copy: chatNativeCopy, person: () => undefined, kinds },
    );
    expect(r.preview).toBe("Task");
  });
});

describe("a voice note's transcript", () => {
  const voice = (over: Partial<ChatAttachment>) => attachment({ kind: "voice", provider: "storage", path: "v.m4a", durationMs: 4000, waveform: [10, 60], ...over });

  it("shows under the player and is part of the bubble's label", () => {
    render(<MessageBubble row={row(message({ attachments: [voice({ transcript: "Felt strong today.", transcriptStatus: "ready" })] }))} me={ME} urls={{ "v.m4a": "https://x/v" }} group={false} reducedMotion testID="b" />);
    expect(screen.getByTestId("b-voice-0-transcript-text").textContent).toBe("Felt strong today.");
    expect(screen.queryByTestId("b-voice-0-transcript-toggle")).toBeNull();
    expect(screen.getByTestId("b-bubble").getAttribute("aria-label")).toContain("Transcript: Felt strong today.");
  });

  it("folds a long one behind Show more", () => {
    const long = "word ".repeat(60).trim();
    expect(transcriptIsLong(long)).toBe(true);
    render(<MessageBubble row={row(message({ attachments: [voice({ transcript: long, transcriptStatus: "ready" })] }))} me={ME} urls={{}} group={false} reducedMotion testID="b" />);
    const toggle = screen.getByTestId("b-voice-0-transcript-toggle");
    expect(toggle.textContent).toBe(chatNativeCopy.showMore);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("b-voice-0-transcript-toggle").textContent).toBe(chatNativeCopy.showLess);
    expect(screen.getByTestId("b-voice-0-transcript-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  it("folds by the measured line count once laid out, not by length", () => {
    const longText = "word ".repeat(60).trim();
    layout.lines = 2;
    render(<MessageBubble row={row(message({ attachments: [voice({ transcript: longText, transcriptStatus: "ready" })] }))} me={ME} urls={{}} group={false} reducedMotion testID="b" />);
    expect(screen.queryByTestId("b-voice-0-transcript-toggle")).toBeNull();
    cleanup();
    layout.lines = 5;
    render(<MessageBubble row={row(message({ attachments: [voice({ transcript: "Short\nbut\non many lines", transcriptStatus: "ready" })] }))} me={ME} urls={{}} group={false} reducedMotion testID="b" />);
    expect(screen.getByTestId("b-voice-0-transcript-toggle").textContent).toBe(chatNativeCopy.showMore);
    expect(transcriptIsLong("x", 4)).toBe(true);
    expect(transcriptIsLong("x".repeat(500), 3)).toBe(false);
  });

  it("says Transcribing while it is made, and nothing when there is none", () => {
    render(<MessageBubble row={row(message({ attachments: [voice({ transcriptStatus: "pending" })] }))} me={ME} urls={{}} group={false} reducedMotion testID="b" />);
    expect(screen.getByTestId("b-voice-0-transcript").textContent).toBe(chatNativeCopy.transcribing);
    cleanup();
    render(<MessageBubble row={row(message({ attachments: [voice({ transcriptStatus: "failed" })] }))} me={ME} urls={{}} group={false} reducedMotion testID="b" />);
    expect(screen.queryByTestId("b-voice-0-transcript")).toBeNull();
  });
});
