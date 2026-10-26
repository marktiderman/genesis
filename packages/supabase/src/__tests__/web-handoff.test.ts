// @feat:web-handoff
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRelativePath } from "../web-handoff-path";
import { completeWebHandoff, forgetWebHandoffFragment, takeWebHandoffFragment, type WebHandoffAuthClient } from "../web-handoff";
import { createWebHandoff, handoffDigest, mintWebHandoff, type WebHandoffAdmin, type WebHandoffLogEvent } from "../web-handoff-server";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("appRelativePath", () => {
  it.each([
    ["/", "/"],
    ["/clients/1/forms", "/clients/1/forms"],
    ["/clients/1/forms?tab=questions#q2", "/clients/1/forms?tab=questions#q2"],
    ["/a/../b", "/b"],
    ["/my%20page", "/my%20page"],
    ["/a%2Fb", "/a%2Fb"],
    ["/javascript:alert(1)", "/javascript:alert(1)"],
  ])("keeps %s on the app", (input, expected) => {
    expect(appRelativePath(input)).toBe(expected);
  });

  it.each([
    "",
    "clients",
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\\/evil.com",
    "https://evil.com/",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    " /x",
    "/ /evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\u0000",
    "/%2F%2Fevil.com",
    "/%2f/evil.com",
    "/%5Cevil.com",
    "/%5cevil.com",
    "/%252F%252Fevil.com",
    "/%09/evil.com",
    "/%0a/evil.com",
    "/%E0%A4%A",
    `/${"a".repeat(2048)}`,
  ])("refuses %j", (input) => {
    expect(appRelativePath(input)).toBeNull();
  });

  it("refuses what isn't a string", () => {
    expect(appRelativePath(null)).toBeNull();
    expect(appRelativePath(undefined)).toBeNull();
    expect(appRelativePath(["/x"])).toBeNull();
  });
});


// A fake service-role client over an in-memory copy of the handoff table, with the same rules as
// 0015's functions, and a clock the tests move.
type Row = {
  user_id: string;
  token_digest: string;
  path: string;
  expires_at: number;
  used_at: number | null;
  source_session_id: string | null;
  nonce_digest: string | null;
  nonce_expires_at: number | null;
  continued_at: number | null;
  discarded_at: number | null;
  web_session_id: string | null;
};

