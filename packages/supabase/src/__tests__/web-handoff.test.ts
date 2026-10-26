// @feat:web-handoff
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRelativePath } from "../web-handoff-path";
import { completeWebHandoff, forgetWebHandoffFragment, takeWebHandoffFragment, type WebHandoffAuthClient } from "../web-handoff";
import { createWebHandoff, handoffDigest, mintWebHandoff, redeemWebHandoff, type WebHandoffAdmin, type WebHandoffLogEvent } from "../web-handoff-server";

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

type Rpc = { fn: string; args: Record<string, unknown> };

function fakeAdmin(opts: { users?: Record<string, string | null>; bearer?: Record<string, string>; issueError?: { message: string; code?: string }; redeemRow?: { user_id: string; path: string } | null } = {}) {
  const users = opts.users ?? { [ME]: "me@example.test", [OTHER]: "other@example.test" };
  const rpcs: Rpc[] = [];
  const generated: string[] = [];
  const admin: WebHandoffAdmin = {
    auth: {
      getUser: vi.fn(async (jwt: string) => {
        const id = (opts.bearer ?? { "good-token": ME })[jwt];
        return id ? { data: { user: { id, email: users[id] ?? null } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      }),
      admin: {
        getUserById: vi.fn(async (id: string) =>
          id in users ? { data: { user: { id, email: users[id] ?? null } }, error: null } : { data: { user: null }, error: { message: "not found" } },
        ),
        generateLink: vi.fn(async ({ email }: { type: "magiclink"; email: string }) => {
          generated.push(email);
          return { data: { properties: { hashed_token: `hash-for-${email}` } }, error: null };
        }),
      },
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (fn === "genesis_web_handoff_issue") {
        return opts.issueError ? { data: null, error: opts.issueError } : { data: "2026-01-01T00:01:00Z", error: null };
      }
      if (fn === "genesis_web_handoff_redeem") return { data: opts.redeemRow === null ? [] : [opts.redeemRow ?? { user_id: ME, path: "/clients/1/forms" }], error: null };
      return { data: null, error: { message: "unknown" } };
    }),
  };
  return { admin, rpcs, generated };
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("mintWebHandoff", () => {
  it("records a digest of a random token and returns the token only in the link's fragment", async () => {
    const { admin, rpcs } = fakeAdmin();
    const log = vi.fn();
    const result = await mintWebHandoff({ admin, userId: ME, path: "/clients/1/forms", webOrigin: "https://app.example.test", log });
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
      args: { p_user_id: ME, p_digest: await handoffDigest(token), p_path: "/clients/1/forms", p_ttl_seconds: 60, p_max: 10, p_window_seconds: 60 },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "web_handoff.minted", userId: ME, path: "/clients/1/forms" }));
  });

  it("refuses an unsafe path before touching the database", async () => {
    const { admin, rpcs } = fakeAdmin();
    for (const path of ["//evil.com", "/\\evil", "javascript:alert(1)", "/%2F%2Fevil.com"]) {
      expect(await mintWebHandoff({ admin, userId: ME, path, webOrigin: "https://app.example.test", log: () => {} })).toEqual({ ok: false, reason: "bad_path" });
    }
    expect(rpcs).toEqual([]);
  });

  it("refuses a person without an email, with the signed-out page as a fallback", async () => {
    const { admin, rpcs } = fakeAdmin({ users: { [ME]: null } });
    const result = await mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://app.example.test", log: () => {} });
    expect(result).toEqual({ ok: false, reason: "no_email", fallbackUrl: "https://app.example.test/auth/handoff#next=%2Fx" });
    expect(rpcs).toEqual([]);
  });

  it("reports the database's rate limit", async () => {
    const { admin } = fakeAdmin({ issueError: { message: "too many", code: "GS429" } });
    const result = await mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://app.example.test", log: () => {} });
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("keeps the lifetime short", async () => {
    const { admin } = fakeAdmin();
    await expect(mintWebHandoff({ admin, userId: ME, path: "/x", webOrigin: "https://a.test", ttlSeconds: 3600 })).rejects.toThrow(RangeError);
  });
});

describe("redeemWebHandoff", () => {
  const token = "A".repeat(43);

  it("mints a sign-in token for the handoff's own person, by id, never from the request", async () => {
    const { admin, rpcs, generated } = fakeAdmin();
    const result = await redeemWebHandoff({ admin, token, currentUserId: OTHER, log: () => {} });
    expect(result).toEqual({ status: "confirm", next: "/clients/1/forms", email: "me@example.test", userId: ME, tokenHash: "hash-for-me@example.test" });
    expect(rpcs[0]).toEqual({ fn: "genesis_web_handoff_redeem", args: { p_digest: await handoffDigest(token) } });
    expect(generated).toEqual(["me@example.test"]);
  });

  it("mints nothing when the browser is already that person", async () => {
    const { admin, generated } = fakeAdmin();
    expect(await redeemWebHandoff({ admin, token, currentUserId: ME, log: () => {} })).toEqual({ status: "same_user", next: "/clients/1/forms" });
    expect(generated).toEqual([]);
  });

  it("says expired for a used, old or unknown token, and for a malformed one without asking", async () => {
    const { admin, rpcs, generated } = fakeAdmin({ redeemRow: null });
    expect(await redeemWebHandoff({ admin, token, log: () => {} })).toEqual({ status: "expired" });
    expect(await redeemWebHandoff({ admin, token: "short", log: () => {} })).toEqual({ status: "expired" });
    expect(rpcs).toHaveLength(1);
    expect(generated).toEqual([]);
  });

  it("re-checks the stored path", async () => {
    const { admin } = fakeAdmin({ redeemRow: { user_id: ME, path: "//evil.com" } });
    expect(await redeemWebHandoff({ admin, token, log: () => {} })).toMatchObject({ status: "confirm", next: "/" });
  });
});

describe("createWebHandoff", () => {
  it("mint: POST only", async () => {
    const { admin } = fakeAdmin();
    const res = await createWebHandoff({ admin, log: () => {} }).mint(new Request("https://app.example.test/api/auth/handoff"));
    expect(res.status).toBe(405);
  });

  it("mint: refuses a missing or invalid bearer", async () => {
    const { admin, rpcs } = fakeAdmin();
    const { mint } = createWebHandoff({ admin, log: () => {} });
    expect((await mint(post("https://app.example.test/api/auth/handoff", { path: "/x" }))).status).toBe(401);
    expect((await mint(post("https://app.example.test/api/auth/handoff", { path: "/x" }, { authorization: "Bearer forged" }))).status).toBe(401);
    expect((await mint(post("https://app.example.test/api/auth/handoff", { path: "/x" }, { authorization: "Basic good-token" }))).status).toBe(401);
    expect(rpcs).toEqual([]);
  });

  it("mint: the link is for the bearer's own account, whatever the body says", async () => {
    const { admin, rpcs } = fakeAdmin();
    const res = await createWebHandoff({ admin, log: () => {} }).mint(
      post("https://app.example.test/api/auth/handoff", { path: "/x", userId: OTHER, email: "other@example.test" }, { authorization: "Bearer good-token" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/app\.example\.test\/auth\/handoff#t=[A-Za-z0-9_-]{43}&next=%2Fx$/);
    expect(rpcs[0]!.args["p_user_id"]).toBe(ME);
  });

  it("mint: 400 for an unsafe path, 409 with a fallback for no email", async () => {
    const { admin } = fakeAdmin({ users: { [ME]: null } });
    const { mint } = createWebHandoff({ admin, webOrigin: "https://web.example.test", log: () => {} });
    const auth = { authorization: "Bearer good-token" };
    expect((await mint(post("https://api.example.test/h", { path: "//evil.com" }, auth))).status).toBe(400);
    const res = await mint(post("https://api.example.test/h", { path: "/x" }, auth));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_email", fallbackUrl: "https://web.example.test/auth/handoff#next=%2Fx" });
  });

  it("redeem: POST JSON only", async () => {
    const { admin, rpcs } = fakeAdmin();
    const { redeem } = createWebHandoff({ admin, log: () => {} });
    expect((await redeem(new Request("https://a.test/r"))).status).toBe(405);
    const form = new Request("https://a.test/r", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "t=x" });
    expect(await (await redeem(form)).json()).toEqual({ status: "expired" });
    expect(rpcs).toEqual([]);
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
  function fakeSupabase(signedIn: { id: string; email: string } | null, verifiedAs: string | null = ME) {
    const calls: string[] = [];
    const supabase: WebHandoffAuthClient = {
      auth: {
        getSession: async () => ({ data: { session: signedIn ? { user: signedIn } : null } }),
        signOut: vi.fn(async (o: { scope: "local" }) => {
          calls.push(`signOut:${o.scope}`);
          return { error: null };
        }),
        verifyOtp: vi.fn(async (p: { token_hash: string; type: "email" }) => {
          calls.push(`verifyOtp:${p.type}:${p.token_hash}`);
          return verifiedAs ? { data: { user: { id: verifiedAs } }, error: null } : { data: null, error: { message: "Token has expired or is invalid" } };
        }),
      },
    };
    return { supabase, calls };
  }
  const respond = (body: unknown) => vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
  const confirm = { status: "confirm", next: "/clients/1", email: "me@example.test", userId: ME, tokenHash: "h1" };

  it("asks first when nobody is signed in, then exchanges the token", async () => {
    const { supabase, calls } = fakeSupabase(null);
    const fetch = respond(confirm);
    const step = await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/clients/1" }, fetch });
    expect(step).toMatchObject({ kind: "confirm", email: "me@example.test", signedInAs: null });
    expect(calls).toEqual([]);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ t: "t1", currentUserId: null });
    if (step.kind !== "confirm") return;
    expect(await step.continue()).toEqual({ kind: "done", next: "/clients/1" });
    expect(calls).toEqual(["verifyOtp:email:h1"]);
  });

  it("signs a different person out locally before exchanging, only after Continue", async () => {
    const { supabase, calls } = fakeSupabase({ id: OTHER, email: "other@example.test" });
    const step = await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/" }, fetch: respond(confirm) as unknown as typeof globalThis.fetch });
    expect(step).toMatchObject({ kind: "confirm", signedInAs: "other@example.test" });
    expect(calls).toEqual([]);
    if (step.kind !== "confirm") return;
    await step.continue();
    expect(calls).toEqual(["signOut:local", "verifyOtp:email:h1"]);
  });

  it("goes straight on when already signed in as that person", async () => {
    const { supabase, calls } = fakeSupabase({ id: ME, email: "me@example.test" });
    const fetch = respond({ status: "same_user", next: "/clients/1" });
    expect(await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/" }, fetch })).toEqual({ kind: "done", next: "/clients/1" });
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ t: "t1", currentUserId: ME });
    expect(calls).toEqual([]);
  });

  it("fails plainly, keeping next, when the link is used, expired or missing", async () => {
    const { supabase } = fakeSupabase(null);
    expect(await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/clients/1" }, fetch: respond({ status: "expired" }) as unknown as typeof globalThis.fetch })).toEqual({
      kind: "failed",
      reason: "expired",
      next: "/clients/1",
    });
    expect(await completeWebHandoff({ supabase, fragment: { token: null, next: "/x" } })).toEqual({ kind: "failed", reason: "missing", next: "/x" });
  });

  it("reports a failed exchange, leaving nobody signed in", async () => {
    const { supabase, calls } = fakeSupabase({ id: OTHER, email: "o@x.test" }, null);
    const step = await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/" }, fetch: respond(confirm) as unknown as typeof globalThis.fetch });
    if (step.kind !== "confirm") throw new Error("expected confirm");
    expect(await step.continue()).toEqual({ kind: "failed", reason: "verify_failed", next: "/clients/1" });
    expect(calls[0]).toBe("signOut:local");
  });

  it("re-checks next from the server", async () => {
    const { supabase } = fakeSupabase({ id: ME, email: "me@example.test" });
    expect(await completeWebHandoff({ supabase, fragment: { token: "t1", next: "/safe" }, fetch: respond({ status: "same_user", next: "//evil.com" }) as unknown as typeof globalThis.fetch })).toEqual({
      kind: "done",
      next: "/safe",
    });
  });

  it("redeems a fragment once, however often it is called", async () => {
    const { supabase } = fakeSupabase(null);
    const fetch = respond(confirm);
    const fragment = { token: "t1", next: "/" };
    const [a, b] = await Promise.all([completeWebHandoff({ supabase, fragment, fetch }), completeWebHandoff({ supabase, fragment, fetch })]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("logs never carry a token", async () => {
    const events: WebHandoffLogEvent[] = [];
    const { admin } = fakeAdmin();
    await redeemWebHandoff({ admin, token: "B".repeat(43), log: (e) => events.push(e) });
    expect(JSON.stringify(events)).not.toContain("B".repeat(43));
    expect(JSON.stringify(events)).not.toContain("hash-for");
  });
});
