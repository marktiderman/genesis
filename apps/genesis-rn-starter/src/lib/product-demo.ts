/**
 * The product demo (`features.productDemo`, off by default): @marktiderman/genesis-product's
 * native screens over sample data in memory. Nothing leaves the phone. A real app passes a
 * `ProductSource` over its own backend instead, and a vote queue kept in AsyncStorage
 * (`createVoteQueue({ source, store: storageVoteQueueStore(AsyncStorage) })`).
 */
import { createVoteQueue, memoryProductSource } from "@marktiderman/genesis-product/native";
import { copy } from "@/copy";

const t = copy.productDemo;

/** One source and one vote queue for the app's life, so votes survive leaving the screen. */
export const productDemoSource = memoryProductSource({
  ideas: [
    { id: "dark-mode", ...t.ideas.darkMode, votes: 12, voted: false, status: "planned" },
    { id: "calendar", ...t.ideas.calendar, votes: 7, voted: true, status: "open" },
    { id: "widgets", ...t.ideas.widgets, votes: 3, voted: false, status: "open" },
  ],
  roadmap: [
    { id: "search", ...t.roadmap.search, horizon: "now", votes: 9 },
    { id: "offline", ...t.roadmap.offline, horizon: "next", votes: 5 },
    { id: "sharing", ...t.roadmap.sharing, horizon: "later" },
  ],
});

export const productDemoVotes = createVoteQueue({ source: productDemoSource });
