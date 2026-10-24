import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  formProgress,
  respondentPath,
  type CreateFormOptions,
  type Ending,
  type FormDefinition,
  type FormEngine,
  type FormProgress,
  type FormState,
  type HostOptions,
  type LinkParams,
} from "@marktiderman/genesis-forms";
import { useFormSelector } from "./engine-hooks";

/** One question at a time (`"focus"`) or every question on one page (`"classic"`). */
export type FormLayoutMode = "focus" | "classic";

/** Where sending stands: not yet, on its way (`onSubmit` running), done, or failed (the answers are kept). */
export type SendPhase = "idle" | "sending" | "sent" | "failed";

/**
 * What the controller asks the renderer to move focus to. The controller decides when; the
 * renderer decides how (a DOM `focus()`, a native accessibility focus).
 * - `step`: a new question is on screen (focus layout only): its input, else its question text.
 * - `ending`: the ending replaced the form.
 * - `errorSummary`: a submit in classic layout failed: the summary of invalid answers (or the first one).
 * - `submit`: sending failed: put focus back on the submit control, if it was lost.
 */
export type FocusTarget =
  | { kind: "step"; id: string | null }
  | { kind: "ending" }
  | { kind: "errorSummary" }
  | { kind: "submit" };

/** One invalid answer, in form order: what an error summary lists. */
export interface FormErrorItem {
  /** The field's block id. */
  id: string;
  /** The question, with recall resolved. */
  label: string;
  message: string;
}

export interface FormControllerOptions {
  /** The layout. Default: the definition's (`layout.mode`), else `"classic"`. */
  layout?: FormLayoutMode | undefined;
  /**
   * Called once the form completes. The ending shows only after it resolves; if it rejects, the
   * answers stay (read-only: a completed response is final), `phase` is `"failed"`, and
   * submitting again sends them again.
   */
  onSubmit?: ((engine: FormEngine) => void | Promise<void>) | undefined;
  /** Called on every state change: an answer, a step forward or back, a submit attempt. */
  onChange?: ((state: FormState, engine: FormEngine) => void) | undefined;
  /**
   * With the definition's `settings.saveProgress` on, called a moment after each step forward
   * (classic layout: a moment after the answers change) with how far the respondent got. It runs
   * after the step, a rejection or throw is ignored (the next call carries every answer again),
   * and none is made once the form is submitted. Call `flushProgress` when the app goes to the
   * background, so a pending save goes at once.
   */
  onProgress?: ((engine: FormEngine, progress: FormProgress) => void | Promise<void>) | undefined;
  /** In focus layout, move on after a single pick (`onAdvance`). Never from the last question. Default true. */
  autoAdvance?: boolean | undefined;
  /**
   * Asked before moving on or sending: a message to announce while the form must wait (an
   * upload still on its way), or null to go ahead.
   */
  waitFor?: (() => string | null) | undefined;
  /** Move focus (see `FocusTarget`). Called from a layout effect, after the change is on screen. */
  focus?: ((target: FocusTarget) => void) | undefined;
}

