// @feat:observability
import { describe, expect, it } from "vitest";
import { FILTERED, isSecretKey, scrubEvent, scrubRecord, scrubString, scrubUrl, scrubValue } from "../../observability/scrub";

// A real-shaped Supabase access token (header.payload.signature), not a live one.
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6ImFAYi5jbyJ9.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

describe("scrubString", () => {
  it("replaces email addresses", () => {
    expect(scrubString("sign-in failed for jane.doe+test@example.co.uk at 10:02")).toBe("sign-in failed for [email] at 10:02");
  });

  it("replaces Supabase JWTs (access tokens, legacy anon and service_role keys)", () => {
    expect(scrubString(`refresh failed: ${JWT}`)).toBe("refresh failed: [jwt]");
  });

  it("replaces Supabase API keys", () => {
    expect(scrubString("key sb_secret_AbC123xyz_0987654321 and sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH")).toBe("key [supabase-key] and [supabase-key]");
  });

  it("replaces bearer tokens copied into a message", () => {
    expect(scrubString("Authorization: Bearer abcdefgh12345678.ijk")).toBe("Authorization: Bearer [token]");
  });

  it("replaces tokens in query strings and fragments", () => {
    expect(scrubString("myapp://auth#access_token=abc.def&refresh_token=xyz&type=recovery")).toBe(
      "myapp://auth#access_token=[Filtered]&refresh_token=[Filtered]&type=recovery",
    );
    expect(scrubString("/callback?code=4b7f2&state=ok")).toBe("/callback?code=[Filtered]&state=ok");
  });

  it("cuts the query string of a web URL inside text", () => {
    expect(scrubString("GET https://x.supabase.co/rest/v1/people?id=eq.42&select=* failed")).toBe("GET https://x.supabase.co/rest/v1/people failed");
  });

  it("replaces long hex runs (keys, DSN secrets)", () => {
    expect(scrubString("dsn https://b5d376e70433e6cfa4a3538d0b3f2b26@o1.ingest.sentry.io/2")).not.toContain("b5d376e70433e6cfa4a3538d0b3f2b26");
  });

  it("leaves ordinary text, ids and versions alone", () => {
    const text = "GET /rest/v1/people 404 · 1.4.0 (37) · 3f2a9c1b · user 7d3c8a1e-1111-2222-3333-444455556666";
    expect(scrubString(text)).toBe(text);
  });
});

describe("scrubUrl", () => {
  it("cuts the query string and fragment (PostgREST filters carry record ids)", () => {
    expect(scrubUrl("https://x.supabase.co/rest/v1/people?id=eq.42&select=*#top")).toBe("https://x.supabase.co/rest/v1/people");
  });
});

describe("isSecretKey", () => {
  it("matches header and field names whatever their case or separators", () => {
    for (const key of ["Authorization", "authorization", "apikey", "x-api-key", "Cookie", "set-cookie", "access_token", "refreshToken", "password", "email", "service_role_key"]) {
      expect(isSecretKey(key)).toBe(true);
    }
    for (const key of ["status_code", "method", "url", "route", "userId", "category"]) expect(isSecretKey(key)).toBe(false);
  });
});

describe("scrubValue", () => {
  it("replaces values under secret keys whole, and scrubs nested strings", () => {
    const out = scrubValue({
      headers: { Authorization: `Bearer ${JWT}`, apikey: "sb_publishable_xxxxxxxxxxxx", Accept: "application/json" },
      nested: [{ note: "mail me at a@b.co" }],
      email: "a@b.co",
      count: 3,
    });
    expect(out).toEqual({
      headers: { Authorization: FILTERED, apikey: FILTERED, Accept: "application/json" },
      nested: [{ note: "mail me at [email]" }],
      email: FILTERED,
      count: 3,
    });
  });

  it("cuts absolute URLs under url-like keys at the query string", () => {
    expect(scrubValue({ url: "https://x.supabase.co/rest/v1/notes?person_id=eq.9", to: "/settings?tab=a" })).toEqual({
      url: "https://x.supabase.co/rest/v1/notes",
      to: "/settings?tab=a",
    });
  });

  it("drops query-string, body and cookie fields Sentry carries on their own", () => {
    expect(scrubValue({ "http.query": "id=eq.1", request_body: "{\"email\":\"x\"}", body: "x", method: "GET" })).toEqual({ method: "GET" });
  });

  it("survives cycles and deep nesting", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    let deep: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(scrubValue(a)).toEqual({ name: "a", self: "[Circular]" });
    expect(JSON.stringify(scrubValue(deep))).toContain("[Truncated]");
  });

  it("turns errors into their name and scrubbed message", () => {
    expect(scrubValue(new TypeError(`bad token ${JWT}`))).toEqual({ name: "TypeError", message: "bad token [jwt]" });
  });
});

describe("scrubEvent", () => {
  it("reduces the user to an id and the request to method, URL and scrubbed headers", () => {
    const event = {
      message: "failed for jane@example.com",
      user: { id: "u-1", email: "jane@example.com", username: "jane", ip_address: "1.2.3.4" },
      request: {
        url: "https://x.supabase.co/rest/v1/people?email=eq.jane@example.com",
        method: "POST",
        query_string: "email=eq.jane@example.com",
        cookies: { sid: "abc" },
        data: { password: "hunter2" },
        headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
      },
      exception: { values: [{ type: "Error", value: `JWT expired: ${JWT}` }] },
      breadcrumbs: [{ category: "http", data: { url: "https://x.supabase.co/auth/v1/token?grant_type=refresh_token", "http.query": "a=b" } }],
      extra: { session: { access_token: JWT } },
      tags: { route: "/(app)/settings" },
    };
    const out = scrubEvent(event);
    expect(out).toEqual({
      message: "failed for [email]",
      user: { id: "u-1" },
      request: { url: "https://x.supabase.co/rest/v1/people", method: "POST", headers: { Authorization: FILTERED, "Content-Type": "application/json" } },
      exception: { values: [{ type: "Error", value: "JWT expired: [jwt]" }] },
      breadcrumbs: [{ category: "http", data: { url: "https://x.supabase.co/auth/v1/token" } }],
      extra: { session: FILTERED },
      tags: { route: "/(app)/settings" },
    });
    expect(JSON.stringify(out)).not.toMatch(/jane|hunter2|eyJ/);
  });

  it("removes a user with no id", () => {
    expect(scrubEvent({ user: { email: "a@b.co" } })?.user).toBeNull();
  });

  it("fails closed: a value that throws while being read drops the event", () => {
    const hostile = { get message(): string {
      throw new Error("no");
    } };
    expect(scrubEvent(hostile as never)).toBeNull();
    expect(scrubRecord(hostile)).toBeNull();
  });
});
