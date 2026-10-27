// @feat:product-releases
import { describe, expect, it, vi } from "vitest";
import { defineNotifications } from "@marktiderman/genesis-notifications";
import { cancelNotification, notify } from "@marktiderman/genesis-notifications/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOTIFY_BATCH, PRODUCT_SHIPPED_TYPE, cancelShipped, isAppPath, notifyShipped, productNotifications, shippedKey } from "../index";
import * as server from "../server";

const U1 = "aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb";
const U2 = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
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

  it("drops a stored link that isn't a path on the app, as the runner's push and email do", () => {
    for (const url of ["https://app.example.com/x", "javascript:alert(1)", "//evil.example", "whats-new"]) {
      expect(registry.render(PRODUCT_SHIPPED_TYPE, { featureName: "Export", url }).url).toBeUndefined();
    }
  });

  it("imports nothing: the registry is loaded on the web and the phone", () => {
    expect(readFileSync(join(__dirname, "..", "notifications.ts"), "utf8")).not.toMatch(/^\s*(import|export)\b[^\n]*\bfrom\s/m);
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
      recipients: [U1, { userId: U1.toUpperCase() }, { email: "Sam@Example.com" }, { email: "sam@example.com", name: "Sam" }, U2],
      url: "/whats-new",
      tenantId: TENANT,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe("genesis_notify");
    expect(calls[0]!.args).toMatchObject({
      p_type: "product.idea_shipped",
      p_idempotency_key: "shipped:2026-10-26:export",
      p_tenant_id: TENANT,
      p_data: { release: "2026-10-26", featureId: "export", featureName: "Export", change: "live", tagline: "Download everything as a spreadsheet.", url: "/whats-new" },
    });
    // The same person twice (a user id as a string and as an object, an email in two cases) is one recipient.
    expect(calls[0]!.args.p_recipients).toHaveLength(3);
  });

  it("refuses a link the notifier would drop, before sending anything", async () => {
    const send = vi.fn(async () => []);
    for (const url of ["https://app.example.com/x", "javascript:alert(1)", "//evil.example", "whats-new", "/a b", "/a\\b"]) {
      expect(isAppPath(url)).toBe(false);
      await expect(notifyShipped(send, { release: "r1", feature, recipients: [U1], url })).rejects.toThrow(/isn't a path on the app/);
    }
    expect(isAppPath("/whats-new?from=push")).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("batches at notify()'s own limit: 1,001 recipients through the real notify() is two calls", async () => {
    const { client, calls } = rpcClient();
    const recipients = Array.from({ length: NOTIFY_BATCH + 1 }, (_, i) => ({ email: `p${i}@example.com` }));
    await notifyShipped((input) => notify(client, input, { registry }), { release: "r1", feature, recipients });
    expect(calls.map((c) => (c.args.p_recipients as unknown[]).length)).toEqual([1000, 1]);
  });

  it("stores the trimmed feature id, as in the key", async () => {
    const send = vi.fn(async (input: unknown) => input);
    await notifyShipped(send, { release: "r1", feature: { id: " export ", name: "Export" }, recipients: [U1] });
    expect(send.mock.calls[0]![0]).toMatchObject({ idempotencyKey: "shipped:r1:export", data: { featureId: "export" } });
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
    // "a:b" + "c" would collide with "a" + "b:c".
    expect(() => shippedKey("a:b", "c")).toThrow(/can't contain/);
    expect(() => shippedKey("a", "b:c")).toThrow(/can't contain/);
  });
});

describe("cancelShipped", () => {
  it("archives the feed rows by default", async () => {
    const cancel = vi.fn(async (input: unknown) => input);
    await cancelShipped(cancel, { release: "r1", featureId: "export" });
    expect(cancel.mock.calls[0]![0]).toEqual({ type: "product.idea_shipped", idempotencyKey: "shipped:r1:export", archive: true });
  });

  it("cancels by the same key through the real cancelNotification()", async () => {
    const { client, calls } = rpcClient();
    const result = await cancelShipped((input) => cancelNotification(client, input), { release: "2026-10-26", featureId: "export", tenantId: TENANT, archive: true });
    expect(result).toEqual({ cancelled: 2, archived: 0 });
    expect(calls[0]).toEqual({
      fn: "genesis_notifications_cancel",
      args: { p_type: "product.idea_shipped", p_idempotency_key: "shipped:2026-10-26:export", p_tenant_id: TENANT, p_recipients: null, p_archive: true },
    });
  });
});
