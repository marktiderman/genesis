// @feat:widgets
/**
 * defineWidget: a tile fed by a view. Checked against the view, frozen, and turned into the
 * reads both platforms make.
 */
import { describe, expect, it } from "vitest";

import {
  defineView,
  defineWidget,
  isWidget,
  resolveChartSeries,
  resolveProgress,
  resolveStreak,
  resolveWidgetAccess,
  resolveWidgetRequest,
  toWidgetText,
  ViewDefinitionError,
  type ChartWidget,
} from "../resource-view";
import type { ResourceContract } from "../schema/types";

type DealRow = { id: string; org_id: string; title: string; stage: "open" | "won" | "lost"; amount: number | null; margin: number | null; closed_on: string | null };

const deals = {
  name: "public.deals",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["open", "won", "lost"] },
    { name: "amount", type: "number", nullable: true },
    { name: "margin", type: "number", nullable: true, permissions: { read: false } },
    { name: "closed_on", type: "datetime", dbType: "date", nullable: true },
  ],
} as const satisfies ResourceContract<DealRow>;

const dealsView = defineView(deals, {
  scope: ["org_id"],
  presets: { open: { filter: { stage: "open" } }, won: { filter: { stage: "won" } } },
  orderBy: { field: "closed_on", direction: "desc" },
});

