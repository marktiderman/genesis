import { useMutation, useQueryClient, type QueryClient, type MutationOptions } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { InvalidationKey } from "../provider/types";
import { isDataWriteError } from "../schema/write-outcome";

export const WRITE_FAILED = "That didn't work. Try again.";

export interface UseWriteOptions<A, R> {
  /** Keys made stale once the write succeeds (matched by prefix), or a function of its result. */
  invalidates?: InvalidationKey[] | ((result: R, args: A) => InvalidationKey[]);
  onSuccess?: (result: R, args: A) => void;
  /** The words shown for a failure. Default: a write error's own plain message. */
  messageOf?: (error: unknown) => string;
}

export interface UseWriteReturn<A, R> {
  /**
   * Runs the write. Resolves with its result; rejects with the error (also
   * shown in `error`). While one runs, another call returns the same promise.
   */
  run: (args: A) => Promise<R>;
  /** Runs the write and never rejects: resolves with the result, or undefined when it failed. */
  fire: (args: A) => Promise<R | undefined>;
  pending: boolean;
  /** Why the last run failed, in plain words; null after a success or `reset`. */
  error: string | null;
  reset: () => void;
}

/**
 * A one-off write that isn't a resource page's create, update or remove: a
 * database function, `createOrAdopt`, several writes in a row. It invalidates
 * what it made stale and reports failures in plain words.
 *
 * ```ts
 * const sendLesson = useWrite(
 *   (lessonId: string) => callRpc(supabase, "send_lesson", { lesson_id: lessonId }),
 *   { invalidates: [["tasks"], lessonKeys.all] },
 * );
 * <Button onClick={() => sendLesson.fire(id)} disabled={sendLesson.pending}>Send</Button>
 * {sendLesson.error && <InlineError>{sendLesson.error}</InlineError>}
 * ```
 */
export function useWrite<A = void, R = unknown>(
  write: (args: A) => Promise<R>,
  options: UseWriteOptions<A, R> = {},
): UseWriteReturn<A, R> {
  const queryClient = useQueryClient();
  const mutation = useMutation<R, unknown, A>(writeMutation(queryClient, write, options));
  const { mutateAsync } = mutation;
  // One write at a time: a second click while it runs gets the same promise, not a second write.
  const inFlight = useRef<Promise<R> | null>(null);
  const run = useCallback(
    (args: A) => {
      if (inFlight.current) return inFlight.current;
      const p = mutateAsync(args).finally(() => {
        if (inFlight.current === p) inFlight.current = null;
      });
      inFlight.current = p;
      return p;
    },
    [mutateAsync],
  );
  const fire = useCallback((args: A) => run(args).catch(() => undefined), [run]);
  const messageOf = options.messageOf ?? plainMessage;
  return {
    run,
    fire,
    pending: mutation.isPending,
    error: mutation.error === null ? null : messageOf(mutation.error),
    reset: mutation.reset,
  };
}

/** useWrite's mutation: run the write, then invalidate and call `onSuccess`. */
export function writeMutation<A, R>(
  queryClient: QueryClient,
  write: (args: A) => Promise<R>,
  options: UseWriteOptions<A, R>,
): MutationOptions<R, unknown, A> {
  return {
    mutationFn: write,
    onSuccess: async (result, args) => {
      // The write committed: a failing callback is logged, never reported as a failed write
      // (the person would make it again).
      try {
        const keys = typeof options.invalidates === "function" ? options.invalidates(result, args) : options.invalidates;
        await Promise.all((keys ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })));
        options.onSuccess?.(result, args);
      } catch (error) {
        console.error("[genesis-core] useWrite: a callback after the write failed:", error);
      }
    },
  };
}

function plainMessage(error: unknown): string {
  return isDataWriteError(error) && error.message ? error.message : WRITE_FAILED;
}
