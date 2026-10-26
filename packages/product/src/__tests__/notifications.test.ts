// @feat:product-releases
import { describe, expect, it, vi } from "vitest";
import { defineNotifications } from "@marktiderman/genesis-notifications";
import { cancelNotification, notify } from "@marktiderman/genesis-notifications/server";
import { PRODUCT_SHIPPED_TYPE, cancelShipped, notifyShipped, productNotifications, shippedKey } from "../index";
import * as server from "../server";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const feature = { id: "export", name: "Export", tagline: "Download everything as a spreadsheet." };

/** The app's registry, with the fragment spread in beside its own category. */
const registry = defineNotifications({
  categories: { messages: { label: "Messages" }, ...productNotifications.categories },
  types: {
    "chat.message": { category: "messages", channels: { in_app: true }, render: () => ({ title: "m" }) },
    ...productNotifications.types,
  },
});

/** An RpcClient that records each call and answers like genesis_notify. */
function rpcClient() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === "genesis_notify") return { data: [{ notification_id: "n1", recipient_key: "u1", created: true }], error: null };
        return { data: [{ cancelled: 2, archived: 0 }], error: null };
      },
    },
  };
}

describe("productNotifications (the fragment the app composes)", () => {
  it("is a valid defineNotifications fragment: product_updates, not critical, not transactional", () => {
    const row = registry.toTypeRows().find((r) => r.key === PRODUCT_SHIPPED_TYPE);
    expect(row).toMatchObject({ category: "product_updates", critical: false, transactional: false });
    expect(registry.isCritical(PRODUCT_SHIPPED_TYPE)).toBe(false);
    // Preferences can turn it off: the matrix offers its channels under its own category.
    expect(registry.matrix().find((m) => m.id === "product_updates")).toMatchObject({ critical: false, defaults: { in_app: true, email: true, push: false } });
  });

  it("renders a title, a body and a url", () => {
    expect(registry.render(PRODUCT_SHIPPED_TYPE, { featureName: "Export", change: "live", release: "2026-10-26", tagline: "Download it all.", url: "/whats-new" })).toEqual({
      title: "Export has shipped",
      body: "Download it all.",
      url: "/whats-new",
    });
    expect(registry.render(PRODUCT_SHIPPED_TYPE, { featureName: "Export", change: "beta", release: "2026-10-26" })).toEqual({
      title: "Export is in beta",
      body: "You asked for it, and it's in release 2026-10-26.",
    });
    expect(registry.render(PRODUCT_SHIPPED_TYPE, {}).title).toBe("Something you asked for has shipped");
  });

  it("is exported from /server too, the same objects", () => {
    expect(server.productNotifications).toBe(productNotifications);
    expect(server.notifyShipped).toBe(notifyShipped);
  });
});

describe("notifyShipped", () => {
  it("sends one notify per feature to every asker, keyed shipped:<release>:<feature>, through the real notify()", async () => {
    const { client, calls } = rpcClient();
    await notifyShipped((input) => notify(client, input, { registry }), {
      release: "2026-10-26",
      feature,
      recipients: [U1, { userId: U1 }, { email: "Sam@Example.com" }, { email: "sam@example.com", name: "Sam" }, U2],
      url: "/whats-new",
      tenantId: "t1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe("genesis_notify");
    expect(calls[0]!.args).toMatchObject({
      p_type: "product.idea_shipped",
      p_idempotency_key: "shipped:2026-10-26:export",
      p_tenant_id: "t1",
      p_data: { release: "2026-10-26", featureId: "export", featureName: "Export", change: "live", tagline: "Download everything as a spreadsheet.", url: "/whats-new" },
    });
    // The same person twice (a user id as a string and as an object, an email in two cases) is one recipient.
    expect(calls[0]!.args.p_recipients).toHaveLength(3);
  });

  it("calls nothing when nobody asked", async () => {
    const send = vi.fn(async () => []);
    expect(await notifyShipped(send, { release: "r1", feature, recipients: [] })).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends 1,000 recipients a call (notify's limit), every call with the same key", async () => {
    const send = vi.fn(async (input: { recipients: unknown[]; idempotencyKey: string }) => input.recipients.length);
    const recipients = Array.from({ length: 2500 }, (_, i) => ({ email: `p${i}@example.com` }));
    expect(await notifyShipped(send, { release: "r1", feature, recipients })).toEqual([1000, 1000, 500]);
    expect(new Set(send.mock.calls.map(([input]) => input.idempotencyKey))).toEqual(new Set(["shipped:r1:export"]));
  });

  it("uses the summary when there's no tagline, and beta when asked", async () => {
    const send = vi.fn(async (input: unknown) => input);
    await notifyShipped(send, { release: "r1", feature: { id: "f", name: "F", summary: "The summary." }, recipients: ["u"], change: "beta" });
    expect(send.mock.calls[0]![0]).toMatchObject({ data: { tagline: "The summary.", change: "beta" }, idempotencyKey: "shipped:r1:f" });
  });

  it("refuses a missing release or feature id, and a key over 200 characters", () => {
    expect(() => shippedKey(" ", "f")).toThrow(/required/);
    expect(() => shippedKey("r", "")).toThrow(/required/);
    expect(() => shippedKey("r".repeat(200), "f")).toThrow(/too long/);
    expect(shippedKey(" r1 ", "f")).toBe("shipped:r1:f");
  });
});

describe("cancelShipped", () => {
  it("cancels by the same key through the real cancelNotification()", async () => {
    const { client, calls } = rpcClient();
    const result = await cancelShipped((input) => cancelNotification(client, input), { release: "2026-10-26", featureId: "export", tenantId: "t1", archive: true });
    expect(result).toEqual({ cancelled: 2, archived: 0 });
    expect(calls[0]).toEqual({
      fn: "genesis_notifications_cancel",
      args: { p_type: "product.idea_shipped", p_idempotency_key: "shipped:2026-10-26:export", p_tenant_id: "t1", p_recipients: null, p_archive: true },
    });
  });
});
