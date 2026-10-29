// Types and a pure adapter: no SDK, no React, so the root entry can carry them.
import type { AiOutcome, AiResult } from "./types";

/**
 * What a run streams to its client, named after the AG-UI protocol's events (`@ag-ui/core`), so
 * a client that speaks AG-UI can read Genesis runs and Genesis can take the dependency later
 * without renaming anything. Only the text events are sent today; the tool, state and interrupt
 * events are the contract the first agent runs will use.
 *
 * Genesis's own fields: `RUN_FINISHED` and `RUN_ERROR` carry the call's {@link AiResult}, and
 * `RUN_ERROR`'s `code` is its outcome. A run paused for a person's approval is AG-UI's `CUSTOM`
 * event named `genesis.interrupt` (AG-UI 1.0 has no interrupt event of its own yet).
 */
export type RunEvent =
  | { type: "RUN_STARTED"; threadId: string; runId: string }
  | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string; parentMessageId?: string | undefined }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string }
  | { type: "TOOL_CALL_RESULT"; messageId: string; toolCallId: string; content: string }
  | { type: "STATE_DELTA"; delta: readonly JsonPatchOperation[] }
  | { type: "CUSTOM"; name: "genesis.interrupt"; value: { runId: string; reason: string; approvalId?: string | undefined } }
  | { type: "RUN_FINISHED"; threadId: string; runId: string; result: AiResult<{ text: string }> }
  | { type: "RUN_ERROR"; message: string; code: Exclude<AiOutcome, "ok">; result: AiResult<{ text: string }> };

/** One JSON Patch (RFC 6902) operation, as AG-UI's `STATE_DELTA` carries them. */
export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string | undefined;
}

/** The names of {@link RunEvent}, in the order a text run sends them. */
export const RUN_EVENT_TYPES = [
  "RUN_STARTED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "STATE_DELTA",
  "CUSTOM",
  "RUN_FINISHED",
  "RUN_ERROR",
] as const satisfies readonly RunEvent["type"][];

/** What `createAiHandler` streams with `stream: true`: text as it arrives, then the result. */
export type TextStreamEvent = { type: "text"; text: string } | { type: "done"; result: AiResult<{ text: string }> };

/**
 * Turns the text stream's events into {@link RunEvent}s, one stream at a time: the first text
 * opens the run and the message, `done` closes them. `threadId` defaults to the run's id (a run
 * outside a conversation is its own thread).
 */
export function textStreamToRunEvents(ids: { runId: string; threadId?: string | undefined; messageId?: string | undefined }): (event: TextStreamEvent) => RunEvent[] {
  const runId = ids.runId;
  const threadId = ids.threadId ?? runId;
  const messageId = ids.messageId ?? `${runId}:0`;
  let started = false;
  let open = false;
  return (event) => {
    const out: RunEvent[] = [];
    if (!started) {
      started = true;
      out.push({ type: "RUN_STARTED", threadId, runId });
    }
    if (event.type === "text") {
      if (!open) {
        open = true;
        out.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
      }
      out.push({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: event.text });
      return out;
    }
    if (open) {
      open = false;
      out.push({ type: "TEXT_MESSAGE_END", messageId });
    }
    const { result } = event;
    out.push(result.ok ? { type: "RUN_FINISHED", threadId, runId, result } : { type: "RUN_ERROR", message: result.message, code: result.outcome, result });
    return out;
  };
}
