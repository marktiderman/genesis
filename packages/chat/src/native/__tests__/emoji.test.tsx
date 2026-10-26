// @vitest-environment happy-dom
// @feat:chat
/// <reference types="vite/client" />
import pickerSource from "../emoji-picker.tsx?raw";
import dataSource from "../emoji-data.ts?raw";
import emojiSource from "../emoji.ts?raw";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../core/types";
import { ChatComposer } from "../composer";
import { clearDrafts, memoryDraftStorage } from "../composer-state";
import { ChatNativeProvider } from "../context";
import { ChatEmojiPicker } from "../emoji-picker";
import { EMOJI_CATEGORIES, emojiEntry, emojiInCategory, insertAtSelection, loadRecentEmoji, pushRecentEmoji, recentEmojiKey, RECENT_EMOJI_MAX, saveRecentEmoji, searchEmoji } from "../emoji";
import { QUICK_REACTIONS } from "../actions";
import { MessageActionsSheet } from "../message-actions-sheet";
import { useChatComposer } from "../use-composer";

// The grids' FlatList props, as the picker gave them.
const lists = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("react-native", async (original) => {
  const rn = await original<Record<string, unknown> & { FlatList: (p: Record<string, unknown>) => unknown }>();
  return {
    ...rn,
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    FlatList: (props: Record<string, unknown>) => {
      lists.push(props);
      return rn.FlatList(props);
    },
  };
});

afterEach(cleanup);

describe("the bundled emoji", () => {
  it("ship in the app: nothing in the picker or its data fetches or names a URL", () => {
    for (const src of [pickerSource, emojiSource, dataSource.split("\n").slice(9).join("\n")]) {
      expect(src).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/\bfetch\(|emojibaseUrl|jsdelivr|frimousse/);
    }
  });

  it("are every category's base emoji, kept modest", () => {
    const all = EMOJI_CATEGORIES.flatMap((c) => emojiInCategory(c.id));
    expect(all.length).toBeGreaterThan(1500);
    expect(all.length).toBeLessThan(2200);
    expect(dataSource.length).toBeLessThan(100_000);
    expect(new Set(all.map((e) => e.emoji)).size).toBe(all.length);
    expect(emojiInCategory("smileys")[0]).toMatchObject({ emoji: "😀", label: "grinning face" });
    // No skin-tone variants: those are the base emoji's, chosen elsewhere.
    expect(all.some((e) => /\u{1F3FB}|\u{1F3FF}/u.test(e.emoji))).toBe(false);
  });

  it("are found by words of their label or tags", () => {
    expect(searchEmoji("thumbs up")[0]?.emoji).toBe("👍");
    expect(searchEmoji("gri").map((e) => e.emoji)).toContain("😀");
    expect(searchEmoji("red heart").map((e) => e.emoji)).toContain("❤️");
    expect(searchEmoji("   ")).toEqual([]);
    expect(searchEmoji("zzzqqq")).toEqual([]);
    expect(emojiEntry("👍").label).toBe("thumbs up");
  });

  it("are written as keyboards type them, so a picked reaction counts with the same quick one", () => {
    for (const quick of QUICK_REACTIONS) expect(emojiEntry(quick).label, quick).not.toBe(quick);
    const all = EMOJI_CATEGORIES.flatMap((c) => emojiInCategory(c.id));
    expect(all.some((e) => /\p{Emoji_Presentation}\uFE0F/u.test(e.emoji))).toBe(false);
    expect(all.map((e) => e.emoji)).toContain("❤️");
  });
});

describe("recent emoji", () => {
  it("put the newest first, once, and keep at most the limit", () => {
    expect(pushRecentEmoji(["😀", "👍"], "👍")).toEqual(["👍", "😀"]);
    const many = Array.from({ length: RECENT_EMOJI_MAX }, (_, i) => String(i));
    expect(pushRecentEmoji(many, "x")).toHaveLength(RECENT_EMOJI_MAX);
    expect(pushRecentEmoji(many, "x")[0]).toBe("x");
  });

  it("are kept per person with their drafts, so signing out clears them", async () => {
    const storage = memoryDraftStorage();
    await saveRecentEmoji(storage, "u1", ["🎉"]);
    await saveRecentEmoji(storage, "u2", ["🙂"]);
    expect(await loadRecentEmoji(storage, "u1")).toEqual(["🎉"]);
    await clearDrafts(storage, "u1");
    expect(await storage.getItem(recentEmojiKey("u1"))).toBeNull();
    expect(await loadRecentEmoji(storage, "u2")).toEqual(["🙂"]);
  });

  it("survive a corrupt entry as none", async () => {
    const storage = memoryDraftStorage();
    await storage.setItem(recentEmojiKey("u1"), "{not json");
    expect(await loadRecentEmoji(storage, "u1")).toEqual([]);
  });
});

