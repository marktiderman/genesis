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
    getSession(): PromiseLike<{
      data: { session: { access_token?: string; user: { id: string; email?: string | null } } | null };
    }>;
    getUser(): PromiseLike<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
    signOut(options: { scope: "local" }): PromiseLike<{ error: unknown }>;
    verifyOtp(params: { token_hash: string; type: "email" }): PromiseLike<{
      data: { user: { id: string } | null; session?: { access_token: string } | null } | null;
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
   * own account can't sign you in to it unnoticed. Nothing that signs anyone in exists until
   * `continue()`: it spends the continue nonce (30 seconds, once), and only then does the server
   * mint Supabase's token, which is exchanged at once. `cancel()` burns the nonce.
   */
  | {
      kind: "confirm";
      email: string;
      next: string;
      signedInAs: string | null;
      continue(): Promise<WebHandoffStep>;
      cancel(): Promise<WebHandoffStep>;
    }
  /**
   * The person chose Cancel. Whoever else was signed in here has been signed out locally, so the
   * page never leaves someone in the app as another person: show "You can close this window".
   */
  | { kind: "cancelled"; next: string; signedOut: boolean }
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
 * Claim the handoff and say what the page shows next. Never signs anyone in or out by itself:
 * a `confirm` step does that only when the person chooses `continue()` or `cancel()`. A fragment
 * is claimed once: calling again with the same fragment (React's development double effects)
 * returns the same promise.
 *
 * @stability Beta
 */
export function completeWebHandoff(options: CompleteWebHandoffOptions): Promise<WebHandoffStep> {
  const { fragment } = options;
  if (!fragment) return claim(options);
  let pending = redeeming.get(fragment);
  if (!pending) {
    pending = claim(options);
    redeeming.set(fragment, pending);
  }
  return pending;
}

type Outcome = { status?: string; next?: string; email?: string; userId?: string; tokenHash?: string; continueNonce?: string };

async function claim(options: CompleteWebHandoffOptions): Promise<WebHandoffStep> {
  const { supabase, fragment, redeemEndpoint = "/api/auth/redeem-handoff" } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const fallback = fragment?.next ?? "/";
  if (!fragment?.token) return { kind: "failed", reason: "missing", next: fallback };

  const post = async (body: Record<string, unknown>, bearer?: string): Promise<Outcome> => {
    const response = await doFetch(redeemEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    return (await response.json()) as Outcome;
  };

  // Who is signed in here, checked with Supabase Auth (getUser), not just read from storage: a
  // session ended elsewhere (the app signed out) still has a stored token until it expires.
  // Such a stale session is cleared here, so it is never mistaken for, or left behind as, a person.
  const { data } = await supabase.auth.getSession();
  let current = data.session?.user ?? null;
  if (current) {
    const checked = await supabase.auth.getUser();
    if (checked.error || !checked.data.user || checked.data.user.id !== current.id) {
      await supabase.auth.signOut({ scope: "local" });
      current = null;
    }
  }

  let outcome: Outcome;
  try {
    outcome = await post({ action: "claim", t: fragment.token, currentUserId: current?.id ?? null });
  } catch {
    return { kind: "failed", reason: "unavailable", next: fallback };
  }
  const next = appRelativePath(outcome.next) ?? fallback;
  if (outcome.status === "same_user") return { kind: "done", next };
  if (outcome.status === "expired") return { kind: "failed", reason: "expired", next: fallback };
  if (outcome.status !== "confirm" || !outcome.continueNonce || !outcome.email) {
    return { kind: "failed", reason: "unavailable", next: fallback };
  }

  const { continueNonce: nonce, email } = outcome;
  let running: Promise<WebHandoffStep> | null = null;
  const once = (step: () => Promise<WebHandoffStep>) => (running ??= step());

  return {
    kind: "confirm",
    email,
    next,
    signedInAs: current?.email ?? (current ? current.id : null),
    continue: () =>
      once(async () => {
        let minted: Outcome;
        try {
          minted = await post({ action: "continue", nonce });
        } catch {
          return { kind: "failed", reason: "unavailable", next };
        }
        if (minted.status === "expired") return { kind: "failed", reason: "expired", next };
        if (minted.status !== "ok" || !minted.tokenHash || !minted.userId) return { kind: "failed", reason: "unavailable", next };
        // Signed out first, so a failed exchange leaves nobody signed in rather than a mix.
        if (current) await supabase.auth.signOut({ scope: "local" });
        const verified = await supabase.auth.verifyOtp({ token_hash: minted.tokenHash, type: "email" });
        if (verified.error || !verified.data?.user) return { kind: "failed", reason: "verify_failed", next };
        if (verified.data.user.id !== minted.userId) {
          await supabase.auth.signOut({ scope: "local" });
          return { kind: "failed", reason: "wrong_user", next };
        }
        // Tell the server which session this is, so signing out of the app ends it. Best effort.
        const accessToken = verified.data.session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
        if (accessToken) await post({ action: "bind", nonce }, accessToken).catch(() => undefined);
        return { kind: "done", next: appRelativePath(minted.next) ?? next };
      }),
    cancel: () =>
      once(async () => {
        await post({ action: "discard", nonce }).catch(() => undefined);
        // Never leave the page signed in as someone other than the link's person.
        if (current) await supabase.auth.signOut({ scope: "local" });
        return { kind: "cancelled", next, signedOut: current !== null };
      }),
  };
}
