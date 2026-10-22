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

describe("FeatureList", () => {
  it("lists every feature in the table with its status", () => {
    renderList();
    const table = screen.getByRole("table");
    for (const name of ["Tasks", "Wins", "Billing"]) expect(within(table).getByText(name)).toBeTruthy();
    expect(within(table).getByText("Live")).toBeTruthy();
    expect(within(table).getByText("Planned")).toBeTruthy();
  });

  it("groups features by status on the board", () => {
    renderList({ defaultView: "board" });
    const column = (status: string) => document.querySelector(`[data-kanban-column="${status}"]`) as HTMLElement;
    expect(within(column("live")).getByText("Tasks")).toBeTruthy();
    expect(within(column("beta")).getByText("Wins")).toBeTruthy();
    expect(within(column("planned")).getByText("Billing")).toBeTruthy();
    expect(within(column("building")).queryByText("Tasks")).toBeNull();
  });

  it("opens a feature's detail with its flags from a board card", () => {
    renderList({ defaultView: "board" });
    fireEvent.click(screen.getByRole("button", { name: "Open Wins" }));
    expect(screen.getAllByText("wins_v2, wins_kill").length).toBeGreaterThan(0);
  });

  it("links repo paths through pathHref", () => {
    renderList({ defaultView: "board", pathHref: (p) => `https://github.com/o/r/blob/main/${p}` });
    fireEvent.click(screen.getByRole("button", { name: "Open Tasks" }));
    const link = screen.getAllByRole("link", { name: "src/tasks.ts" })[0]!;
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/blob/main/src/tasks.ts");
  });
});