describe("insertAtSelection", () => {
  it("types at the cursor, over a selection, or at the end", () => {
    expect(insertAtSelection("hello world", { start: 5, end: 5 }, "🙂")).toEqual({ text: "hello🙂 world", cursor: 7 });
    expect(insertAtSelection("hello world", { start: 6, end: 11 }, "🌍")).toEqual({ text: "hello 🌍", cursor: 8 });
    expect(insertAtSelection("hi", null, "👋")).toEqual({ text: "hi👋", cursor: 4 });
    expect(insertAtSelection("hi", { start: 40, end: 50 }, "!")).toEqual({ text: "hi!", cursor: 3 });
  });
});

const ME = "u1";
function textMessage(): ChatMessage {
  return {
    id: "m1", conversationId: "c1", seq: 1, clientId: "c", senderId: "u2", senderRole: "member", kind: "text", body: "hi",
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: "2026-10-25T10:00:00Z", editedAt: null, deletedAt: null, attachments: [], reactions: [],
  } as ChatMessage;
}

describe("the long-press sheet's +", () => {
  const context = { me: ME, role: "member" as const, canPost: true, pinned: false, canPin: false, canCopy: false };

  it("opens every emoji, searchable, and reacts with the one picked", async () => {
    const onReact = vi.fn();
    const onClose = vi.fn();
    const drafts = memoryDraftStorage();
    render(
      <ChatNativeProvider modules={{ drafts }}>
        <MessageActionsSheet message={textMessage()} context={context} onClose={onClose} onReact={onReact} onAction={vi.fn()} testID="acts" />
      </ChatNativeProvider>,
    );
    const more = await screen.findByTestId("acts-react-more");
    expect(more.getAttribute("aria-label")).toBe("More reactions");
    fireEvent.click(more);
    expect(screen.getByTestId("acts-picker")).toBeTruthy();
    // Categories are tabs, each named for screen readers.
    expect(screen.getByTestId("acts-picker-tab-food").getAttribute("aria-label")).toBe("Food and drink");
    fireEvent.change(screen.getByTestId("acts-picker-search").querySelector("input")!, { target: { value: "party popper" } });
    const party = await screen.findByTestId("acts-picker-emoji-🎉");
    expect(party.getAttribute("aria-label")).toBe("party popper");
    fireEvent.click(party);
    expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "🎉", true);
    expect(onClose).toHaveBeenCalled();
    // Kept as a recent one for this person.
    await waitFor(async () => expect(await loadRecentEmoji(drafts, ME)).toEqual(["🎉"]));
  });

  it("shows the person's recent emoji first, under Recent", async () => {
    const drafts = memoryDraftStorage();
    await saveRecentEmoji(drafts, "u-recent", ["🦄"]);
    render(
      <ChatNativeProvider modules={{ drafts }}>
        <MessageActionsSheet message={textMessage()} context={{ ...context, me: "u-recent" }} onClose={vi.fn()} onReact={vi.fn()} onAction={vi.fn()} testID="acts" />
      </ChatNativeProvider>,
    );
    fireEvent.click(await screen.findByTestId("acts-react-more"));
    await screen.findByTestId("acts-picker-tab-recent");
    expect(screen.getByTestId("acts-picker-tab-recent").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("acts-picker-emoji-🦄")).toBeTruthy();
  });
});

