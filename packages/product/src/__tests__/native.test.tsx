// @vitest-environment happy-dom
// @feat:product-roadmap @feat:product-insights
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  IdeaBoardScreen,
  ProductWhatsNew,
  RoadmapScreen,
  VoteRefusedError,
  createProductWhatsNew,
  createVoteQueue,
  haptic,
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
    expect(await screen.findByText("3 votes · Planned")).toBeTruthy();
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
    expect(await screen.findByText("2 votes · Open")).toBeTruthy();
    await waitFor(() => expect(source.vote).toHaveBeenCalledTimes(1));
    // Still shown as voted while it waits.
    expect(screen.getByText("2 votes · Open")).toBeTruthy();
    online = true;
    await act(async () => {
      reconnect?.();
    });
    await waitFor(() => expect(source.vote).toHaveBeenCalledTimes(2));
    expect((await source.ideas())[0]).toMatchObject({ voted: true, votes: 2 });
    expect(screen.getByText("2 votes · Open")).toBeTruthy();
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
    expect(await screen.findByText("1 vote · Open")).toBeTruthy();
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
    expect(data.get("genesis:product:whats-new")).toBe("1.4.0+u7");
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
