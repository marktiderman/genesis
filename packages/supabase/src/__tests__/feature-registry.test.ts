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
    await syncFeatureRegistry(client, document, { version: 200 });
    expect(rpc.mock.calls[1]![1]?.hash).toBe(args?.hash);
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