const APP_SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEB_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jwt = (sub: string, sessionId: string) =>
  `h.${btoa(JSON.stringify({ sub, session_id: sessionId })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;
const APP_JWT = jwt(ME, APP_SESSION);
const WEB_JWT = jwt(ME, WEB_SESSION);

function fakeAdmin(opts: { users?: Record<string, string | null>; issueError?: { message: string; code?: string } } = {}) {
  const users = opts.users ?? { [ME]: "me@example.test", [OTHER]: "other@example.test" };
  const bearers: Record<string, string> = { [APP_JWT]: ME, [WEB_JWT]: ME, "good-token": ME };
  const clock = { now: 1_000_000 };
  const rows: Row[] = [];
  const sessions = new Set([APP_SESSION, WEB_SESSION]);
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const generateLink = vi.fn(async ({ email }: { type: "magiclink"; email: string }) => ({
    data: { properties: { hashed_token: `hash-for-${email}` } },
    error: null,
  }));
  const ok = (data: unknown) => ({ data, error: null });
  const admin: WebHandoffAdmin = {
    auth: {
      getUser: vi.fn(async (token: string) => {
        const id = bearers[token];
        return id ? { data: { user: { id, email: users[id] ?? null } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      }),
      admin: {
        getUserById: vi.fn(async (id: string) =>
          id in users ? { data: { user: { id, email: users[id] ?? null } }, error: null } : { data: { user: null }, error: { message: "not found" } },
        ),
        generateLink,
      },
    },
    rpc: vi.fn(async (fn: string, a: Record<string, unknown>) => {
      rpcs.push({ fn, args: a });
      const t = clock.now;
      switch (fn) {
        case "genesis_web_handoff_issue": {
          if (opts.issueError) return { data: null, error: opts.issueError };
          rows.push({
            user_id: a["p_user_id"] as string,
            token_digest: a["p_digest"] as string,
            path: a["p_path"] as string,
            expires_at: t + (a["p_ttl_seconds"] as number) * 1000,
            used_at: null,
            source_session_id: (a["p_source_session_id"] as string | null) ?? null,
            nonce_digest: null,
            nonce_expires_at: null,
            continued_at: null,
            discarded_at: null,
            web_session_id: null,
          });
          return ok("2026-01-01T00:01:00Z");
        }
        case "genesis_web_handoff_claim": {
          const r = rows.find((x) => x.token_digest === a["p_digest"] && x.used_at === null && x.expires_at > t);
          if (!r) return ok([]);
          Object.assign(r, { used_at: t, nonce_digest: a["p_nonce_digest"], nonce_expires_at: t + (a["p_nonce_ttl_seconds"] as number) * 1000 });
          return ok([{ user_id: r.user_id, path: r.path }]);
        }
        case "genesis_web_handoff_continue": {
          const r = rows.find((x) => x.nonce_digest === a["p_nonce_digest"] && !x.continued_at && !x.discarded_at && (x.nonce_expires_at ?? 0) > t);
          if (!r) return ok([]);
          r.continued_at = t;
          return ok([{ user_id: r.user_id, path: r.path }]);
        }
        case "genesis_web_handoff_discard": {
          const r = rows.find((x) => x.nonce_digest === a["p_nonce_digest"] && !x.continued_at && !x.discarded_at);
          if (r) r.discarded_at = t;
          return ok(!!r);
        }
        case "genesis_web_handoff_bind_session": {
          const r = rows.find(
            (x) => x.nonce_digest === a["p_nonce_digest"] && x.user_id === a["p_user_id"] && !x.web_session_id && x.continued_at !== null && x.continued_at > t - 120_000,
          );
          if (r) r.web_session_id = a["p_session_id"] as string;
          return ok(!!r);
        }
        case "genesis_web_handoff_revoke_sessions": {
          let n = 0;
          for (const r of rows) {
            if (r.user_id === a["p_user_id"] && r.source_session_id === a["p_source_session_id"] && r.web_session_id) {
              if (sessions.delete(r.web_session_id)) n++;
              r.web_session_id = null;
            }
          }
          return ok(n);
        }
      }
      return { data: null, error: { message: "unknown" } };
    }),
  };
  return { admin, rpcs, rows, clock, sessions, generateLink };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const quiet = () => {};

describe("mintWebHandoff", () => {
  it("records a digest of a random token and returns the token only in the link's fragment", async () => {
    const { admin, rpcs } = fakeAdmin();
    const log = vi.fn();
    const result = await mintWebHandoff({ admin, userId: ME, path: "/clients/1/forms", webOrigin: "https://app.example.test", sourceSessionId: APP_SESSION, log });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://app.example.test/auth/handoff");
    expect(url.search).toBe("");
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get("t")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fragment.get("next")).toBe("/clients/1/forms");
    expect(rpcs[0]).toEqual({
      fn: "genesis_web_handoff_issue",
      args: {
        p_user_id: ME,
        p_digest: await handoffDigest(token),
        p_path: "/clients/1/forms",
        p_ttl_seconds: 60,
        p_max: 10,
        p_window_seconds: 60,
        p_source_session_id: APP_SESSION,
      },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "web_handoff.minted", userId: ME, path: "/clients/1/forms" }));
  });

  it("refuses an unsafe path before touching the database", async () => {
    const { admin, rpcs } = fakeAdmin();
    for (const path of ["//evil.com", "/\\evil", "javascript:alert(1)", "/%2F%2Fevil.com"]) {
      expect(await mintWebHandoff({ admin, userId: ME, path, webOrigin: "https://app.example.test", log: quiet })).toEqual({ ok: false, reason: "bad_path" });
    }
    expect(rpcs).toEqual([]);
  });

  it("refuses a person without an email, with the signed-out page as a fallback", async () => {
    const { admin, rpcs } = fakeAdmin({ users: { [ME]: null } });
    const result = await mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://app.example.test", log: quiet });
    expect(result).toEqual({ ok: false, reason: "no_email", fallbackUrl: "https://app.example.test/auth/handoff#next=%2Fx" });
    expect(rpcs).toEqual([]);
  });

  it("reports the database's rate limit", async () => {
    const { admin } = fakeAdmin({ issueError: { message: "too many", code: "GS429" } });
    const result = await mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://app.example.test", log: quiet });
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("keeps the lifetime short", async () => {
    const { admin } = fakeAdmin();
    await expect(mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://a.test", ttlSeconds: 3600 })).rejects.toThrow(RangeError);
  });
});

describe("the routes", () => {
  const ORIGIN = "https://app.example.test";
  async function minted(fake = fakeAdmin(), path = "/clients/1/forms") {
    const handoff = createWebHandoff({ admin: fake.admin, log: quiet });
    const res = await handoff.mint(post(`${ORIGIN}/api/auth/handoff`, { path }, { authorization: `Bearer ${APP_JWT}` }));
    const { url } = (await res.json()) as { url: string };
    const token = new URLSearchParams(new URL(url).hash.slice(1)).get("t")!;
    const redeem = async (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
      (await (await handoff.redeem(post(`${ORIGIN}/api/auth/redeem-handoff`, body, headers))).json()) as Record<string, unknown>;
    return { ...fake, handoff, token, redeem };
  }

  it("mint: POST only, and a missing or invalid bearer is refused", async () => {
    const { admin, rpcs } = fakeAdmin();
    const { mint } = createWebHandoff({ admin, log: quiet });
    expect((await mint(new Request(`${ORIGIN}/api/auth/handoff`))).status).toBe(405);
    expect((await mint(post(`${ORIGIN}/h`, { path: "/x" }))).status).toBe(401);
    expect((await mint(post(`${ORIGIN}/h`, { path: "/x" }, { authorization: "Bearer forged" }))).status).toBe(401);
    expect((await mint(post(`${ORIGIN}/h`, { path: "/x" }, { authorization: "Basic good-token" }))).status).toBe(401);
    expect(rpcs).toEqual([]);
  });

  it("mint: the link is for the bearer's own account and app session, whatever the body says", async () => {
    const { admin, rows } = fakeAdmin();
    const res = await createWebHandoff({ admin, log: quiet }).mint(
      post(`${ORIGIN}/h`, { path: "/x", userId: OTHER, email: "other@example.test" }, { authorization: `Bearer ${APP_JWT}` }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(((await res.json()) as { url: string }).url).toMatch(/^https:\/\/app\.example\.test\/auth\/handoff#t=[A-Za-z0-9_-]{43}&next=%2Fx$/);
    expect(rows[0]).toMatchObject({ user_id: ME, source_session_id: APP_SESSION });
  });

  it("mint: 400 for an unsafe path, 409 with a fallback for no email", async () => {
    const { admin } = fakeAdmin({ users: { [ME]: null } });
    const { mint } = createWebHandoff({ admin, webOrigin: "https://web.example.test", log: quiet });
    const auth = { authorization: `Bearer ${APP_JWT}` };
    expect((await mint(post("https://api.example.test/h", { path: "//evil.com" }, auth))).status).toBe(400);
    const res = await mint(post("https://api.example.test/h", { path: "/x" }, auth));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_email", fallbackUrl: "https://web.example.test/auth/handoff#next=%2Fx" });
  });

  it("claim mints nothing; only Continue calls generateLink, for the handoff's own email", async () => {
    const { token, redeem, generateLink } = await minted();
    const claimed = await redeem({ action: "claim", t: token, currentUserId: OTHER });
    expect(claimed).toMatchObject({ status: "confirm", email: "me@example.test", next: "/clients/1/forms" });
    expect(claimed["continueNonce"]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(claimed).not.toHaveProperty("tokenHash");
    expect(generateLink).not.toHaveBeenCalled();
    const continued = await redeem({ action: "continue", nonce: claimed["continueNonce"] });
    expect(continued).toEqual({ status: "ok", next: "/clients/1/forms", userId: ME, tokenHash: "hash-for-me@example.test" });
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "me@example.test" });
  });

  it("an abandoned page never gets a sign-in token, and Continue after the nonce's 30 seconds is refused", async () => {
    const { token, redeem, generateLink, clock } = await minted();
    const claimed = await redeem({ action: "claim", t: token });
    clock.now += 31_000;
    expect(await redeem({ action: "continue", nonce: claimed["continueNonce"] })).toEqual({ status: "expired" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("Cancel then Continue is refused", async () => {
    const { token, redeem, generateLink } = await minted();
    const claimed = await redeem({ action: "claim", t: token });
    expect(await redeem({ action: "discard", nonce: claimed["continueNonce"] })).toEqual({ status: "discarded" });
    expect(await redeem({ action: "continue", nonce: claimed["continueNonce"] })).toEqual({ status: "expired" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("replays are refused: the link claims once, the nonce continues once", async () => {
    const { token, redeem, generateLink } = await minted();
    const claimed = await redeem({ action: "claim", t: token });
    expect(await redeem({ action: "claim", t: token })).toEqual({ status: "expired" });
    await redeem({ action: "continue", nonce: claimed["continueNonce"] });
    expect(await redeem({ action: "continue", nonce: claimed["continueNonce"] })).toEqual({ status: "expired" });
    expect(generateLink).toHaveBeenCalledTimes(1);
  });

  it("a link older than 60 seconds can't be claimed", async () => {
    const { token, redeem, clock } = await minted();
    clock.now += 61_000;
    expect(await redeem({ action: "claim", t: token })).toEqual({ status: "expired" });
  });

  it("the same person goes straight on, with nothing minted and the nonce burnt", async () => {
    const { token, redeem, generateLink, rows } = await minted();
    expect(await redeem({ action: "claim", t: token, currentUserId: ME })).toEqual({ status: "same_user", next: "/clients/1/forms" });
    expect(generateLink).not.toHaveBeenCalled();
    expect(rows[0]!.discarded_at).not.toBeNull();
  });

  it("re-checks the stored path", async () => {
    const fake = fakeAdmin();
    const { token, redeem, rows } = await minted(fake);
    rows[0]!.path = "//evil.com";
    expect(await redeem({ action: "claim", t: token, currentUserId: ME })).toEqual({ status: "same_user", next: "/" });
  });

  it("bind keeps the verified web session; the app's sign-out ends exactly that one", async () => {
    const { handoff, token, redeem, sessions } = await minted();
    const claimed = await redeem({ action: "claim", t: token });
    await redeem({ action: "continue", nonce: claimed["continueNonce"] });
    expect(await redeem({ action: "bind", nonce: claimed["continueNonce"] }, { authorization: "Bearer forged" })).toEqual({ status: "not_bound" });
    expect(await redeem({ action: "bind", nonce: claimed["continueNonce"] }, { authorization: `Bearer ${WEB_JWT}` })).toEqual({ status: "bound" });
    expect((await handoff.signOut(post(`${ORIGIN}/api/auth/handoff-signout`, {}))).status).toBe(401);
    const res = await handoff.signOut(post(`${ORIGIN}/api/auth/handoff-signout`, {}, { authorization: `Bearer ${APP_JWT}` }));
    expect(await res.json()).toEqual({ status: "signed_out", count: 1 });
    expect(sessions.has(WEB_SESSION)).toBe(false);
    expect(sessions.has(APP_SESSION)).toBe(true);
  });

  it("redeem: POST JSON only", async () => {
    const { admin, rpcs } = fakeAdmin();
    const { redeem } = createWebHandoff({ admin, log: quiet });
    expect((await redeem(new Request(`${ORIGIN}/r`))).status).toBe(405);
    const form = new Request(`${ORIGIN}/r`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "t=x" });
    expect(await (await redeem(form)).json()).toEqual({ status: "expired" });
    expect(rpcs).toEqual([]);
  });

  it("logs never carry a token, a nonce or Supabase's token hash", async () => {
    const events: WebHandoffLogEvent[] = [];
    const fake = fakeAdmin();
    const handoff = createWebHandoff({ admin: fake.admin, log: (e) => events.push(e) });
    const res = await handoff.mint(post(`${ORIGIN}/h`, { path: "/x" }, { authorization: `Bearer ${APP_JWT}` }));
    const token = new URLSearchParams(new URL(((await res.json()) as { url: string }).url).hash.slice(1)).get("t")!;
    const claimed = (await (await handoff.redeem(post(`${ORIGIN}/r`, { action: "claim", t: token }))).json()) as { continueNonce: string };
    await handoff.redeem(post(`${ORIGIN}/r`, { action: "continue", nonce: claimed.continueNonce }));
    const logged = JSON.stringify(events);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(claimed.continueNonce);
    expect(logged).not.toContain("hash-for");
    expect(logged).not.toContain("me@example.test");
  });
});

describe("takeWebHandoffFragment", () => {
  afterEach(() => forgetWebHandoffFragment());

  const fakeWindow = (hash: string) => {
    const location = { hash, pathname: "/auth/handoff", search: "" };
    const history = {
      state: { key: "k" },
      replaceState: vi.fn((_: unknown, __: string, url?: string | null) => {
        location.hash = url?.includes("#") ? url.slice(url.indexOf("#")) : "";
      }),
    };
    return { location, history };
  };

  it("reads the token and next, then drops the fragment from the address and history", () => {
    const win = fakeWindow("#t=abc&next=%2Fclients%2F1");
    expect(takeWebHandoffFragment(win)).toEqual({ token: "abc", next: "/clients/1" });
    expect(win.history.replaceState).toHaveBeenCalledWith({ key: "k" }, "", "/auth/handoff");
    expect(win.location.hash).toBe("");
    // A later call (the page, after the early call) gets what the first read.
    expect(takeWebHandoffFragment(win)).toEqual({ token: "abc", next: "/clients/1" });
  });

  it("drops an unsafe next", () => {
    expect(takeWebHandoffFragment(fakeWindow("#t=abc&next=%2F%2Fevil.com"))).toEqual({ token: "abc", next: "/" });
  });

  it("is null without a fragment", () => {
    expect(takeWebHandoffFragment(fakeWindow(""))).toBeNull();
  });
});


describe("completeWebHandoff", () => {
  const ORIGIN = "https://app.example.test";
  const revoked = new Set<string>();
  function fakeSupabase(signedIn: { id: string; email: string } | null, verifiedAs: string | null = ME) {
    const calls: string[] = [];
    const supabase: WebHandoffAuthClient = {
      auth: {
        getSession: async () => ({ data: { session: signedIn ? { access_token: "old", user: signedIn } : null } }),
        getUser: async () =>
          signedIn && !revoked.has(signedIn.id) ? { data: { user: signedIn }, error: null } : { data: { user: null }, error: { message: "session_not_found" } },
        signOut: vi.fn(async (o: { scope: "local" }) => {
          calls.push(`signOut:${o.scope}`);
          return { error: null };
        }),
        verifyOtp: vi.fn(async (p: { token_hash: string; type: "email" }) => {
          calls.push(`verifyOtp:${p.type}:${p.token_hash}`);
          return verifiedAs
            ? { data: { user: { id: verifiedAs }, session: { access_token: WEB_JWT } }, error: null }
            : { data: null, error: { message: "Token has expired or is invalid" } };
        }),
      },
    };
    return { supabase, calls };
  }
  async function setup(signedIn: { id: string; email: string } | null, verifiedAs: string | null = ME) {
    const fake = fakeAdmin();
    const handoff = createWebHandoff({ admin: fake.admin, log: quiet });
    const res = await handoff.mint(post(`${ORIGIN}/h`, { path: "/clients/1" }, { authorization: `Bearer ${APP_JWT}` }));
    const token = new URLSearchParams(new URL(((await res.json()) as { url: string }).url).hash.slice(1)).get("t")!;
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string) as Record<string, unknown>);
      return handoff.redeem(new Request(`${ORIGIN}/api/auth/redeem-handoff`, init));
    });
    return { ...fake, ...fakeSupabase(signedIn, verifiedAs), fetch: fetch as unknown as typeof globalThis.fetch, bodies, fragment: { token, next: "/clients/1" } };
  }

  it("asks first when nobody is signed in; Continue mints, exchanges and binds the session", async () => {
    const s = await setup(null);
    const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
    expect(step).toMatchObject({ kind: "confirm", email: "me@example.test", signedInAs: null });
    expect(s.generateLink).not.toHaveBeenCalled();
    expect(s.calls).toEqual([]);
    if (step.kind !== "confirm") return;
    expect(await step.continue()).toEqual({ kind: "done", next: "/clients/1" });
    expect(s.calls).toEqual(["verifyOtp:email:hash-for-me@example.test"]);
    expect(s.bodies.map((b) => b["action"])).toEqual(["claim", "continue", "bind"]);
    expect(s.rows[0]!.web_session_id).toBe(WEB_SESSION);
  });

  it("signs a different person out locally before exchanging, only after Continue", async () => {
    const s = await setup({ id: OTHER, email: "other@example.test" });
    const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
    expect(step).toMatchObject({ kind: "confirm", signedInAs: "other@example.test" });
    expect(s.calls).toEqual([]);
    if (step.kind !== "confirm") return;
    await step.continue();
    expect(s.calls).toEqual(["signOut:local", "verifyOtp:email:hash-for-me@example.test"]);
  });

  it("Cancel burns the nonce, mints nothing and signs another person out, so nobody is left in as them", async () => {
    const s = await setup({ id: OTHER, email: "other@example.test" });
    const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
    if (step.kind !== "confirm") throw new Error("expected confirm");
    expect(await step.cancel()).toEqual({ kind: "cancelled", next: "/clients/1", signedOut: true });
    expect(s.calls).toEqual(["signOut:local"]);
    expect(s.generateLink).not.toHaveBeenCalled();
    // The step settles once: Continue afterwards returns the same cancelled step.
    expect(await step.continue()).toEqual({ kind: "cancelled", next: "/clients/1", signedOut: true });
  });

  it("goes straight on when already signed in as that person", async () => {
    const s = await setup({ id: ME, email: "me@example.test" });
    expect(await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch })).toEqual({ kind: "done", next: "/clients/1" });
    expect(s.bodies[0]).toMatchObject({ action: "claim", currentUserId: ME });
    expect(s.calls).toEqual([]);
    expect(s.generateLink).not.toHaveBeenCalled();
  });

  it("fails plainly, keeping next, when the link is used or missing", async () => {
    const s = await setup(null);
    await completeWebHandoff({ supabase: s.supabase, fragment: { ...s.fragment }, fetch: s.fetch });
    expect(await completeWebHandoff({ supabase: s.supabase, fragment: { ...s.fragment }, fetch: s.fetch })).toEqual({
      kind: "failed",
      reason: "expired",
      next: "/clients/1",
    });
    expect(await completeWebHandoff({ supabase: s.supabase, fragment: { token: null, next: "/x" } })).toEqual({ kind: "failed", reason: "missing", next: "/x" });
  });

  it("Continue after the nonce's life fails as expired, with nobody signed out", async () => {
    const s = await setup({ id: OTHER, email: "other@example.test" });
    const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
    if (step.kind !== "confirm") throw new Error("expected confirm");
    s.clock.now += 31_000;
    expect(await step.continue()).toEqual({ kind: "failed", reason: "expired", next: "/clients/1" });
    expect(s.calls).toEqual([]);
    expect(s.generateLink).not.toHaveBeenCalled();
  });

  it("reports a failed exchange, leaving nobody signed in", async () => {
    const s = await setup({ id: OTHER, email: "o@x.test" }, null);
    const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
    if (step.kind !== "confirm") throw new Error("expected confirm");
    expect(await step.continue()).toEqual({ kind: "failed", reason: "verify_failed", next: "/clients/1" });
    expect(s.calls[0]).toBe("signOut:local");
  });

  it("treats a session ended elsewhere as nobody, and clears it", async () => {
    revoked.add(OTHER);
    try {
      const s = await setup({ id: OTHER, email: "other@example.test" });
      const step = await completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch });
      expect(step).toMatchObject({ kind: "confirm", signedInAs: null });
      expect(s.calls).toEqual(["signOut:local"]);
      expect(s.bodies[0]).toMatchObject({ currentUserId: null });
    } finally {
      revoked.clear();
    }
  });

  it("claims a fragment once, however often it is called", async () => {
    const s = await setup(null);
    const [a, b] = await Promise.all([
      completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch }),
      completeWebHandoff({ supabase: s.supabase, fragment: s.fragment, fetch: s.fetch }),
    ]);
    expect(a).toBe(b);
    expect(s.bodies).toHaveLength(1);
  });
});
