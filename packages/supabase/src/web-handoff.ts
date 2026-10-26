/**
 * `@marktiderman/genesis-supabase/web-handoff`: the web page half of "continue on the web,
 * already signed in" (the server half is `/web-handoff/server`). Browser code, no React.
 *
 * ```ts
 * // As early as the page's code runs, before analytics or error reporting load:
 * const fragment = takeWebHandoffFragment();
 * // In the page:
 * const step = await completeWebHandoff({ supabase, fragment });
 * if (step.kind === "confirm") showChoice(`Continue as ${step.email}?`, () => step.continue());
 * if (step.kind === "done") navigate(step.next);
 * ```
 *
 * @packageDocumentation
 */
import { appRelativePath } from "./web-handoff-path";

export { appRelativePath } from "./web-handoff-path";

/** What the handoff link carried in its fragment. */
export interface WebHandoffFragment {
  /** The single-use handoff token, or null when the link had none. */
  token: string | null;
  /** Where to land, already checked with {@link appRelativePath}; `/` when missing or unsafe. */
  next: string;
}

interface LocationLike {
  hash: string;
  pathname: string;
  search: string;
}
interface HistoryLike {
  state: unknown;
  replaceState(data: unknown, unused: string, url?: string | null): void;
}

let taken: WebHandoffFragment | null = null;

/**
 * Read the handoff link's fragment (`#t=<token>&next=<path>`) and remove it from the address bar
 * and history at once (`history.replaceState`), so the token isn't left in history, a bookmark,
 * a screenshot of the address bar, or the URL an analytics or error script records. Call it
 * before those scripts load. Later calls return what the first call read.
 *
 * @stability Beta
 */
export function takeWebHandoffFragment(
  win: { location: LocationLike; history: HistoryLike } = globalThis as unknown as { location: LocationLike; history: HistoryLike },
): WebHandoffFragment | null {
  const hash = win.location.hash;
  if (hash.length > 1) {
    const params = new URLSearchParams(hash.slice(1));
    taken = { token: params.get("t"), next: appRelativePath(params.get("next")) ?? "/" };
    win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search);
  }
  return taken;
}

/** Forget a fragment {@link takeWebHandoffFragment} read (tests, or after the handoff finished). */
export function forgetWebHandoffFragment(): void {
  taken = null;
}

/** The parts of a browser Supabase client the handoff uses. */
export interface WebHandoffAuthClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: { user: { id: string; email?: string | null } } | null } }>;
    signOut(options: { scope: "local" }): PromiseLike<{ error: unknown }>;
    verifyOtp(params: { token_hash: string; type: "email" }): PromiseLike<{
      data: { user: { id: string } | null } | null;
      error: { message: string } | null;
    }>;
  };
}

export type WebHandoffFailure = "missing" | "expired" | "unavailable" | "verify_failed" | "wrong_user";

export type WebHandoffStep =
  /** Signed in as the right person: go to `next`. */
  | { kind: "done"; next: string }
  /**
   * Ask before signing in: "Continue as {email}?". Shown whenever the browser isn't already
   * signed in as this person (nobody, or someone else), so a link someone else minted for their
   * own account can't sign you in to it unnoticed. `continue()` signs the browser out locally
   * if anyone was signed in, then exchanges the token.
   */
  | { kind: "confirm"; email: string; next: string; signedInAs: string | null; continue(): Promise<WebHandoffStep> }
  | { kind: "failed"; reason: WebHandoffFailure; next: string };

/** @stability Beta */
export interface CompleteWebHandoffOptions {
  supabase: WebHandoffAuthClient;
  /** From {@link takeWebHandoffFragment}. */
  fragment: WebHandoffFragment | null;
  /** The redeem route. Default `/api/auth/redeem-handoff`. */
  redeemEndpoint?: string;
  fetch?: typeof fetch;
}

const redeeming = new WeakMap<WebHandoffFragment, Promise<WebHandoffStep>>();

/**
 * Redeem the handoff token and say what the page shows next. Never signs anyone out or in by
 * itself: a `confirm` step does that only when the person chooses `continue()`. A fragment is
 * redeemed once: calling again with the same fragment (React's development double effects)
 * returns the same promise.
 *
 * @stability Beta
 */
export function completeWebHandoff(options: CompleteWebHandoffOptions): Promise<WebHandoffStep> {
  const { fragment } = options;
  if (!fragment) return redeem(options);
  let pending = redeeming.get(fragment);
  if (!pending) {
    pending = redeem(options);
    redeeming.set(fragment, pending);
  }
  return pending;
}

async function redeem(options: CompleteWebHandoffOptions): Promise<WebHandoffStep> {
  const { supabase, fragment, redeemEndpoint = "/api/auth/redeem-handoff" } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const fallback = fragment?.next ?? "/";
  if (!fragment?.token) return { kind: "failed", reason: "missing", next: fallback };

  const { data } = await supabase.auth.getSession();
  const current = data.session?.user ?? null;

  let outcome: { status?: string; next?: string; email?: string; userId?: string; tokenHash?: string };
  try {
    const response = await doFetch(redeemEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: fragment.token, currentUserId: current?.id ?? null }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    outcome = (await response.json()) as typeof outcome;
  } catch {
    return { kind: "failed", reason: "unavailable", next: fallback };
  }
  const next = appRelativePath(outcome.next) ?? fallback;
  if (outcome.status === "same_user") return { kind: "done", next };
  if (outcome.status === "expired") return { kind: "failed", reason: "expired", next: fallback };
  if (outcome.status !== "confirm" || !outcome.tokenHash || !outcome.email || !outcome.userId) {
    return { kind: "failed", reason: "unavailable", next: fallback };
  }

  const { tokenHash, email, userId } = outcome;
  let running: Promise<WebHandoffStep> | null = null;
  return {
    kind: "confirm",
    email,
    next,
    signedInAs: current?.email ?? (current ? current.id : null),
    continue: () =>
      (running ??= (async (): Promise<WebHandoffStep> => {
        // Signed out first, so a failed exchange leaves nobody signed in rather than a mix.
        if (current) await supabase.auth.signOut({ scope: "local" });
        const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
        if (verified.error || !verified.data?.user) return { kind: "failed", reason: "verify_failed", next };
        if (verified.data.user.id !== userId) {
          await supabase.auth.signOut({ scope: "local" });
          return { kind: "failed", reason: "wrong_user", next };
        }
        return { kind: "done", next: appRelativePath(next) ?? "/" };
      })()),
  };
}
