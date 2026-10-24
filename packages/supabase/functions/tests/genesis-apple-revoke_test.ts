// Deno test for the genesis-apple-revoke function's handler, in the runtime it
// deploys to (WebCrypto, fetch, Request). Apple and the database are faked.
//   deno test functions/tests/genesis-apple-revoke_test.ts
import { handle, type DueRevocation, type HandlerDeps } from "../genesis-apple-revoke/handler.ts";
import { decodeJwtPayload } from "../genesis-apple-revoke/apple.ts";

function assertEquals(actual: unknown, expected: unknown, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
const env: Record<string, string> = { APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_PRIVATE_KEY: pem, APPLE_CLIENT_IDS: "com.example.app" };
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function deps(queue: DueRevocation[], forms: Record<string, string>[]): HandlerDeps & { saved: unknown[][]; done: number[] } {
  const saved: unknown[][] = [];
  const done: number[] = [];
  return {
    saved,
    done,
    env: (n) => env[n],
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const form = Object.fromEntries(new URLSearchParams(String(init?.body)));
      forms.push({ url: String(url), ...form });
      if (String(url).endsWith("/auth/token")) {
        const id_token = `${b64({ alg: "RS256" })}.${b64({ iss: "https://appleid.apple.com", aud: "com.example.app", sub: "apple-sub" })}.sig`;
        return new Response(JSON.stringify({ refresh_token: "rt", id_token }), { status: 200 });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch,
    getUser: async (t) => (t === "access" ? { id: "user-1", appleUserIds: ["apple-sub"] } : null),
    store: {
      save: async (...args) => {
        saved.push(args);
        return "stored";
      },
      claim: async () => queue.splice(0),
      done: async (id) => void done.push(id),
      failed: async () => "retry" as const,
    },
    log: () => {},
  };
}

const post = (body: unknown, token?: string) =>
  new Request("http://localhost/functions/v1/genesis-apple-revoke", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });

Deno.test("store exchanges the code with a signed client secret and saves the token", async () => {
  const forms: Record<string, string>[] = [];
  const d = deps([], forms);
  const res = await handle(post({ action: "store", code: "code-1" }, "access"), d);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(d.saved, [["user-1", "com.example.app", "rt"]]);
  const secret = forms[0]!.client_secret!;
  const [h, p, s] = secret.split(".");
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pair.publicKey,
    Uint8Array.from(atob(s!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(`${h}.${p}`),
  );
  assertEquals(ok, true, "client secret signature");
  assertEquals(decodeJwtPayload(secret)?.sub, "com.example.app");
});

Deno.test("revoke works through the queue with no caller", async () => {
  const forms: Record<string, string>[] = [];
  const d = deps([{ id: 9, client_id: "com.example.app", refresh_token: "queued-rt", attempts: 1 }], forms);
  const res = await handle(post({ action: "revoke" }), d);
  assertEquals(res.status, 200);
  // First the proof (the token is live with these secrets), then the revocation.
  assertEquals(forms[0]!.grant_type, "refresh_token");
  assertEquals(forms[1]!.url, "https://appleid.apple.com/auth/revoke");
  assertEquals(forms[1]!.token_type_hint, "refresh_token");
  assertEquals(d.done, [9]);
});
