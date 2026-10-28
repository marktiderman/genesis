// @feat:ai-providers
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiResult } from "./types";

export interface UseAiTaskOptions {
  /** Where `createAiHandler` is mounted. Default `/api/ai`. */
  endpoint?: string | undefined;
  /** Headers for each call, such as `Authorization: Bearer <access token>` on native. */
  headers?: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
}

export interface AiTaskState<Out> {
  /** Runs the task with ids-only arguments; resolves with its result. A newer run replaces an older one. */
  run: (args: Record<string, unknown>) => Promise<AiResult<Out>>;
  /** The latest result, or null before the first run finishes. */
  result: AiResult<Out> | null;
  pending: boolean;
  reset: () => void;
}

const networkFailure = { ok: false, outcome: "unavailable", message: "Couldn't reach the AI service." } as const;

/**
 * Calls a server task by id through `createAiHandler`. The client sends ids, never content: the
 * task's `load` reads what the model sees, as the signed-in person.
 */
export function useAiTask<Out = { text: string }>(task: string, options: UseAiTaskOptions = {}): AiTaskState<Out> {
  const [result, setResult] = useState<AiResult<Out> | null>(null);
  const [pending, setPending] = useState(false);
  const latest = useRef<AbortController | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => () => latest.current?.abort(), []);

  const run = useCallback(
    async (args: Record<string, unknown>): Promise<AiResult<Out>> => {
      latest.current?.abort();
      const controller = new AbortController();
      latest.current = controller;
      setPending(true);
      const { endpoint = "/api/ai", headers, fetch = globalThis.fetch } = opts.current;
      let next: AiResult<Out>;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(await headers?.()) },
          body: JSON.stringify({ task, args }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as AiResult<Out> | null;
        next = body && typeof body === "object" && "ok" in body ? body : networkFailure;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        next = networkFailure;
      }
      if (latest.current === controller) {
        setResult(next);
        setPending(false);
      }
      return next;
    },
    [task],
  );

  const reset = useCallback(() => {
    latest.current?.abort();
    latest.current = null;
    setResult(null);
    setPending(false);
  }, []);

  return { run, result, pending, reset };
}

export interface AiStreamState {
  /** Streams the task with ids-only arguments; resolves with its result. A newer run replaces an older one. */
  run: (args: Record<string, unknown>) => Promise<AiResult<{ text: string }>>;
  /** The text so far. Cleared when a run ends `refused`: partial output before a refusal is discarded. */
  text: string;
  result: AiResult<{ text: string }> | null;
  pending: boolean;
  /** Stops the stream; the server closes the call's usage row. */
  stop: () => void;
}

/**
 * Streams a text task by id through `createAiHandler` (`stream: true`): text as it arrives, then
 * the result. A stop before the model (no consent, over budget) comes back as the result at once.
 */
export function useAiStream(task: string, options: UseAiTaskOptions = {}): AiStreamState {
  const [text, setText] = useState("");
  const [result, setResult] = useState<AiResult<{ text: string }> | null>(null);
  const [pending, setPending] = useState(false);
  const latest = useRef<AbortController | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => () => latest.current?.abort(), []);

  const run = useCallback(
    async (args: Record<string, unknown>): Promise<AiResult<{ text: string }>> => {
      latest.current?.abort();
      const controller = new AbortController();
      latest.current = controller;
      const mine = () => latest.current === controller;
      setText("");
      setResult(null);
      setPending(true);
      const { endpoint = "/api/ai", headers, fetch = globalThis.fetch } = opts.current;
      let final: AiResult<{ text: string }> = networkFailure;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(await headers?.()) },
          body: JSON.stringify({ task, args, stream: true }),
          signal: controller.signal,
        });
        if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
          const body = (await response.json().catch(() => null)) as AiResult<{ text: string }> | null;
          final = body && typeof body === "object" && "ok" in body ? body : networkFailure;
        } else {
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          let streamed = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let cut: number;
            while ((cut = buffer.indexOf("\n\n")) >= 0) {
              const line = buffer.slice(0, cut).replace(/^data: /, "");
              buffer = buffer.slice(cut + 2);
              const event = JSON.parse(line) as { type: "text"; text: string } | { type: "done"; result: AiResult<{ text: string }> };
              if (event.type === "text") {
                streamed += event.text;
                if (mine()) setText(streamed);
              } else final = event.result;
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
      }
      if (mine()) {
        if (!final.ok && final.outcome === "refused") setText("");
        setResult(final);
        setPending(false);
      }
      return final;
    },
    [task],
  );

  const stop = useCallback(() => {
    latest.current?.abort();
    setPending(false);
  }, []);

  return { run, text, result, pending, stop };
}
