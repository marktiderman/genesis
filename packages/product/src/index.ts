// @marktiderman/genesis-product: the product system's core, with no React and no I/O.
// The catalog is the feature registry (features.json); signals (ideas, feedback, bugs) come
// from a SignalSource. /node reads both from a repo and GitHub, and runs the CLI. The app side
// (ideas with votes, the roadmap, what's new) is ./app, behind a ProductSource; /native draws it.
export { SIGNAL_KINDS, memorySignals, type CatalogFeature, type Importance, type Signal, type SignalKind, type SignalSource } from "./model";
export { buildBoard, demand, renderBoard, type Board, type BoardItem, type RenderBoardOptions } from "./board";
export { answeredBy, diffRelease, renderRelease, type ReleaseChange, type RenderReleaseOptions } from "./release";
export {
  VoteRefusedError,
  createProductWhatsNew,
  createVoteQueue,
  isPermanentVoteError,
  memoryProductSource,
  memoryVoteQueueStore,
  roadmapFromBoard,
  storageVoteQueueStore,
  whatsNewKey,
  type MemoryProductSeed,
  type ProductIdea,
  type ProductIdeaStatus,
  type ProductSource,
  type ProductStorageLike,
  type ProductWhatsNew,
  type ProductWhatsNewOptions,
  type ProductWhatsNewState,
  type QueuedVote,
  type RoadmapItem,
  type VoteFlushResult,
  type VoteQueue,
  type VoteQueueOptions,
  type VoteQueueStore,
  type WhatsNewApplicationLike,
  type WhatsNewNote,
  type WhatsNewUpdatesLike,
} from "./app";