export interface FormController {
  engine: FormEngine;
  /** The definition being filled in, with the host's option lists (`engine.definition`). */
  definition: FormDefinition;
  layout: FormLayoutMode;
  status: FormState["status"];
  /** The block on screen in focus layout. */
  current: string | null;
  /** The blocks the respondent steps through (`respondentPath`): render these. */
  path: string[];
  /** Errors by field id. */
  errors: Record<string, string>;
  /** The invalid answers on the path, in form order, for an error summary. */
  errorList: FormErrorItem[];
  /** The ending reached once completed (the first ending when none is), or undefined when the form has none. */
  ending: Ending | undefined;
  /** The form's introduction with recall resolved. */
  description: string | undefined;
  /** How many steps back the respondent can go (0 on the first question). */
  historyLength: number;
  /** The question's number (from 1) on the path, and the path's length. */
  step: number;
  total: number;
  /** Classic layout, or the last question in focus layout: the submit control sends. */
  isLast: boolean;
  /** Focus layout, past the first question, and not completed. */
  canGoBack: boolean;
  /** Completed: the engine ignores edits, so the fields show read-only. */
  locked: boolean;
  /** Show the ending instead of the form: completed, and `onSubmit` (if any) resolved. */
  showEnding: boolean;
  phase: SendPhase;
  /** `phase === "sending"`. */
  busy: boolean;
  /** `phase === "failed"`. */
  failed: boolean;
  /** Answers save as they go (`settings.saveProgress` and an `onProgress`). */
  saveProgress: boolean;
  /**
   * The latest message for a live region (a failed step, waiting for an upload). The same
   * message twice in a row gets a trailing space, so it is announced again.
   */
  announcement: string;
  /** Which way the last step went, for an entry transition. */
  direction: "forward" | "back";
  /**
   * For a field renderer's single pick (focus layout with `autoAdvance`): move on shortly after.
   * Undefined otherwise. Never moves on from the last question.
   */
  onAdvance: (() => void) | undefined;
  /** Move on from the current question (focus layout), or send from the last. */
  advance(): void;
  /** What the form's submit (Enter, OK, Send) does: `advance` in focus layout, send in classic. */
  submit(): void;
  /** Back one question (focus layout). */
  back(): void;
  /** Cancel a pending `onAdvance`. */
  cancelAdvance(): void;
  /** Send a pending `onProgress` now (the page or app is going away). */
  flushProgress(): void;
  /** Say something once in the live region. */
  announce(message: string): void;
}

/** How long a single pick waits before moving on, so the respondent sees it picked. */
export const ADVANCE_DELAY_MS = 250;
/** How long after a step forward `onProgress` waits, so quick steps save once. */
export const PROGRESS_DELAY_MS = 400;
/** In classic layout, how long after the last answer changed. */
export const CLASSIC_PROGRESS_DELAY_MS = 1500;

/**
 * The engine options for a form that takes `hostOptions` and `linkParams` beside its other
 * options, as `<Form>` does: `options` itself when neither is given.
 */
export function formEngineOptions(
  options: CreateFormOptions | undefined,
  extra: { hostOptions?: HostOptions | undefined; linkParams?: LinkParams | undefined },
): CreateFormOptions | undefined {
  if (!extra.hostOptions && !extra.linkParams) return options;
  return {
    ...options,
    ...(extra.hostOptions ? { hostOptions: extra.hostOptions } : {}),
    ...(extra.linkParams ? { linkParams: extra.linkParams } : {}),
  };
}

/**
 * The headless controller behind a form renderer: the step on screen and the path, errors, Next
 * and Back, sending with retry, auto-advance, saving progress, what to announce and where focus
 * goes. A renderer (web, native) draws what it returns and wires its controls to its actions,
 * so every platform behaves the same.
 *
 * Create the engine with `useForm` (with `formEngineOptions` for `hostOptions` and
 * `linkParams`). Pass a different engine and the controller starts over (`phase` back to idle).
 * Options are read when used, so passing new functions each render is fine.
 */
