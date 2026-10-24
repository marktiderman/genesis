/**
 * Boot: the async work an app must finish before its first screen (wipe a
 * session left by a reinstall, hydrate stores, load fonts, restore the query
 * cache, read the session).
 *
 * Steps run once each, in order. A step that finished is never run again, so
 * "try again" after a failure resumes at the step that failed. Each step has a
 * timeout (10 seconds by default), so a hung step ends in the fatal screen with
 * retry instead of trapping the splash. A minimum keeps a fast boot from
 * flashing the splash.
 *
 * `createBoot` is the controller (no React); `BootProvider` + `useBoot()` read
 * it from components.
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export interface BootStepContext {
  /** Aborted when the step times out. */
  signal: AbortSignal;
}

export interface BootStep {
  /** Unique within the list; names the step in errors. */
  id: string;
  run: (context: BootStepContext) => Promise<unknown> | unknown;
  /** Overrides the boot's `timeoutMs` for this step. */
  timeoutMs?: number;
}

export type BootStatus = "idle" | "booting" | "ready" | "failed";

export interface BootState {
  status: BootStatus;
  /** Set when `status` is `"failed"`. */
  error: Error | null;
  /** The id of the step that failed. */
  failedStep: string | null;
  /** Ids of the steps that have finished, in order. */
  completed: readonly string[];
}

export interface BootOptions {
  /** Shortest time the boot takes, so the splash doesn't flash. Default 0. */
  minimumMs?: number;
  /** Longest time one step may take. Default 10 000. */
  timeoutMs?: number;
}

export interface BootController {
  getState(): BootState;
  subscribe(listener: () => void): () => void;
  /** Run the steps not yet finished. Calling it while a run is in flight returns that run. */
  start(): Promise<void>;
  /** After a failure: run again from the step that failed. */
  retry(): Promise<void>;
}

/** Thrown when a step takes longer than its timeout. */
export class BootTimeoutError extends Error {
  readonly step: string;
  constructor(step: string, ms: number) {
    super(`Boot step "${step}" did not finish within ${ms} ms.`);
    this.name = "BootTimeoutError";
    this.step = step;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : "Unknown error", { cause: value });
}

async function runStep(step: BootStep, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BootTimeoutError(step.id, timeoutMs));
    }, timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve().then(() => step.run({ signal: controller.signal })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The boot controller: runs `steps` once each, in order, with a timeout per step. */
export function createBoot(steps: readonly BootStep[], options: BootOptions = {}): BootController {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) throw new Error(`Boot step "${step.id}" is listed twice.`);
    seen.add(step.id);
  }
  const { minimumMs = 0, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const listeners = new Set<() => void>();
  let state: BootState = { status: "idle", error: null, failedStep: null, completed: [] };
  let inFlight: Promise<void> | null = null;

  const set = (next: Partial<BootState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const run = async () => {
    const started = Date.now();
    set({ status: "booting", error: null, failedStep: null });
    for (const step of steps) {
      if (state.completed.includes(step.id)) continue;
      try {
        await runStep(step, step.timeoutMs ?? timeoutMs);
      } catch (error) {
        set({ status: "failed", error: toError(error), failedStep: step.id });
        return;
      }
      set({ completed: [...state.completed, step.id] });
    }
    const wait = minimumMs - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    set({ status: "ready" });
  };

  const start = () => {
    if (state.status === "ready") return Promise.resolve();
    if (!inFlight) {
      inFlight = run().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    retry: start,
  };
}

const BootContext = createContext<BootController | null>(null);

/** Makes a boot readable with `useBoot()`. */
export function BootProvider({ boot, children }: { boot: BootController; children: ReactNode }) {
  return <BootContext.Provider value={boot}>{children}</BootContext.Provider>;
}

export interface UseBootReturn extends BootState {
  retry: () => void;
}

/** The boot's status, and `retry` after a failure. Inside `GenesisNativeApp` or a `BootProvider`. */
export function useBoot(): UseBootReturn {
  const boot = useContext(BootContext);
  if (!boot) throw new Error("useBoot must be used inside <GenesisNativeApp> or <BootProvider>.");
  const state = useSyncExternalStore(boot.subscribe, boot.getState, boot.getState);
  return { ...state, retry: () => void boot.retry() };
}
