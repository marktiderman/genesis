// @feat:widgets
/**
 * <Widget>: a tile fed by a view. Totals come from the provider in the viewer's scope; the tile
 * owns loading, error and empty; a widget over a field the viewer can't read isn't drawn. The
 * three older tiles (StatCard, HeadlineNumbers, SummaryCard) draw the same tile, unchanged.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockProvider, defineResource, GenesisProvider, ViewerScope, type DataProvider } from "@marktiderman/genesis-core";
import { defineView, defineWidget } from "@marktiderman/genesis-core/resource-view";
import { Widget, WidgetGrid } from "../widget";
import { StatCard } from "../StatCard";
import { HeadlineNumbers } from "../../resource/HeadlineNumbers";
import { SummaryCard } from "../../resource/SummaryCard";
import { DashboardPage } from "../../layout/dashboard-page";

type Deal = { id: string; org_id: string; title: string; stage: "open" | "won"; amount: number | null; margin: number | null; closed_on: string | null };

const deals = defineResource<Deal>()({
  name: "deals",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["open", "won"] },
    { name: "amount", type: "number", nullable: true },
    { name: "margin", type: "number", nullable: true, permissions: { read: false, update: false } },
    { name: "closed_on", type: "datetime", dbType: "date", nullable: true },
  ],
});

const ROWS: Deal[] = [
  { id: "1", org_id: "o1", title: "Harbor", stage: "open", amount: 100, margin: 1, closed_on: null },
  { id: "2", org_id: "o1", title: "Lantern", stage: "open", amount: 250, margin: 1, closed_on: null },
  { id: "3", org_id: "o1", title: "Quarry", stage: "won", amount: 400, margin: 1, closed_on: "2026-11-01" },
  { id: "4", org_id: "o2", title: "Elsewhere", stage: "open", amount: 999, margin: 1, closed_on: null },
];

const view = defineView(deals, { scope: ["org_id"], presets: { open: { filter: { stage: "open" } }, won: { filter: { stage: "won" } } } });

function wrap(provider: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      <ViewerScope viewer="u1" scope={{ orgId: "o1" }}>
        {children}
      </ViewerScope>
    </GenesisProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("<Widget>", () => {
  it("shows a count and a sum over the view's preset, in the viewer's scope", async () => {
    const provider = createMockProvider({ deals: ROWS });
    const spy = vi.spyOn(provider, "aggregate");
    const open = defineWidget({ id: "open", kind: "number", label: "Open deals", view, preset: "open", live: false });
    const pipeline = defineWidget({ id: "pipeline", kind: "number", label: "Pipeline", view, preset: "open", metric: { fn: "sum", field: "amount" }, format: { currency: "USD", maximumFractionDigits: 0 }, live: false });
    render(
      <>
        <Widget widget={open} />
        <Widget widget={pipeline} locale="en-US" />
      </>,
      { wrapper: wrap(provider) },
    );
    await waitFor(() => expect(screen.getByTestId("widget-open").getAttribute("data-state")).toBe("ready"));
    expect(screen.getByTestId("widget-open").textContent).toContain("2");
    await waitFor(() => expect(screen.getByTestId("widget-pipeline").textContent).toContain("$350"));
    expect(screen.getByTestId("widget-open").getAttribute("data-kind")).toBe("number");
    // The scope reached the provider: o2's deal isn't in the total.
    expect(spy.mock.calls[0]![1].filters).toContainEqual({ field: "org_id", operator: "eq", value: "o1" });
  });

  it("shows progress toward a total goal", async () => {
    const won = defineWidget({ id: "won", kind: "progress", label: "Won", view, preset: "won", goal: { fn: "count" }, live: false });
    render(<Widget widget={won} locale="en-US" />, { wrapper: wrap(createMockProvider({ deals: ROWS })) });
    await waitFor(() => expect(screen.getByTestId("widget-won").textContent).toContain("33%"));
    expect(screen.getByTestId("widget-won").textContent).toContain("1 of 3");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("lists a few rows by their names, or says there are none", async () => {
    const recent = defineWidget({ id: "recent", kind: "list", label: "Open", view, preset: "open", limit: 5, live: false });
    const { unmount } = render(<Widget widget={recent} rowHref={(r) => `/deals/${String(r.id)}`} />, { wrapper: wrap(createMockProvider({ deals: ROWS })) });
    await waitFor(() => expect(screen.getByRole("link", { name: "Harbor" }).getAttribute("href")).toBe("/deals/1"));
    expect(screen.queryByText("Elsewhere")).toBeNull();
    unmount();
    render(<Widget widget={recent} />, { wrapper: wrap(createMockProvider({ deals: [] })) });
    await waitFor(() => expect(screen.getByText("No deals yet")).toBeTruthy());
    expect(screen.getByTestId("widget-recent").getAttribute("data-state")).toBe("empty");
  });

  it("says why it couldn't load, and tries again", async () => {
    const provider = createMockProvider({ deals: ROWS });
    const failing = vi.spyOn(provider, "aggregate").mockRejectedValueOnce(new Error("boom"));
    const open = defineWidget({ id: "open", kind: "number", label: "Open deals", view, live: false });
    render(<Widget widget={open} />, { wrapper: wrap(provider) });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't load this"));
    expect(screen.getByTestId("widget-open").getAttribute("data-state")).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("widget-open").getAttribute("data-state")).toBe("ready"));
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("isn't drawn over a field the viewer can't read, or when its can says no", () => {
    const margin = defineWidget({ id: "margin", kind: "number", label: "Margin", view, metric: { fn: "avg", field: "margin" } });
    const guarded = defineWidget({ id: "g", kind: "number", label: "G", view, can: () => "Admins only" });
    render(
      <>
        <Widget widget={margin} />
        <Widget widget={guarded} refused={(why) => <p>{why}</p>} />
      </>,
      { wrapper: wrap(createMockProvider({ deals: ROWS })) },
    );
    expect(screen.queryByTestId("widget-margin")).toBeNull();
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("sits in a DashboardPage's stat row and a WidgetGrid", async () => {
    const open = defineWidget({ id: "open", kind: "number", label: "Open deals", view, preset: "open", live: false });
    const recent = defineWidget({ id: "recent", kind: "list", label: "Open", view, preset: "open", live: false });
    const { container } = render(
      <DashboardPage title="Sales" stats={<Widget widget={open} />}>
        <WidgetGrid widgets={[{ widget: recent, span: 2 }]} />
      </DashboardPage>,
      { wrapper: wrap(createMockProvider({ deals: ROWS })) },
    );
    await waitFor(() => expect(screen.getByTestId("widget-open").getAttribute("data-state")).toBe("ready"));
    expect(container.querySelector('[data-slot="widget-grid"] [data-slot="widget"]')?.className).toContain("sm:col-span-2");
  });
});

describe("the older tiles draw the one tile", () => {
  it("StatCard, HeadlineNumbers and SummaryCard keep their markup and gain the tile's parts", () => {
    const { container } = render(
      <>
        <StatCard label="Clients" value={42} trend={{ value: 12, label: "vs Q1" }} />
        <HeadlineNumbers numbers={[{ key: "a", label: "Active", value: 7, detail: "up", tone: "positive" }]} />
        <SummaryCard title="Answers" meta="24 responses">
          <p>Body</p>
        </SummaryCard>
      </>,
    );
    const stat = container.querySelector('[data-slot="stat-card"]')!;
    expect(stat.className).toContain("rounded-xl border border-border bg-card p-4");
    expect(stat.querySelector('[data-slot="widget-value"]')?.textContent).toBe("42");
    expect(stat.querySelector('[data-slot="widget-detail"]')?.textContent).toBe("+12% vs Q1");
    const headline = screen.getByTestId("headline-a");
    expect(headline.getAttribute("data-slot")).toBe("headline-number");
    expect(headline.querySelector("dt")?.textContent).toBe("Active");
    expect(headline.querySelector("dd")?.textContent).toBe("7");
    const summary = container.querySelector('[data-slot="summary-card"]')!;
    expect(summary.tagName).toBe("SECTION");
    expect(summary.getAttribute("aria-label")).toBe("Answers");
    expect(summary.querySelector("h3")?.textContent).toBe("Answers");
  });
});
