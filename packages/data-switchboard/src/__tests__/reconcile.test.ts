// =====================================================================
// Reconciliation — drift report (resource across two Levels) + promote.
// =====================================================================

import { describe, expect, it } from "vitest";
import { CodeAdapter, Registry, driftReport, promote, ticketsContract } from "../index";

function adapterAtLevel(
  level: "L1" | "L2" | "L3",
  kind: "code" | "airtable" | "supabase",
  rows: Record<string, unknown>[],
) {
  const a = new CodeAdapter({ fixtures: { tickets: rows } });
  Object.defineProperty(a, "level", { value: level });
  Object.defineProperty(a, "kind", { value: kind });
  return a;
}

describe("driftReport — same resource across two Levels", () => {
  const registry = new Registry().register(ticketsContract);

  it("reports IN SYNC when both Levels match", async () => {
    const rows = [
      { id: "rec1", title: "A", status: "open" },
      { id: "rec2", title: "B", status: "merged" },
    ];
    const from = adapterAtLevel("L2", "airtable", rows);
    const to = adapterAtLevel(
      "L3",
      "supabase",
      rows.map((r) => ({ ...r })),
    );
    const report = await driftReport(registry, "tickets", from, to);
    expect(report.inSync).toBe(true);
    expect(report.baseline).toBe("L2"); // contract sourceOfTruth.
  });

  it("detects ROW drift (a key present in one Level, missing in the other)", async () => {
    const from = adapterAtLevel("L2", "airtable", [
      { id: "rec1", title: "A", status: "open" },
      { id: "rec2", title: "B", status: "open" },
    ]);
    const to = adapterAtLevel("L3", "supabase", [{ id: "rec1", title: "A", status: "open" }]);
    const report = await driftReport(registry, "tickets", from, to);
    expect(report.inSync).toBe(false);
    expect(report.rows).toEqual([{ key: "rec2", in: "L2", missingIn: "L3" }]);
  });

  it("detects VALUE drift on rows present in both Levels", async () => {
    const from = adapterAtLevel("L2", "airtable", [{ id: "rec1", title: "A", status: "open" }]);
    const to = adapterAtLevel("L3", "supabase", [{ id: "rec1", title: "A", status: "merged" }]);
    const report = await driftReport(registry, "tickets", from, to);
    expect(report.values).toEqual([{ key: "rec1", field: "status", fromValue: "open", toValue: "merged" }]);
  });
});

describe("promote — L2 shape → L3 Supabase migration (text only)", () => {
  const registry = new Registry().register(ticketsContract);

  it("emits CREATE TABLE + RLS (user_id = auth.uid()) + updated_at trigger", () => {
    const { sql, table } = promote(registry, "tickets");
    expect(table).toBe("tickets");
    // RLS keyed on user_id = auth.uid() — never org_id.
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("USING (user_id = (SELECT auth.uid()))");
    expect(sql).toContain("WITH CHECK (user_id = (SELECT auth.uid()))");
    expect(sql).not.toContain("org_id");
    // updated_at trigger reuses the shared function.
    expect(sql).toContain("public.update_updated_at_column()");
    // user_id column references auth.users.
    expect(sql).toContain("user_id UUID NOT NULL REFERENCES auth.users(id)");
    // Contract fields became columns. camelCase names are quoted (Postgres
    // folds unquoted identifiers to lowercase), so prNumber → "prNumber".
    expect(sql).toContain("title TEXT");
    expect(sql).toContain('"prNumber" DOUBLE PRECISION');
    // DDL-only by default (no backfill block).
    expect(sql).not.toContain("INSERT INTO");
  });

  it("emits a backfill INSERT when rows are provided", () => {
    const { sql } = promote(registry, "tickets", {
      backfill: [{ id: "rec1", title: "A'B", status: "open", prNumber: 12 }],
    });
    expect(sql).toContain("INSERT INTO public.tickets");
    // String literal is escaped (A'B → A''B).
    expect(sql).toContain("'A''B'");
    expect(sql).toContain("12");
  });
});
