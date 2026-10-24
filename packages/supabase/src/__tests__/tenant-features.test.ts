// @feat:tenant-features @feat:define-block
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveBlocks } from "@marktiderman/genesis-features/blocks";
import {
  SupabaseQueryError,
  accountBlock,
  setTenantFeature,
  tenantFeatureHistory,
  tenantFeatureSettings,
  tenantFeatures,
  tenantFeaturesBlock,
  type TenantFeaturesClient,
} from "../index";

const packageRoot = join(__dirname, "..", "..");

function fakeClient(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => result);
  return { client: { rpc } as TenantFeaturesClient, rpc };
}

describe("tenantFeatures", () => {
  it("reads the ids a tenant turned off, and says every other feature is on", async () => {
    const { client, rpc } = fakeClient({ data: ["billing", "chat"], error: null });
    const features = await tenantFeatures(client, "t1");
    expect(rpc).toHaveBeenCalledWith("tenant_features_off", { tenant: "t1" });
    expect([...features.off]).toEqual(["billing", "chat"]);
    expect(features.isOn("chat")).toBe(false);
    expect(features.isOn("notes")).toBe(true);
  });

  it("throws the refusal rather than reporting everything on", async () => {
    const { client } = fakeClient({ data: null, error: { message: "only members", code: "42501" } });
    const failure = await tenantFeatures(client, "t1").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SupabaseQueryError);
    expect((failure as SupabaseQueryError).code).toBe("42501");
  });
});

describe("setTenantFeature", () => {
  it("calls set_tenant_feature with the migration's argument names", async () => {
    const { client, rpc } = fakeClient({ data: null, error: null });
    await setTenantFeature(client, { tenantId: "t1", featureId: "chat", enabled: false, reason: "Not yet" });
    expect(rpc).toHaveBeenCalledWith("set_tenant_feature", { tenant: "t1", feature: "chat", enabled: false, reason: "Not yet" });
  });

  it("throws the database's code", async () => {
    const { client } = fakeClient({ data: null, error: { message: "say why", code: "22023" } });
    await expect(setTenantFeature(client, { tenantId: "t1", featureId: "chat", enabled: false, reason: "" })).rejects.toMatchObject({ code: "22023" });
  });
});

describe("the admin reads", () => {
  it("passes max_rows only when given", async () => {
    const { client, rpc } = fakeClient({ data: [], error: null });
    await tenantFeatureSettings(client, "t1");
    await tenantFeatureHistory(client, "t1");
    await tenantFeatureHistory(client, "t1", { maxRows: 5 });
    expect(rpc.mock.calls).toEqual([
      ["tenant_feature_settings", { tenant: "t1" }],
      ["tenant_feature_history", { tenant: "t1" }],
      ["tenant_feature_history", { tenant: "t1", max_rows: 5 }],
    ]);
  });
});

describe("the migration", () => {
  const sql = readFileSync(join(packageRoot, "migrations", "0004_genesis_tenant_features.sql"), "utf8");

  it("declares the functions the client calls, with those argument names", () => {
    expect(sql).toContain("function public.set_tenant_feature(tenant uuid, feature text, enabled boolean, reason text)");
    expect(sql).toContain("function public.tenant_features_off(tenant uuid)");
    expect(sql).toContain("function public.tenant_feature_settings(tenant uuid)");
    expect(sql).toContain("function public.tenant_feature_history(tenant uuid, max_rows integer default 100)");
  });

  it("grants and revokes by name, never in bulk, and never grants a private function to anon or public", () => {
    expect(sql).not.toMatch(/on all functions in schema/i);
    expect(sql).not.toMatch(/alter default privileges/i);
    for (const line of sql.split("\n").filter((l) => /^grant .* on function private\./i.test(l))) {
      expect(line).not.toMatch(/\b(anon|public)\b(?!\.)/);
    }
  });
});

describe("the blocks this package declares", () => {
  it("resolve together, and every migration they name ships in the package", () => {
    const resolved = resolveBlocks([accountBlock, tenantFeaturesBlock], undefined, { platform: "native" });
    expect([...resolved.ids]).toEqual(["account", "tenant-features"]);
    for (const m of resolved.migrations) {
      expect(m.package).toBe("@marktiderman/genesis-supabase");
      expect(existsSync(join(packageRoot, m.file)), m.file).toBe(true);
      if (m.test) expect(existsSync(join(packageRoot, m.test)), m.test).toBe(true);
    }
  });
});
