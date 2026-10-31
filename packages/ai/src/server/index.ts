// @feat:ai-providers
// Server only: the pipeline holds keys and prompts. A browser bundle that reaches it fails loudly.
// A server runtime (Node, Bun, Deno) passes, including a test DOM such as jsdom running on Node.
const onServer =
  (typeof process !== "undefined" && Boolean(process.versions?.node)) || typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";
if (!onServer && typeof document !== "undefined") {
  throw new Error("@marktiderman/genesis-ai/server is server-only: call tasks from the browser with useAiTask.");
}
export { runTask, streamTask, type StreamOptions, type StreamResult } from "./run";
export { wrap, AiCallError, type WrapOptions } from "./wrap";
export { createAiHandler, type AiHandlerOptions } from "./handler";
export { memoryStore, type MemoryStore, type MemoryStoreOptions, type UsageRow } from "./memory-store";
export { otelSink, type TracerLike } from "./telemetry";
export { evaluate, type EvalCase, type EvalReport, type EvalTarget, type Scorer, type ScoreResult } from "./evaluate";