describe("the long-press sheet's caption", () => {
  const context = { me: "u1", role: "member" as const, canPost: true, pinned: false, canPin: false, canCopy: false };
  it("has room under the sheet's top edge, and names an app card by its kind's title", async () => {
    const message = { ...textMessage(), body: "", attachments: [{ id: "a1", kind: "check_in", ref: {} }] } as unknown as ChatMessage;
    render(
      <ChatNativeProvider>
        <MessageActionsSheet message={message} context={context} onClose={vi.fn()} onReact={vi.fn()} onAction={vi.fn()} attachmentKinds={{ check_in: { title: () => "Check-in" } }} testID="acts" />
      </ChatNativeProvider>,
    );
    const caption = await screen.findByTestId("acts-caption");
    expect(caption.textContent).toBe("Check-in");
    const body = JSON.parse(caption.parentElement!.getAttribute("data-style")!) as { paddingTop?: number };
    expect(body.paddingTop).toBeGreaterThanOrEqual(16);
  });
});

function ComposerHarness() {
  const composer = useChatComposer("c1", null, ME);
  return <ChatComposer composer={composer} canPost disabledReason={null} role="member" onSend={vi.fn()} userId="u-composer" testID="cmp" />;
}

describe("the composer's emoji button", () => {
  it("opens the picker, which types at the cursor", async () => {
    render(
      <ChatNativeProvider>
        <ComposerHarness />
      </ChatNativeProvider>,
    );
    const input = screen.getByTestId("cmp-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "see you" } });
    const button = screen.getByTestId("cmp-emoji");
    expect(button.getAttribute("aria-label")).toBe("Add emoji");
    await act(async () => fireEvent.click(button));
    fireEvent.click(await screen.findByTestId("cmp-emoji-sheet-picker-emoji-😀"));
    await waitFor(() => expect(input.value).toBe("see you😀"));
    fireEvent.click(screen.getByTestId("cmp-emoji-sheet-done"));
    await waitFor(() => expect(screen.queryByTestId("cmp-emoji-sheet-picker")).toBeNull());
  });
});

describe("the picker's grid", () => {
  it("lays out rows by row index (FlatList with numColumns asks per row), so every row scrolls into place", () => {
    lists.length = 0;
    render(
      <ChatNativeProvider>
        <ChatEmojiPicker onSelect={vi.fn()} testID="pk" />
      </ChatNativeProvider>,
    );
    const grid = lists.find((p) => p.testID === "pk-grid")!;
    const columns = grid.numColumns as number;
    expect(columns).toBe(8);
    const layout = grid.getItemLayout as (d: unknown, i: number) => { length: number; offset: number };
    expect(layout(null, 5)).toEqual({ length: 44, offset: 5 * 44, index: 5 });
    const rows = Math.ceil((grid.data as unknown[]).length / columns);
    expect(layout(null, rows - 1).offset).toBe((rows - 1) * 44);
  });

  it("keeps an emoji picked while the stored recents were still loading", async () => {
    const drafts = memoryDraftStorage();
    await saveRecentEmoji(drafts, "u-race", ["🍕", "🎸"]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Read when asked, answered late: as AsyncStorage does with a write queued behind the read.
    const slow = {
      ...drafts,
      getItem: async (k: string) => {
        const value = await drafts.getItem(k);
        await gate;
        return value;
      },
    };
    render(
      <ChatNativeProvider modules={{ drafts: slow }}>
        <ChatEmojiPicker onSelect={vi.fn()} userId="u-race" testID="pk" />
      </ChatNativeProvider>,
    );
    fireEvent.click(screen.getByTestId("pk-emoji-😀"));
    await act(async () => release());
    await waitFor(async () => expect(await loadRecentEmoji(drafts, "u-race")).toEqual(["😀", "🍕", "🎸"]));
  });
});

describe("the composer's emoji button, picked twice quickly", () => {
  it("types both", async () => {
    render(
      <ChatNativeProvider modules={{ drafts: memoryDraftStorage() }}>
        <ComposerHarness />
      </ChatNativeProvider>,
    );
    await act(async () => fireEvent.click(screen.getByTestId("cmp-emoji")));
    const smile = await screen.findByTestId("cmp-emoji-sheet-picker-emoji-😀");
    act(() => {
      fireEvent.click(smile);
      fireEvent.click(smile);
    });
    await waitFor(() => expect((screen.getByTestId("cmp-input") as HTMLInputElement).value).toBe("😀😀"));
  });
});
