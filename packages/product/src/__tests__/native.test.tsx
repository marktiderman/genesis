// @vitest-environment happy-dom
// @feat:product-roadmap @feat:product-insights
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { InboxPage } from "@marktiderman/genesis-ui-native/layouts";
import { describe, expect, it, vi } from "vitest";
import {
  IdeaBoardScreen,
  ProductWhatsNew,
  RoadmapScreen,
  VoteRefusedError,
  createProductWhatsNew,
  createVoteQueue,
  haptic,
  useIdeaBoard,
  useRoadmap,
  type IdeaBoard,
  type Roadmap,
  memoryProductSource,
  type HapticsLike,
  type ProductIdea,
  type ProductSource,
} from "../native";

const idea = (id: string, extra: Partial<ProductIdea> = {}): ProductIdea => ({ id, title: `Idea ${id}`, votes: 0, voted: false, status: "open", ...extra });

function haptics() {
  const fake = {
    impactAsync: vi.fn(async () => {}),
    selectionAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
    ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
    NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  };
  return fake as typeof fake & HapticsLike;
}

describe("haptic", () => {
  it("never throws or rejects, whatever the module does", async () => {
    const broken = { ...haptics(), impactAsync: () => Promise.reject(new Error("no engine")), selectionAsync: () => { throw new Error("sync"); } } as unknown as HapticsLike;
    expect(() => haptic(broken, "vote")).not.toThrow();
    expect(() => haptic(broken, "select")).not.toThrow();
    expect(() => haptic(undefined, "refused")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("IdeaBoardScreen", () => {
  it("shows votes on each row, votes at once with a haptic, and sends it through the queue", async () => {
    const source = memoryProductSource({ ideas: [idea("a", { votes: 2, status: "planned" }), idea("b", { votes: 5 })] });
    const vote = vi.spyOn(source, "vote");
    const h = haptics();
    render(<IdeaBoardScreen source={source} haptics={h} />);
    await screen.findByText("Idea a");
    expect(screen.getByText("2 votes · Planned")).toBeTruthy();
    fireEvent.click(screen.getByTestId("product-ideas-vote-a"));
    expect(await screen.findByText("3 votes · Planned · You voted")).toBeTruthy();
    expect(h.impactAsync).toHaveBeenCalledWith("light");
    await waitFor(() => expect(vote).toHaveBeenCalledWith("a"));
    expect(screen.getByTestId("product-ideas-vote-a").textContent).toBe("Voted");
  });

  it("keeps an offline vote on screen and sends it when the connection is back", async () => {
    const source = memoryProductSource({ ideas: [idea("a", { votes: 1 })] });
    let online = false;
    const realVote = source.vote;
    source.vote = vi.fn(async (id: string) => {
      if (!online) throw new Error("Network request failed");
      return realVote(id);
    });
    let reconnect: (() => void) | undefined;
    render(<IdeaBoardScreen source={source} onReconnect={(run) => ((reconnect = run), () => (reconnect = undefined))} />);
    await screen.findByText("Idea a");
    fireEvent.click(screen.getByTestId("product-ideas-vote-a"));
    expect(await screen.findByText("2 votes · Open · You voted")).toBeTruthy();
    await waitFor(() => expect(source.vote).toHaveBeenCalledTimes(1));
    // Still shown as voted while it waits.
    expect(screen.getByText("2 votes · Open · You voted")).toBeTruthy();
    online = true;
    await act(async () => {
      reconnect?.();
    });
    await waitFor(() => expect(source.vote).toHaveBeenCalledTimes(2));
    expect((await source.ideas())[0]).toMatchObject({ voted: true, votes: 2 });
    expect(screen.getByText("2 votes · Open · You voted")).toBeTruthy();
  });

  it("rolls a refused vote back, with an error haptic", async () => {
    const base = memoryProductSource({ ideas: [idea("a", { votes: 4 })] });
    const source: ProductSource = { ...base, vote: async () => Promise.reject(new VoteRefusedError()) };
    const h = haptics();
    render(<IdeaBoardScreen source={source} haptics={h} />);
    await screen.findByText("Idea a");
    fireEvent.click(screen.getByTestId("product-ideas-vote-a"));
    await waitFor(() => expect(h.notificationAsync).toHaveBeenCalledWith("error"));
    expect(await screen.findByText("4 votes · Open")).toBeTruthy();
    expect(screen.getByTestId("product-ideas-vote-a").textContent).toBe("Vote");
  });

  it("uses the queue it is given, so a vote saved before a relaunch shows and is sent", async () => {
    const source = memoryProductSource({ ideas: [idea("a")] });
    const vote = vi.spyOn(source, "vote");
    const queue = createVoteQueue({ source, store: { load: async () => [{ ideaId: "a", voted: true, base: false }], save: async () => {} } });
    render(<IdeaBoardScreen source={source} queue={queue} />);
    expect(await screen.findByText("1 vote · Open · You voted")).toBeTruthy();
    await waitFor(() => expect(vote).toHaveBeenCalledWith("a"));
  });

  it("shows the empty and error states", async () => {
    const { unmount } = render(<IdeaBoardScreen source={memoryProductSource()} />);
    expect(await screen.findByText("No ideas yet")).toBeTruthy();
    unmount();
    render(<IdeaBoardScreen source={{ ...memoryProductSource(), ideas: () => Promise.reject(new Error("offline")) }} />);
    expect(await screen.findByText("Couldn't load the ideas")).toBeTruthy();
  });
});

describe("RoadmapScreen", () => {
  const source = memoryProductSource({
    roadmap: [
      { id: "search", title: "Search", summary: "Find anything", horizon: "now", votes: 3 },
      { id: "export", title: "Export", horizon: "next" },
      { id: "offline", title: "Offline mode", horizon: "later" },
    ],
  });

  it("switches Now / Next / Later with the segmented control, with a selection haptic", async () => {
    const h = haptics();
    render(<RoadmapScreen source={source} haptics={h} />);
    expect(await screen.findByText("Search")).toBeTruthy();
    expect(screen.queryByText("Export")).toBeNull();
    fireEvent.click(screen.getByTestId("product-roadmap-horizon-option-next"));
    expect(await screen.findByText("Export")).toBeTruthy();
    expect(screen.queryByText("Search")).toBeNull();
    expect(h.selectionAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("product-roadmap-horizon-option-later"));
    expect(await screen.findByText("Offline mode")).toBeTruthy();
  });

  it("opens an item in a sheet, and closes it", async () => {
    render(<RoadmapScreen source={source} />);
    fireEvent.click(await screen.findByTestId("product-roadmap-item-search"));
    expect(await screen.findByTestId("product-roadmap-detail")).toBeTruthy();
    expect(screen.getByText("Now · 3 votes")).toBeTruthy();
    fireEvent.click(screen.getByTestId("product-roadmap-detail-close"));
    await waitFor(() => expect(screen.queryByTestId("product-roadmap-detail")).toBeNull());
  });
});

describe("ProductWhatsNew", () => {
  it("fetches the notes only when they are due, shows them once and remembers on close", async () => {
    const data = new Map([["genesis:product:whats-new", "1.4.0+embedded"]]);
    const storage = { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => void data.set(k, v) };
    const whatsNew = vi.fn(async () => [{ id: "n1", title: "Dark mode", body: "Easy on the eyes." }]);
    const store = createProductWhatsNew({ source: { whatsNew }, key: "1.4.0+u7", storage });
    const { unmount } = render(<ProductWhatsNew store={store} />);
    expect(await screen.findByText("Dark mode")).toBeTruthy();
    expect(whatsNew).toHaveBeenCalledWith("1.4.0+u7");
    fireEvent.click(screen.getByTestId("product-whats-new-done"));
    await waitFor(() => expect(screen.queryByText("Dark mode")).toBeNull());
    expect(JSON.parse(data.get("genesis:product:whats-new")!)).toEqual(["1.4.0+embedded", "1.4.0+u7"]);
    unmount();

    const next = createProductWhatsNew({ source: { whatsNew }, key: "1.4.0+u7", storage });
    render(<ProductWhatsNew store={next} />);
    await act(async () => {
      await next.load();
    });
    expect(screen.queryByTestId("product-whats-new")).toBeNull();
    expect(whatsNew).toHaveBeenCalledTimes(1);
  });
});

describe("review fixes", () => {
  it("an inline source (a new object each render) doesn't restart the board or read it again and again", async () => {
    const base = memoryProductSource({ ideas: [idea("a")] });
    const ideas = vi.fn(() => base.ideas());
    const { rerender } = render(<IdeaBoardScreen source={{ ...base, ideas }} />);
    await screen.findByText("Idea a");
    rerender(<IdeaBoardScreen source={{ ...base, ideas }} />);
    rerender(<IdeaBoardScreen source={{ ...base, ideas }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(ideas).toHaveBeenCalledTimes(1);
  });
});

describe("second review fixes", () => {
  it("a refresh that started before a vote went through never shows the old count", async () => {
    const base = memoryProductSource({ ideas: [idea("a", { votes: 2 })] });
    let stale: ((ideas: ProductIdea[]) => void) | null = null;
    let calls = 0;
    const source: ProductSource = {
      ...base,
      ideas: () => {
        calls++;
        // The second read (the refresh) is slow and answers with what the source had before the vote.
        if (calls === 2) return new Promise((r) => (stale = r));
        return base.ideas();
      },
    };
    let board!: IdeaBoard;
    function Harness() {
      board = useIdeaBoard({ source });
      return <InboxPage {...board} />;
    }
    render(<Harness />);
    await screen.findByText("2 votes · Open");
    const before = await base.ideas();
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = board.onRefresh!() as Promise<void>;
    });
    fireEvent.click(screen.getByTestId("product-ideas-vote-a"));
    await waitFor(async () => expect((await base.ideas())[0]!.votes).toBe(3));
    await act(async () => {
      stale!(before);
      await refreshing;
    });
    await waitFor(() => expect(screen.getByTestId("product-ideas-idea-a").textContent).toContain("3 votes"));
    expect(screen.getByTestId("product-ideas-idea-a").textContent).not.toContain("2 votes");
  });

  it("says a refusal out loud and tells the app, and a cast vote is announced on the row and the button", async () => {
    const announce = vi.fn();
    (AccessibilityInfo as unknown as { announceForAccessibility: unknown }).announceForAccessibility = announce;
    const base = memoryProductSource({ ideas: [idea("a", { title: "Dark mode", votes: 4 }), idea("b", { title: "Widgets", voted: true, votes: 1 })] });
    const onRefused = vi.fn();
    render(<IdeaBoardScreen source={{ ...base, vote: async () => Promise.reject(new VoteRefusedError()) }} onRefused={onRefused} />);
    const voted = await screen.findByTestId("product-ideas-vote-b");
    expect(voted.getAttribute("aria-selected")).toBe("true");
    expect(voted.getAttribute("aria-label")).toBe("Remove your vote for Widgets");
    expect(within(screen.getByTestId("product-ideas-idea-b")).getByText("1 vote · Open · You voted")).toBeTruthy();
    const button = screen.getByTestId("product-ideas-vote-a");
    expect(button.getAttribute("aria-selected")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Vote for Dark mode");
    fireEvent.click(button);
    await waitFor(() => expect(announce).toHaveBeenCalledWith("That vote didn't go through."));
    expect(onRefused).toHaveBeenCalledWith(["a"]);
  });

  it("Learn more in what's new closes the sheet (and remembers it) before opening the note", async () => {
    const storage = { getItem: async () => "[\"1+u1\"]", setItem: vi.fn(async () => {}) };
    const store = createProductWhatsNew({ source: { whatsNew: async () => [{ id: "n", title: "Dark mode", url: "/settings/appearance" }] }, key: "1+u2", storage });
    const onOpenNote = vi.fn();
    render(<ProductWhatsNew store={store} onOpenNote={onOpenNote} />);
    fireEvent.click(await screen.findByTestId("product-whats-new-open-n"));
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: "n" }));
    await waitFor(() => expect(screen.queryByTestId("product-whats-new")).toBeNull());
    expect(store.getState().status).toBe("hidden");
  });

  it("the roadmap's sheet shows the item as the source has it now, not as it was when opened", async () => {
    let summary = "First summary";
    const source = { roadmap: async () => [{ id: "search", title: "Search", summary, horizon: "now" as const }] };
    let roadmap!: Roadmap;
    function Harness() {
      roadmap = useRoadmap({ source });
      return <InboxPage {...roadmap.page} />;
    }
    render(<Harness />);
    await waitFor(() => expect(roadmap.page.items).toHaveLength(1));
    act(() => roadmap.page.items![0]!.onPress!());
    expect(roadmap.selected?.summary).toBe("First summary");
    summary = "Changed summary";
    await act(async () => {
      await roadmap.page.onRefresh!();
    });
    expect(roadmap.selected?.summary).toBe("Changed summary");
  });
});
