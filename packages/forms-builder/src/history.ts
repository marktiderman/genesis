import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormDefinition } from "@marktiderman/genesis-forms";

/** Most undo steps kept. Older ones are dropped. */
export const MAX_HISTORY = 100;

export interface History {
  past: FormDefinition[];
  present: FormDefinition;
  future: FormDefinition[];
}

type Action =
  | { type: "apply"; edit: (def: FormDefinition) => FormDefinition; coalesce?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: FormDefinition };

interface State extends History {
  /** Typing in one input merges into one undo step, keyed by what is being edited. */
  lastCoalesce?: string;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "apply": {
      const next = action.edit(state.present);
      if (next === state.present) return state;
      const merge = action.coalesce !== undefined && action.coalesce === state.lastCoalesce;
      const past = merge ? state.past : [...state.past, state.present].slice(-MAX_HISTORY);
      const out: State = { past, present: next, future: [] };
      if (action.coalesce !== undefined) out.lastCoalesce = action.coalesce;
      return out;
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

export interface BuilderHistory {
  /** The value as rendered. */
  value: FormDefinition;
  /**
   * The value with every edit applied so far, also those not rendered yet
   * (an edit made a moment ago, or while unmounting).
   */
  get: () => FormDefinition;
  /**
   * Apply an edit. Pass `coalesce` (for example `"label:q_ab12"`) for edits
   * made keystroke by keystroke, so they undo as one step. The edit runs at
   * once, outside React's render, so `get()` sees it straight away.
   */
  apply: (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Whether undo and redo would do anything now, also after an edit not rendered yet.
   * Optional so that code which implements or mocks this interface keeps compiling;
   * `useBuilderHistory` always sets it.
   */
  getStatus?: () => { canUndo: boolean; canRedo: boolean };
  /** Replace the value and clear history, for example after loading a saved draft. */
  reset: (value: FormDefinition) => void;
}

export interface BuilderHistoryOptions {
  /** Called with the new value after each edit, undo or redo that changes it (not after `reset`). */
  onChange?: (value: FormDefinition) => void;
}

/** Undoable editing state for a definition. */
export function useBuilderHistory(initial: FormDefinition, options: BuilderHistoryOptions = {}): BuilderHistory {
  const [state, setState] = useState((): State => ({ past: [], present: initial, future: [] }));
  // The latest state, ahead of the render: edits chain on it and `get()` reads it.
  const latest = useRef(state);
  const onChange = useRef(options.onChange);
  useEffect(() => {
    onChange.current = options.onChange;
  });
  const dispatch = useCallback((action: Action) => {
    const before = latest.current;
    const next = reducer(before, action);
    if (next === before) return;
    latest.current = next;
    setState(next);
    if (action.type !== "reset" && next.present !== before.present) onChange.current?.(next.present);
  }, []);
  const apply = useCallback(
    (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) =>
      dispatch(coalesce === undefined ? { type: "apply", edit } : { type: "apply", edit, coalesce }),
    [dispatch],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "redo" }), [dispatch]);
  const reset = useCallback((value: FormDefinition) => dispatch({ type: "reset", value }), [dispatch]);
  const get = useCallback(() => latest.current.present, []);
  const getStatus = useCallback(() => ({ canUndo: latest.current.past.length > 0, canRedo: latest.current.future.length > 0 }), []);
  return useMemo(
    () => ({
      value: state.present,
      get,
      getStatus,
      apply,
      undo,
      redo,
      reset,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, get, getStatus, apply, undo, redo, reset],
  );
}

export { reducer as historyReducer };
