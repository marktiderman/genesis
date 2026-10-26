import type { ProductIdeaStatus } from "../app";

/** Every word the product screens show. Pass a part of it as `copy` to change or translate it. */
export const PRODUCT_COPY = {
  ideas: {
    title: "Ideas",
    vote: "Vote",
    voted: "Voted",
    removeVote: "Remove vote",
    votes: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
    statuses: { open: "Open", planned: "Planned", building: "Being built", shipped: "Shipped", declined: "Not planned" } satisfies Record<ProductIdeaStatus, string>,
    emptyTitle: "No ideas yet",
    emptyBody: "Ideas people suggest show up here, with their votes.",
    errorTitle: "Couldn't load the ideas",
    errorBody: "Check your connection, then pull to refresh.",
    refused: "That vote didn't go through.",
  },
  roadmap: {
    title: "Roadmap",
    now: "Now",
    next: "Next",
    later: "Later",
    emptyTitle: "Nothing here yet",
    emptyBody: "What's planned for this stage shows up here.",
    errorTitle: "Couldn't load the roadmap",
    errorBody: "Check your connection, then pull to refresh.",
    close: "Close",
  },
  whatsNew: { title: "What's new", done: "Got it", learnMore: "Learn more" },
};

export type ProductCopy = typeof PRODUCT_COPY;

/** The copy with the app's changes laid over, one level deep per section. */
export function mergeCopy(copy: { [K in keyof ProductCopy]?: Partial<ProductCopy[K]> } | undefined): ProductCopy {
  if (!copy) return PRODUCT_COPY;
  return {
    ideas: { ...PRODUCT_COPY.ideas, ...copy.ideas },
    roadmap: { ...PRODUCT_COPY.roadmap, ...copy.roadmap },
    whatsNew: { ...PRODUCT_COPY.whatsNew, ...copy.whatsNew },
  };
}

/** The `copy` option the screens take. */
export type ProductCopyInput = { [K in keyof ProductCopy]?: Partial<ProductCopy[K]> };