export function useFormController(engine: FormEngine, options: FormControllerOptions = {}): FormController {
  const def = engine.definition;
  const layout: FormLayoutMode = options.layout ?? def.layout?.mode ?? "classic";
  const autoAdvance = options.autoAdvance ?? true;

  // The latest committed options, read when an action or timer runs, so none acts on a stale
  // render's. Updated in a layout effect (the first one here), not during render, so a render
  // React throws away never leaks its options.
  const latest = useRef({ options, layout, engine });
  useLayoutEffect(() => {
    latest.current = { options, layout, engine };
  });

  const status = useFormSelector(engine, (s) => s.status);
  const current = useFormSelector(engine, (s) => s.current);
  // Strings, so typing (which builds new objects) re-renders only when these change.
  const pathKey = useFormSelector(engine, (s) => JSON.stringify(respondentPath(def, s)));
  const errorsKey = useFormSelector(engine, (s) => JSON.stringify(s.errors));
  const endingId = useFormSelector(engine, (s) => s.ending);
  const historyLength = useFormSelector(engine, (s) => s.history.length);
  // The introduction recalls like endings do, so it follows the answers.
  const description = useFormSelector(engine, () => (def.description ? engine.text(def.description) : undefined));
  const path = JSON.parse(pathKey) as string[];
  const errors = JSON.parse(errorsKey) as Record<string, string>;

  // Per engine: a new engine starts with a fresh send phase, announcement and focus requests.
  const [local, setLocal] = useState(() => ({ engine, phase: "idle" as SendPhase, announcement: "", summary: 0 }));
  let view = local;
  if (local.engine !== engine) {
    view = { engine, phase: "idle", announcement: "", summary: 0 };
    setLocal(view);
  }
  const { phase, announcement, summary } = view;
  /** Update this engine's state; an update from an earlier engine's action is dropped. */
  const update = (from: FormEngine, change: (s: typeof local) => Partial<typeof local>) =>
    setLocal((s) => (s.engine === from ? { ...s, ...change(s) } : s));

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousCurrent = useRef(current);
  // The engine whose `onSubmit` is running: a send still on its way for an earlier engine
  // never blocks this one's.
  const sending = useRef<FormEngine | null>(null);
  const direction = useRef<"forward" | "back">("forward");
  const progress = useRef<{ flush(): void } | null>(null);

  const showEnding = status === "completed" && (phase === "sent" || !options.onSubmit);
  const locked = status === "completed";
  const focus = (target: FocusTarget) => latest.current.options.focus?.(target);

  // Subscribed once per engine while there is an onChange; the latest one is called.
  const hasOnChange = !!options.onChange;
  useEffect(() => {
    if (!hasOnChange) return;
    return engine.subscribe(() => latest.current.options.onChange?.(engine.getState(), engine));
  }, [engine, hasOnChange]);

  // Save answers as they go: a moment after each step forward (classic: after the answers
  // change), off the respondent's path. The latest onProgress is read when it fires.
  const saveProgress = def.settings?.saveProgress === true && !!options.onProgress;
  useEffect(() => {
    if (!saveProgress) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = engine.getState();
    const fire = () => {
      timer = undefined;
      if (engine.getState().status === "completed") return;
      try {
        void Promise.resolve(latest.current.options.onProgress?.(engine, formProgress(engine))).catch(() => {});
      } catch {
        // A host's error never reaches the respondent; the next step saves again.
      }
    };
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(fire, delay);
    };
    const unsubscribe = engine.subscribe(() => {
      const state = engine.getState();
      const previous = last;
      last = state;
      if (state.status === "completed") {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      const event = state.events[state.events.length - 1];
      if (layout === "focus") {
        if (event?.type === "next" && state.current !== previous.current) schedule(PROGRESS_DELAY_MS);
      } else if (event?.type === "answer") schedule(CLASSIC_PROGRESS_DELAY_MS);
    });
    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      fire();
    };
    progress.current = { flush };
    return () => {
      unsubscribe();
      if (progress.current?.flush === flush) progress.current = null;
      flush();
    };
  }, [engine, saveProgress, layout]);

  // A new question cancels a pending auto-advance and, in focus layout, takes focus. Comparing
  // with the previous question (not a "mounted" flag) keeps StrictMode's double effect run from
  // stealing focus on first render. A layout effect, so keys typed right after advancing land in
  // the new question.
  useLayoutEffect(() => {
    if (previousCurrent.current === current) return;
    previousCurrent.current = current;
    clearTimeout(advanceTimer.current);
    if (layout === "focus") focus({ kind: "step", id: current });
  }, [current, layout]);

  useLayoutEffect(() => {
    if (showEnding) focus({ kind: "ending" });
  }, [showEnding]);

  useLayoutEffect(() => {
    if (summary) focus({ kind: "errorSummary" });
  }, [summary]);

  useLayoutEffect(() => {
    if (phase === "failed") focus({ kind: "submit" });
  }, [phase]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  // Actions read `latest`, so a call from an old render's closure acts on what is current now.
  const actions = useRef<Pick<FormController, "advance" | "submit" | "back" | "cancelAdvance" | "flushProgress" | "announce"> & { schedule(): void }>(
    null as never,
  );
  if (!actions.current) {
    const announce = (message: string) => {
      const from = latest.current.engine;
      update(from, (s) => ({ announcement: s.announcement === message ? `${message} ` : message }));
    };
    const announceStepError = () => {
      const state = latest.current.engine.getState();
      const message = state.current ? state.errors[state.current] : undefined;
      if (message) announce(message);
    };
    /** True (and says so) while the host asks the form to wait. */
    const waiting = () => {
      const message = latest.current.options.waitFor?.() ?? null;
      if (message === null) return false;
      announce(message);
      return true;
    };
    const isLastStep = (state: FormState) => {
      const shown = respondentPath(latest.current.engine.definition, state);
      return state.current === shown[shown.length - 1];
    };
    const finish = async () => {
      const { engine: e, layout: l, options: o } = latest.current;
      if (sending.current === e) return;
      if (e.getState().status !== "completed" && waiting()) return;
      // A retry after a failed onSubmit finds the response already completed.
      if (e.getState().status !== "completed" && !e.submit()) {
        if (l === "classic") update(e, (s) => ({ summary: s.summary + 1 }));
        else announceStepError();
        return;
      }
      if (!o.onSubmit) {
        update(e, () => ({ phase: "sent" }));
        return;
      }
      sending.current = e;
      update(e, () => ({ phase: "sending" }));
      try {
        await o.onSubmit(e);
        update(e, () => ({ phase: "sent" }));
      } catch {
        update(e, () => ({ phase: "failed" }));
      } finally {
        if (sending.current === e) sending.current = null;
      }
    };
    const advance = () => {
      if (waiting()) return;
      direction.current = "forward";
      const e = latest.current.engine;
      if (isLastStep(e.getState())) void finish();
      else if (!e.next()) announceStepError();
    };
    actions.current = {
      announce,
      advance,
      submit() {
        clearTimeout(advanceTimer.current);
        if (latest.current.layout === "focus") advance();
        else void finish();
      },
      back() {
        clearTimeout(advanceTimer.current);
        direction.current = "back";
        latest.current.engine.back();
      },
      cancelAdvance: () => clearTimeout(advanceTimer.current),
      flushProgress: () => progress.current?.flush(),
      // Auto-advance never submits: on the last question the respondent presses Submit.
      schedule() {
        clearTimeout(advanceTimer.current);
        const e = latest.current.engine;
        advanceTimer.current = setTimeout(() => {
          if (latest.current.engine !== e) return;
          const state = e.getState();
          if (state.status === "completed" || isLastStep(state)) return;
          direction.current = "forward";
          if (!e.next()) announceStepError();
        }, ADVANCE_DELAY_MS);
      },
    };
  }
  const { schedule, ...act } = actions.current;

  const step = current ? Math.max(1, path.indexOf(current) + 1) : 1;
  const errorList: FormErrorItem[] = path
    .filter((id) => errors[id])
    .map((id) => ({ id, label: engine.text(engine.field(id)?.label ?? id), message: errors[id]! }));

  return {
    engine,
    definition: def,
    layout,
    status,
    current,
    path,
    errors,
    errorList,
    ending: def.endings?.find((x) => x.id === endingId) ?? def.endings?.[0],
    description,
    historyLength,
    step,
    total: path.length,
    isLast: layout === "classic" || current === path[path.length - 1],
    canGoBack: layout === "focus" && historyLength > 0 && !locked,
    locked,
    showEnding,
    phase,
    busy: phase === "sending",
    failed: phase === "failed",
    saveProgress,
    announcement,
    direction: direction.current,
    onAdvance: layout === "focus" && autoAdvance ? schedule : undefined,
    ...act,
  };
}
