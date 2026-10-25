/**
 * @feat:chat
 * The composer's state for one thread, with its draft (per signed-in person):
 * restored when the thread opens, saved a moment after typing stops and when
 * the screen closes or moves to another thread, cleared on send. The thread screen owns it, so a swipe or the long-press
 * sheet can set what the next message replies to.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { composerReducer, createDraftSaver, draftKey, emptyComposer, loadDraft, memoryDraftStorage, toSend, type ComposerAction, type ComposerState, type ReplyTarget } from "./composer-state";
import { useChatNative } from "./context";

const memoryDrafts = memoryDraftStorage();

/** `userId` is the signed-in person's (`useChat().userId`): drafts are kept per person. */
export function useChatComposer(conversationId: string, threadRootId: string | null | undefined, userId: string) {
  const { modules } = useChatNative();
  const storage = modules.drafts ?? memoryDrafts;
  const key = draftKey(userId, conversationId, threadRootId);
  const [state, dispatch] = useReducer(composerReducer, emptyComposer);
  const saver = useMemo(() => createDraftSaver(storage, key), [storage, key]);
  const restored = useRef<string | null>(null);
  // The key the state belongs to. Another conversation in the same screen starts empty, so one
  // thread's text, reply or files never show, save or send in the next (the draft flushed for the
  // old key first, in the cleanup below).
  const stateKey = useRef(key);
  if (stateKey.current !== key) {
    stateKey.current = key;
    dispatch({ type: "reset" });
  }

  useEffect(() => {
    let live = true;
    restored.current = null;
    void loadDraft(storage, key).then((draft) => {
      if (!live) return;
      if (draft) dispatch({ type: "restore", draft });
      // Only this key's own load: a late answer for a thread left behind must not stop this one saving.
      restored.current = key;
    });
    return () => {
      live = false;
      saver.flush();
    };
  }, [storage, key, saver]);

  useEffect(() => {
    // Don't overwrite the stored draft with the empty state before it has been read.
    if (restored.current !== key) return;
    saver.save({ text: state.text, replyTo: state.replyTo });
  }, [state.text, state.replyTo, saver, key]);

  const setReply = useCallback((to: ReplyTarget | null) => dispatch({ type: "reply", to }), []);

  // A second tap before the re-render must not send the same message again.
  const taken = useRef<ComposerState | null>(null);
  /** What to send (null when this state was already sent), and empties the composer and its draft. */
  const take = useCallback(() => {
    if (taken.current === state) return null;
    taken.current = state;
    const payload = toSend(state);
    dispatch({ type: "sent" });
    saver.clear();
    return payload;
  }, [state, saver]);

  return { state, dispatch: dispatch as (action: ComposerAction) => void, setReply, take };
}

export type ChatComposerHandle = ReturnType<typeof useChatComposer>;
