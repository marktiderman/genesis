// @feat:feature-mirror
import { describe, expect, it, vi } from "vitest";
import {
  SupabaseQueryError,
  featureGateState,
  syncFeatureRegistry,
  type FeatureRegistryClient,
} from "../index";

function fakeClient(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const rpc = vi.fn(
    async (_fn: string, _args?: Record<string, unknown>) => result,
  );
  return { client: { rpc } as FeatureRegistryClient, rpc };
}

describe("featureGateState", () => {
  it("reads a tenant's switches, entitlements and flag values, shaped for the gate", async () => {
    const { client, rpc } = fakeClient({
      data: {
        off: ["library"],
        entitled: ["webhooks"],
        flags: { "sms.release": true },
      },
      error: null,
    });
    expect(await featureGateState(client, "t1")).toEqual({
      off: ["library"],
      entitlements: ["webhooks"],
      flags: { "sms.release": true },
    });
    expect(rpc).toHaveBeenCalledWith("feature_gate_state", { tenant: "t1" });
  });

  it("names a person for server code", async () => {
    const { client, rpc } = fakeClient({ data: { off: [], entitled: ["classes"], flags: {} }, error: null });
    expect((await featureGateState(client, "t1", { personId: "p1" })).entitlements).toEqual(["classes"]);
    expect(rpc).toHaveBeenCalledWith("feature_gate_state", { tenant: "t1", person: "p1" });
  });

  it("throws on an empty or malformed answer instead of reporting nothing set", async () => {
    for (const data of [null, [], { off: [], entitled: [] }, { off: "x", entitled: [], flags: {} }]) {
      const { client } = fakeClient({ data, error: null });
      await expect(featureGateState(client, "t1")).rejects.toThrow(TypeError);
    }
  });

  it("spreads into a gate context as documented", async () => {
    const { client } = fakeClient({ data: { off: [], entitled: [], flags: { a: true, b: null, c: [1] } }, error: null });
    const state = await featureGateState(client, "t1");
    const context: { platform: "web"; off?: readonly string[]; entitlements?: readonly string[]; flags?: { readonly [name: string]: boolean | string | number | { readonly [key: string]: unknown } | undefined } } = { platform: "web", ...state };
    expect(context.flags).toEqual({ a: true });
  });

  it("throws a refusal rather than reporting nothing set", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "only members", code: "42501" },
    });
    const failure = await featureGateState(client, "t2").catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(SupabaseQueryError);
  });
});

describe("syncFeatureRegistry", () => {
  const document = {
    features: [{ id: "forms", name: "Forms", status: "live" }],
    flags: {
      "forms.release": {
        feature: "forms",
        kind: "release",
        default: true,
        scopes: ["platform"],
      },
    },
  };

  it("sends the features, the flags as rows with their key, the version and a stable hash", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });
    expect(await syncFeatureRegistry(client, document, { version: 100 })).toBe(
      true,
    );
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("sync_feature_registry");
    expect(args).toMatchObject({
      version: 100,
      features: document.features,
      flags: [{ key: "forms.release", feature: "forms" }],
    });
    expect(String(args?.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(args?.allow_shrink).toBe(false);
    // The same registry with keys in another order hashes the same.
    const reordered = {
      flags: {
        "forms.release": {
          scopes: ["platform"],
          default: true,
          kind: "release",
          feature: "forms",
        },
      },
      features: [{ status: "live", name: "Forms", id: "forms" }],
    };
    await syncFeatureRegistry(client, reordered, {
      version: 200,
      allowShrink: true,
    });
    expect(rpc.mock.calls[1]![1]?.hash).toBe(args?.hash);
    expect(rpc.mock.calls[1]![1]?.allow_shrink).toBe(true);
  });

  it("reports an older or unchanged registry as not synced, and refuses a bad version", async () => {
    const { client } = fakeClient({ data: false, error: null });
    expect(await syncFeatureRegistry(client, document, { version: 1 })).toBe(
      false,
    );
    await expect(
      syncFeatureRegistry(client, document, { version: -1 }),
    ).rejects.toThrow(TypeError);
  });
});
