/**
 * Asking the help center's AI, for the web and the phone. The person asks for an answer; the
 * question is kept (`askHelp`); the app's server runs the task and records what came of it
 * (`answerHelpQuestion`, from `/ai`), and says so here. Anything short of a cited answer ends at a
 * person, never at a dead end. Needs React only.
 */
import { useCallback, useRef, useState } from "react";
import type { SupportClient } from "./client";
import type { FeedbackContext } from "./record";

/** What `answerHelpQuestion` returns, as the app's endpoint hands it to `askAi`. */
export type HelpAnswerResponse =
  /** A cited answer, kept. */
  | { status: "answered"; answer: string; articleIds: readonly string[] }
  /** No cited answer. */
  | { status: "none" }
  /** The app's safety protocol took it: show its words (`response`), not an answer. */
  | { status: "safety"; response: string | null }
  /** The person hasn't agreed to share with the AI's vendor. */
  | { status: "needs_consent" };

export type HelpAskState =
  | { phase: "idle" }
  | { phase: "asking"; question: string }
  | { phase: "answered"; question: string; questionId: string; answer: string; articleIds: readonly string[]; helped: boolean }
  /** No answer. `safety`: the app's safety protocol took it, with its words if it gave any. */
  | { phase: "none"; question: string; questionId: string | null; safety: boolean; response: string | null; needsConsent: boolean };

export interface UseHelpAsk {
  state: HelpAskState;
  ask: (question: string) => Promise<void>;
  /** The answer helped: this is what's counted as a resolution. */
  helped: () => Promise<void>;
  /** Opens a ticket with the question, once, and returns its id. */
  toPerson: () => Promise<string>;
  reset: () => void;
}

export function useHelpAsk({
  client,
  tenantId,
  askAi,
  context,
  onError,
}: {
  client: SupportClient;
  tenantId: string | null | undefined;
  askAi: ((questionId: string) => Promise<HelpAnswerResponse>) | undefined;
  context: () => FeedbackContext | Promise<FeedbackContext>;
  onError?: ((error: unknown) => void) | undefined;
}): UseHelpAsk {
  const [state, setState] = useState<HelpAskState>({ phase: "idle" });
  // Only the latest question's answer shows.
  const round = useRef(0);
  // One ticket for one question, however many times the button is pressed.
  const handing = useRef<Promise<string> | null>(null);

  const ask = useCallback(
    async (question: string) => {
      const asked = question.trim();
      if (!asked) return;
      const mine = ++round.current;
      handing.current = null;
      const settle = (next: HelpAskState) => {
        if (round.current === mine) setState(next);
      };
      const none = (questionId: string | null, more: Partial<Extract<HelpAskState, { phase: "none" }>> = {}): HelpAskState => ({ phase: "none", question: asked, questionId, safety: false, response: null, needsConsent: false, ...more });
      settle({ phase: "asking", question: asked });
      let questionId: string | null = null;
      try {
        if (!client.askHelp || !askAi) throw new Error("AI answers aren't set up.");
        questionId = await client.askHelp(asked, tenantId === undefined ? {} : { tenantId });
        const result = await askAi(questionId);
        if (result?.status === "answered") settle({ phase: "answered", question: asked, questionId, answer: result.answer.trim(), articleIds: result.articleIds, helped: false });
        else if (result?.status === "safety") settle(none(questionId, { safety: true, response: result.response }));
        else if (result?.status === "needs_consent") settle(none(questionId, { needsConsent: true }));
        else settle(none(questionId));
      } catch (error) {
        onError?.(error);
        settle(none(questionId));
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

  const toPerson = useCallback(() => {
    if (state.phase !== "answered" && state.phase !== "none") return Promise.reject(new Error("Nothing was asked."));
    if (handing.current) return handing.current;
    const { question, questionId } = state;
    const work = (async () => {
      const { id } = await client.submit({ type: "question", message: question, context: await context(), ...(tenantId === undefined ? {} : { tenantId }) });
      if (questionId && client.closeHelpQuestion) await client.closeHelpQuestion(questionId, "handed_off", id).catch((error: unknown) => onError?.(error));
      return id;
    })();
    handing.current = work;
    // A failure can be tried again.
    work.catch(() => {
      handing.current = null;
    });
    return work;
  }, [state, client, tenantId, context, onError]);

  const reset = useCallback(() => {
    round.current++;
    handing.current = null;
    setState({ phase: "idle" });
  }, []);

  return { state, ask, helped, toPerson, reset };
}
