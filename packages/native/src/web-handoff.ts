/**
 * `@marktiderman/genesis-native/web-handoff`: open a page of the web app signed in as the person
 * using the app, so work the app leaves to the web carries on without a sign-in screen.
 *
 * The app asks its server for a single-use, short-lived link (genesis-supabase's
 * `createWebHandoff`, the `mint` route) with the session's access token, then opens it in the
 * in-app browser. The modules are injected, never imported:
 *
 * ```ts
 * import * as WebBrowser from "expo-web-browser";
 * await openOnWeb("/clients/1/forms", {
 *   endpoint: "https://app.example.com/api/auth/handoff",
 *   getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
 *   browser: WebBrowser,
 * });
 * ```
 *
 * Why the in-app browser (`openBrowserAsync`: SFSafariViewController on iOS, a Custom Tab on
 * Android) and not `Linking.openURL` (Safari): the person stays in the app and Done brings them
 * back; and the in-app browser keeps its own website data between openings, so after the first
 * handoff the page is already signed in as them and goes straight to the path. Safari may be
 * signed in as someone else, which would ask them to switch every time. Not
 * `openAuthSessionAsync` either: it shows the system "wants to use … to sign in" alert each time.
 *
 * @packageDocumentation
 */

/** `expo-web-browser`'s `openBrowserAsync`, as the shape used here. */
export interface WebBrowserLike {
  openBrowserAsync(url: string, options?: Record<string, unknown>): Promise<unknown>;
}

/** @stability Beta */
export interface OpenOnWebOptions {
  /** The mint route: `https://<web app>/api/auth/handoff`. Its origin is also the web app's. */
  endpoint: string;
  /** The signed-in session's access token, or nothing when signed out. */
  getAccessToken: () => Promise<string | null | undefined> | string | null | undefined;
  /** `import * as WebBrowser from "expo-web-browser"`. */
  browser: WebBrowserLike;
  /** Passed to `openBrowserAsync` (presentationStyle, controlsColor…). */
  browserOptions?: Record<string, unknown>;
  /** The web page that completes a handoff, also shown signed out. Default `/auth/handoff`. */
  pagePath?: string;
  /** Give up on the server after this long and open the page signed out. Default 8000 ms. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export type OpenOnWebResult =
  /** Opened signed in (the page may still ask "Continue as …?" the first time). */
  | { signedIn: true }
  /**
   * Opened the page signed out, so the person signs in there and lands on the path: no session
   * here, the server unreachable, no email on the account (Supabase signs in by email link), or
   * too many links in a minute.
   */
  | { signedIn: false; reason: "signed_out" | "unreachable" | "no_email" | "rate_limited" | "refused" };

/** Only paths on the web app: one leading `/`, no `//`, no backslash or control characters. */
function isAppPath(path: string): boolean {
  // eslint-disable-next-line no-control-regex
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u0020\u007f-\u009f]/.test(path);
}

/**
 * Open `path` on the web app, signed in as the app's person. Throws for a path that isn't the
 * web app's own (`https://…`, `//host`); the server checks again. When a signed-in link can't
 * be had, opens the page signed out instead of failing the tap.
 *
 * @stability Beta
 */
export async function openOnWeb(path: string, options: OpenOnWebOptions): Promise<OpenOnWebResult> {
  if (!isAppPath(path)) throw new TypeError(`openOnWeb takes a path on the web app, like "/settings"; got ${JSON.stringify(path)}.`);
  const { endpoint, browser, browserOptions, pagePath = "/auth/handoff", timeoutMs = 8000 } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const origin = new URL(endpoint).origin;
  // Signed out: the web app's sign-in page, which returns to the path afterwards.
  const signedOutUrl = `${origin}${isAppPath(pagePath) ? pagePath : "/auth/handoff"}#${new URLSearchParams({ next: path }).toString()}`;
  const open = async (url: string) => {
    await browser.openBrowserAsync(url, browserOptions);
  };

  const token = await options.getAccessToken();
  if (!token) {
    await open(signedOutUrl);
    return { signedIn: false, reason: "signed_out" };
  }

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ path }),
      signal: controller.signal,
    });
  } catch {
    await open(signedOutUrl);
    return { signedIn: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown; fallbackUrl?: unknown };
  const sameOrigin = (url: unknown): url is string => {
    if (typeof url !== "string") return false;
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  if (response.ok && sameOrigin(body.url)) {
    await open(body.url);
    return { signedIn: true };
  }
  if (response.status === 400) throw new TypeError(`The server refused ${JSON.stringify(path)} as a web path.`);
  await open(sameOrigin(body.fallbackUrl) ? body.fallbackUrl : signedOutUrl);
  const reason = body.error === "no_email" || body.error === "rate_limited" ? body.error : "refused";
  return { signedIn: false, reason };
}
