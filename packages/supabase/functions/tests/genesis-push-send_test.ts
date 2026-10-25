// Deno test for the genesis-push-send function's handler, in the runtime it
// deploys to (WebCrypto, fetch, Request, AbortSignal.timeout). Expo and the
// database are faked.
//   deno test functions/tests/genesis-push-send_test.ts
import { handle, type HandlerDeps, type TicketRow } from "../genesis-push-send/handler.ts";

function assertEquals(actual: unknown, expected: unknown, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}

const secret = "x".repeat(32);
const user = "00000000-0000-4000-8000-000000000001";

function deps(sentBodies: unknown[], tickets: TicketRow[]): HandlerDeps {
  return {
    env: (n) => ({ GENESIS_PUSH_SECRET: secret })[n],
    fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as unknown[];
      sentBodies.push(body);
      return new Response(JSON.stringify({ data: body.map((_, i) => ({ status: "ok", id: `t${i}` })) }), { status: 200 });
    }) as typeof fetch,
    store: {
      targets: async () => [{ device_id: "d1", token: "ExponentPushToken[abc]", platform: "ios", hide_previews: true }],
      status: async () => ({ deliver: true, reason: "ok", quiet_until: null }),
      recordTickets: async (rows) => void tickets.push(...rows),
      forgetDevices: async () => {},
      claimReceipts: async () => [],
      settleReceipts: async () => {},
    },
    log: () => {},
  };
}

Deno.test("sends with hidden previews and records the ticket", async () => {
  const sent: unknown[] = [];
  const tickets: TicketRow[] = [];
  const req = new Request("http://localhost", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: JSON.stringify({ action: "send", messages: [{ userId: user, category: "messages", title: "Private title", body: "Private body", url: "/messages/1" }] }),
  });
  const res = await handle(req, deps(sent, tickets));
  assertEquals(res.status, 200);
  assertEquals(sent, [[{ to: "ExponentPushToken[abc]", title: "New notification", data: { category: "messages", url: "/messages/1" }, sound: "default", channelId: "messages", priority: "high" }]]);
  assertEquals(tickets, [{ user_id: user, device_id: "d1", category: "messages", ticket_id: "t0", status: "sent" }]);
});

Deno.test("refuses a caller without the secret", async () => {
  const res = await handle(new Request("http://localhost", { method: "POST", headers: { authorization: "Bearer nope" }, body: "{}" }), deps([], []));
  assertEquals(res.status, 401);
});