describe("defineWidget", () => {
  it("returns the widget frozen and marked", () => {
    const w = defineWidget({ id: "open", kind: "number", label: "Open deals", view: dealsView, preset: "open" });
    expect(Object.isFrozen(w)).toBe(true);
    expect(isWidget(w)).toBe(true);
    expect(isWidget({ id: "x" })).toBe(false);
  });

  it("names every problem against the view", () => {
    let error: unknown;
    try {
      defineWidget({ id: "1bad", kind: "number", label: "", view: dealsView, preset: "nope", metric: { fn: "sum", field: "price" } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ViewDefinitionError);
    const problems = (error as ViewDefinitionError).problems.join(" | ");
    expect(problems).toMatch(/id:/);
    expect(problems).toMatch(/label:/);
    expect(problems).toMatch(/no preset "nope"/);
    expect(problems).toMatch(/"price" isn't a field/);
  });

  it("checks each kind's own fields", () => {
    expect(() => defineWidget({ id: "s", kind: "streak", label: "S", view: dealsView, dateField: "when" })).toThrow(/dateField/);
    expect(() => defineWidget({ id: "l", kind: "list", label: "L", view: dealsView, limit: 99 })).toThrow(/limit/);
    expect(() => defineWidget({ id: "c", kind: "chart", label: "C", view: dealsView, groupBy: "colour" })).toThrow(/groupBy/);
    expect(() => defineWidget({ id: "p", kind: "progress", label: "P", view: dealsView, goal: 0 })).toThrow(/goal/);
  });
});

describe("resolveWidgetRequest", () => {
  it("asks for a total over the preset, the scope and the widget's filter", () => {
    const w = defineWidget({ id: "v", kind: "number", label: "Pipeline", view: dealsView, preset: "open", filter: { title: "Big" }, metric: { fn: "sum", field: "amount" } });
    const request = resolveWidgetRequest(w, { orgId: "o1" });
    expect(request.filters).toEqual([
      { field: "stage", operator: "eq", value: "open" },
      { field: "org_id", operator: "eq", value: "o1" },
      { field: "title", operator: "eq", value: "Big" },
    ]);
    expect(request.aggregate).toEqual({ metrics: { value: { fn: "sum", field: "amount" } }, filters: request.filters });
    expect(request.rows).toBeUndefined();
  });

  it("measures progress against a goal over the scope only", () => {
    const w = defineWidget({ id: "p", kind: "progress", label: "Won", view: dealsView, preset: "won", goal: { fn: "count" } });
    const request = resolveWidgetRequest(w, { org_id: "o1" });
    expect(request.goal).toEqual({ metrics: { goal: { fn: "count" } }, filters: [{ field: "org_id", operator: "eq", value: "o1" }] });
  });

  it("reads a few rows for a list, in the view's order", () => {
    const w = defineWidget({ id: "l", kind: "list", label: "Recent", view: dealsView });
    expect(resolveWidgetRequest(w).rows).toEqual({ perPage: 5, sort: { field: "closed_on", order: "desc" } });
  });
});

describe("resolveWidgetAccess", () => {
  it("hides a widget over a field the viewer can't read, then asks the widget's own can", () => {
    const margin = defineWidget({ id: "m", kind: "number", label: "Margin", view: dealsView, metric: { fn: "avg", field: "margin" } });
    expect(resolveWidgetAccess(margin)).toMatch(/can't see margin/);
    const guarded = defineWidget({ id: "g", kind: "number", label: "G", view: dealsView, can: () => "Admins only" });
    expect(resolveWidgetAccess(guarded)).toBe("Admins only");
    expect(resolveWidgetAccess(defineWidget({ id: "o", kind: "number", label: "O", view: dealsView }))).toBe(true);
  });
});

describe("resolveStreak", () => {
  it("counts days in a row up to today, or yesterday while today is open", () => {
    const days = ["2026-11-13", "2026-11-12", "2026-11-11", "2026-11-09"];
    expect(resolveStreak(days, { today: "2026-11-13", timeZone: "UTC" })).toEqual({ current: 3, today: true, unit: "day" });
    expect(resolveStreak(days.slice(1), { today: "2026-11-13", timeZone: "UTC" })).toEqual({ current: 2, today: false, unit: "day" });
    expect(resolveStreak(["2026-11-10"], { today: "2026-11-13", timeZone: "UTC" }).current).toBe(0);
  });

  it("counts weeks, and reads timestamps in the zone", () => {
    expect(resolveStreak(["2026-11-13T23:30:00Z", "2026-11-04", "2026-10-28"], { unit: "week", today: "2026-11-13", timeZone: "UTC" }).current).toBe(3);
    // 23:30 UTC on the 12th is the 13th in Auckland.
    expect(resolveStreak(["2026-11-12T23:30:00Z"], { today: "2026-11-13", timeZone: "Pacific/Auckland" }).today).toBe(true);
  });
});

describe("resolveChartSeries", () => {
  it("draws a bar per value, in the field's choice order, with words for each", () => {
    const w = defineWidget({ id: "c", kind: "chart", label: "By stage", view: dealsView, groupBy: "stage", metric: { fn: "sum", field: "amount" } });
    const series = resolveChartSeries(w as ChartWidget, [
      { stage: "won", amount: 5 },
      { stage: "open", amount: 2 },
      { stage: "open", amount: 3 },
      { stage: null, amount: 1 },
    ]);
    expect(series).toEqual([
      { key: "open", label: "Open", value: 5 },
      { key: "won", label: "Won", value: 5 },
      { key: "(none)", label: "None", value: 1 },
    ]);
  });
});

describe("toWidgetText and resolveProgress", () => {
  it("formats numbers, percents, currencies and empty values", () => {
    expect(toWidgetText(1234.567, "number", "en-US")).toBe("1,234.57");
    expect(toWidgetText(1234, "compact", "en-US")).toBe("1.2K");
    expect(toWidgetText(0.42, "percent", "en-US")).toBe("42%");
    expect(toWidgetText(12, { currency: "USD" }, "en-US")).toBe("$12.00");
    expect(toWidgetText(null)).toBe("—");
    expect(toWidgetText(3, (n) => `${n} days`)).toBe("3 days");
  });

  it("is a fraction of the goal, or null without one", () => {
    expect(resolveProgress(3, 4)).toBe(0.75);
    expect(resolveProgress(5, 4)).toBe(1.25);
    expect(resolveProgress(3, 0)).toBeNull();
    expect(resolveProgress(null, 4)).toBeNull();
  });
});
