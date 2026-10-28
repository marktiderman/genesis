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
