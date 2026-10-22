import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenesisProvider } from "@marktiderman/genesis-ui/provider";
import { FeatureList } from "../react";
import { features, flags } from "./fixture";

function renderList(props: Partial<Parameters<typeof FeatureList>[0]> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <FeatureList features={features} flags={flags} {...props} />
    </GenesisProvider>,
  );
}

const column = (key: string) => document.querySelector(`[data-kanban-column="${key}"]`) as HTMLElement;

describe("FeatureList", () => {
  it("lists shipping features in the table and keeps planned ones on the roadmap", () => {
    renderList();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Tasks")).toBeTruthy();
    expect(within(table).getByText("Live")).toBeTruthy();
    expect(within(table).queryByText("Billing")).toBeNull();
    const roadmap = screen.getByTestId("feature-roadmap");
    expect(within(roadmap).getByText("Billing")).toBeTruthy();
    expect(within(column("next")).getByText("Billing")).toBeTruthy();
  });

  it("groups features by status on the board", () => {
    renderList({ defaultView: "board", roadmap: false });
    expect(within(column("live")).getByText("Tasks")).toBeTruthy();
    expect(within(column("beta")).getByText("Wins")).toBeTruthy();
    expect(column("planned")).toBeNull();
    expect(within(column("deprecated")).queryByText("Tasks")).toBeNull();
  });

  it("opens a feature's detail with its flags and acceptance from a board card", () => {
    renderList({ defaultView: "board" });
    fireEvent.click(screen.getByRole("button", { name: "Open Wins" }));
    expect(screen.getAllByText("wins.v2, wins.kill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A win shows on the client's ledger.").length).toBeGreaterThan(0);
  });

  it("links repo paths through pathHref", () => {
    renderList({ defaultView: "board", pathHref: (p) => `https://github.com/o/r/blob/main/${p}` });
    fireEvent.click(screen.getByRole("button", { name: "Open Tasks" }));
    const link = screen.getAllByRole("link", { name: "src/tasks.ts" })[0]!;
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/blob/main/src/tasks.ts");
  });

  it("shows only public, shipped features with a tagline in the marketing variant", () => {
    renderList({ variant: "marketing", title: "What it does" });
    const page = screen.getByTestId("feature-marketing");
    expect(within(page).getByText("Never lose a next step.")).toBeTruthy();
    expect(within(page).getByText("Celebrate progress.")).toBeTruthy();
    expect(within(page).getByText("Coaching")).toBeTruthy();
    expect(within(page).queryByText("Billing")).toBeNull();
  });
});
