/**
 * @feat:chat
 * The composer's state for one thread, with its draft: restored when the
 * thread opens, saved a moment after typing stops and when the screen closes,
 * cleared on send. The thread screen owns it, so a swipe or the long-press
 * sheet can set what the next message replies to.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { composerReducer, createDraftSaver, draftKey, emptyComposer, loadDraft, memoryDraftStorage, toSend, type ComposerAction, type ReplyTarget } from "./composer-state";
import { useChatNative } from "./context";

const memoryDrafts = memoryDraftStorage();

export function useChatComposer(conversationId: string, threadRootId?: string | null) {
  const { modules } = useChatNative();
  const storage = modules.drafts ?? memoryDrafts;
  const key = draftKey(conversationId, threadRootId);
  const [state, dispatch] = useReducer(composerReducer, emptyComposer);
  const saver = useMemo(() => createDraftSaver(storage, key), [storage, key]);
  const restored = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    restored.current = null;
    void loadDraft(storage, key).then((draft) => {
      if (live && draft) dispatch({ type: "restore", draft });
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

  /** What to send, and empties the composer and its draft. */
  const take = useCallback(() => {
    const payload = toSend(state);
    dispatch({ type: "sent" });
    saver.clear();
    return payload;
  }, [state, saver]);

  return { state, dispatch: dispatch as (action: ComposerAction) => void, setReply, take };
}

export type ChatComposerHandle = ReturnType<typeof useChatComposer>;
