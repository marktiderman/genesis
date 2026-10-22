import { useCallback, useMemo, useReducer } from "react";
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
  value: FormDefinition;
  /**
   * Apply an edit. Pass `coalesce` (for example `"label:q_ab12"`) for edits
   * made keystroke by keystroke, so they undo as one step.
   */
  apply: (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the value and clear history, for example after loading a saved draft. */
  reset: (value: FormDefinition) => void;
}

/** Undoable editing state for a definition. */
export function useBuilderHistory(initial: FormDefinition): BuilderHistory {
  const [state, dispatch] = useReducer(reducer, initial, (value): State => ({ past: [], present: value, future: [] }));
  const apply = useCallback(
    (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) =>
      dispatch(coalesce === undefined ? { type: "apply", edit } : { type: "apply", edit, coalesce }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: FormDefinition) => dispatch({ type: "reset", value }), []);
  return useMemo(
    () => ({
      value: state.present,
      apply,
      undo,
      redo,
      reset,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, apply, undo, redo, reset],
  );
}

export { reducer as historyReducer };
