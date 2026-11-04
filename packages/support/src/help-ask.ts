/**
 * Asking the help center's AI, for the web and the phone: keep the question, run the task on the
 * app's server (`askAi`), keep the answer only if it cites the tenant's published articles, and end
 * it as helped or handed to a person. Anything short of a cited answer ends at a person, never at a
 * dead end. Needs React only.
 */
import { useCallback, useRef, useState } from "react";
import type { SupportClient } from "./client";
import type { FeedbackContext } from "./record";

/** What the AI task returned: genesis-ai's result, as `useAiTask(HELP_ANSWER_TASK).run` gives it. */
export type HelpAiResult =
  | { ok: true; output: { answer: string; citations: readonly string[]; confident: boolean } }
  | { ok: false; outcome?: string; message?: string; safety?: unknown };

export type HelpAskState =
  | { phase: "idle" }
  | { phase: "asking"; question: string }
  /** A cited answer. */
  | { phase: "answered"; question: string; questionId: string; answer: string; articleIds: readonly string[]; helped: boolean }
  /** No cited answer. `message`: what a safety route or refusal said to tell the person, if anything. */
  | { phase: "none"; question: string; questionId: string | null; message: string | null };

export interface UseHelpAsk {
  state: HelpAskState;
  ask: (question: string) => Promise<void>;
  /** The answer helped: this is what's counted as a resolution. */
  helped: () => Promise<void>;
  /** Opens a ticket with the question, and returns its id. */
  toPerson: () => Promise<string>;
  reset: () => void;
}

/** A safety route's message goes to the person as it is; other stops say nothing of their own. */
function safetyMessage(result: Extract<HelpAiResult, { ok: false }>): string | null {
  return result.outcome === "safety_routed" && typeof result.message === "string" ? result.message : null;
}

export function useHelpAsk({
  client,
  tenantId,
  askAi,
  context,
  onError,
}: {
  client: SupportClient;
  tenantId: string | null;
  askAi: ((questionId: string) => Promise<HelpAiResult>) | undefined;
  context: () => FeedbackContext;
  onError?: ((error: unknown) => void) | undefined;
}): UseHelpAsk {
  const [state, setState] = useState<HelpAskState>({ phase: "idle" });
  // Only the latest question's answer shows.
  const round = useRef(0);

  const ask = useCallback(
    async (question: string) => {
      const asked = question.trim();
      if (!asked) return;
      const mine = ++round.current;
      const settle = (next: HelpAskState) => {
        if (round.current === mine) setState(next);
      };
      settle({ phase: "asking", question: asked });
      let questionId: string | null = null;
      try {
        if (!client.askHelp || !client.recordHelpAnswer || !askAi) throw new Error("AI answers aren't set up.");
        questionId = await client.askHelp(asked, { tenantId });
        const result = await askAi(questionId);
        if (!result.ok) {
          settle({ phase: "none", question: asked, questionId, message: safetyMessage(result) });
          return;
        }
        const { answer, citations, confident } = result.output;
        // Not sure, or nothing cited: the database keeps it as no answer, and a person takes over.
        const kept = await client.recordHelpAnswer(questionId, confident ? answer : "", confident ? citations : []);
        settle(kept === "answered" ? { phase: "answered", question: asked, questionId, answer: answer.trim(), articleIds: citations, helped: false } : { phase: "none", question: asked, questionId, message: null });
      } catch (error) {
        onError?.(error);
        settle({ phase: "none", question: asked, questionId, message: null });
      }
    },
    [client, tenantId, askAi, onError],
  );

  const helped = useCallback(async () => {
    if (state.phase !== "answered" || !client.closeHelpQuestion) return;
    const { questionId } = state;
    setState({ ...state, helped: true });
    await client.closeHelpQuestion(questionId, "resolved").catch((error: unknown) => onError?.(error));
  }, [state, client, onError]);

  const toPerson = useCallback(async () => {
    if (state.phase !== "answered" && state.phase !== "none") throw new Error("Nothing was asked.");
    const { id } = await client.submit({ type: "question", message: state.question, context: context(), tenantId });
    if (state.questionId && client.closeHelpQuestion) await client.closeHelpQuestion(state.questionId, "handed_off", id).catch((error: unknown) => onError?.(error));
    return id;
  }, [state, client, tenantId, context, onError]);

  const reset = useCallback(() => {
    round.current++;
    setState({ phase: "idle" });
  }, []);

  return { state, ask, helped, toPerson, reset };
}
